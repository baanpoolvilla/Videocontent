import asyncio
import os
import tempfile
import httpx
from app.services.storage import storage_service

# Output size
OUT_W, OUT_H = 1080, 1920
# Pre-scale size (30% larger for Ken Burns headroom)
PRE_W, PRE_H = int(OUT_W * 1.3), int(OUT_H * 1.3)   # 1404 x 2496

# Scale+crop any image to PRE_W x PRE_H preserving aspect ratio, then Ken Burns
_SCALE_CROP = (
    f"scale={PRE_W}:{PRE_H}:force_original_aspect_ratio=increase,"
    f"crop={PRE_W}:{PRE_H}:(iw-{PRE_W})/2:(ih-{PRE_H})/2"
)

def _kb_zoom_in(d: int) -> str:
    """Zoom in: wide → close-up"""
    return (
        f"{_SCALE_CROP},"
        f"zoompan=z='min(1+0.3*on/{d},1.3)':"
        f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
        f"d={d}:s={OUT_W}x{OUT_H}:fps=25"
    )

def _kb_zoom_out(d: int) -> str:
    """Zoom out: close-up → wide"""
    return (
        f"{_SCALE_CROP},"
        f"zoompan=z='max(1.3-0.3*on/{d},1.0)':"
        f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
        f"d={d}:s={OUT_W}x{OUT_H}:fps=25"
    )

def _kb_pan_left(d: int) -> str:
    """Pan: left edge → right edge at fixed zoom 1.2"""
    z = 1.2
    max_x = int(PRE_W - PRE_W / z)   # max x offset in input space
    return (
        f"{_SCALE_CROP},"
        f"zoompan=z={z}:"
        f"x='min(on*{max_x}/{d},{max_x})':"
        f"y='ih/2-(ih/{z}/2)':"
        f"d={d}:s={OUT_W}x{OUT_H}:fps=25"
    )

def _kb_pan_right(d: int) -> str:
    """Pan: right edge → left edge at fixed zoom 1.2"""
    z = 1.2
    max_x = int(PRE_W - PRE_W / z)
    return (
        f"{_SCALE_CROP},"
        f"zoompan=z={z}:"
        f"x='max({max_x}-on*{max_x}/{d},0)':"
        f"y='ih/2-(ih/{z}/2)':"
        f"d={d}:s={OUT_W}x{OUT_H}:fps=25"
    )


class VideoService:
    async def compose_from_clips(
        self,
        job_id: str,
        clip_urls: list[str],
        voiceover_url: str,
        duration_sec: int = 30,
        logo_url: str = "",
    ) -> dict:
        with tempfile.TemporaryDirectory() as tmpdir:
            clip_paths = []
            for i, url in enumerate(clip_urls):
                p = os.path.join(tmpdir, f"clip_{i}.mp4")
                await self._download_file(url, p)
                clip_paths.append(p)

            concat_file = os.path.join(tmpdir, "concat.txt")
            with open(concat_file, "w") as f:
                for cp in clip_paths:
                    f.write(f"file '{cp}'\n")

            merged = os.path.join(tmpdir, "merged.mp4")
            await self._run_ffmpeg([
                "ffmpeg", "-y",
                "-f", "concat", "-safe", "0", "-i", concat_file,
                "-c", "copy", merged,
            ])

            # optional logo overlay
            logo_path = None
            if logo_url:
                logo_path = os.path.join(tmpdir, "logo.png")
                try:
                    await self._download_file(logo_url, logo_path)
                except Exception:
                    logo_path = None

            output_path = os.path.join(tmpdir, "output.mp4")
            base = merged

            # re-encode with logo if present
            if logo_path:
                base = os.path.join(tmpdir, "with_logo.mp4")
                # scale logo to 15% of video width, place bottom-right with 30px margin + fade in/out
                await self._run_ffmpeg([
                    "ffmpeg", "-y",
                    "-i", merged, "-i", logo_path,
                    "-filter_complex",
                    "[1:v]scale=iw*0.15:-1,format=rgba,colorchannelmixer=aa=0.85[logo];"
                    "[0:v][logo]overlay=W-w-30:H-h-30[v]",
                    "-map", "[v]", "-map", "0:a?",
                    "-c:v", "libx264", "-preset", "fast", "-crf", "20",
                    "-c:a", "copy", "-movflags", "+faststart",
                    base,
                ])

            if voiceover_url:
                audio_path = os.path.join(tmpdir, "audio.mp3")
                await self._download_file(voiceover_url, audio_path)
                await self._run_ffmpeg([
                    "ffmpeg", "-y",
                    "-i", base, "-i", audio_path,
                    "-c:v", "copy", "-c:a", "aac",
                    "-t", str(duration_sec),
                    "-shortest", "-movflags", "+faststart",
                    output_path,
                ])
            else:
                await self._run_ffmpeg([
                    "ffmpeg", "-y", "-i", base,
                    "-c:v", "copy", "-an",
                    "-t", str(duration_sec),
                    "-movflags", "+faststart",
                    output_path,
                ])

            with open(output_path, "rb") as f:
                video_bytes = f.read()

        url = await storage_service.upload_bytes(
            data=video_bytes,
            filename=f"{job_id}_render.mp4",
            content_type="video/mp4",
            bucket="renders",
            prefix=job_id,
        )
        return {"url": url, "size_bytes": len(video_bytes)}

    async def render_video(
        self,
        job_id: str,
        voiceover_url: str,
        image_urls: list[str],
        duration_sec: int = 30,
    ) -> dict:
        with tempfile.TemporaryDirectory() as tmpdir:
            audio_path = None
            if voiceover_url:
                audio_path = os.path.join(tmpdir, "audio.mp3")
                await self._download_file(voiceover_url, audio_path)

            if image_urls:
                image_paths = []
                for i, img_url in enumerate(image_urls[:5]):
                    img_path = os.path.join(tmpdir, f"img_{i}.jpg")
                    await self._download_file(img_url, img_path)
                    image_paths.append(img_path)
                video_path = await self._images_to_video(image_paths, audio_path, tmpdir, duration_sec)
            else:
                video_path = await self._text_to_video(audio_path, tmpdir, duration_sec)

            with open(video_path, "rb") as f:
                video_bytes = f.read()

            url = await storage_service.upload_bytes(
                data=video_bytes,
                filename=f"{job_id}_render.mp4",
                content_type="video/mp4",
                bucket="renders",
                prefix=job_id,
            )
            return {"url": url, "size_bytes": len(video_bytes)}

    async def _download_file(self, url: str, dest: str):
        if url.startswith("/"):
            data = storage_service.download_bytes(url)
            with open(dest, "wb") as f:
                f.write(data)
        else:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                with open(dest, "wb") as f:
                    f.write(resp.content)

    async def _images_to_video(
        self, image_paths: list[str], audio_path: str | None, tmpdir: str, duration_sec: int
    ) -> str:
        output_path = os.path.join(tmpdir, "output.mp4")
        n = len(image_paths)
        per_image = max(2.0, duration_sec / n)
        fps = 25
        d = int(per_image * fps)

        # Ken Burns effect rotates per image
        kb_builders = [_kb_zoom_in, _kb_zoom_out, _kb_pan_left, _kb_pan_right]

        clip_paths = []
        for i, img_path in enumerate(image_paths):
            clip_path = os.path.join(tmpdir, f"clip_{i}.mp4")
            vf = kb_builders[i % len(kb_builders)](d)
            await self._run_ffmpeg([
                "ffmpeg", "-y",
                "-loop", "1", "-i", img_path,
                "-vf", vf,
                "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p",
                "-t", str(per_image),
                clip_path,
            ])
            clip_paths.append(clip_path)

        # Concat clips without re-encode
        concat_file = os.path.join(tmpdir, "concat.txt")
        with open(concat_file, "w") as f:
            for cp in clip_paths:
                f.write(f"file '{cp}'\n")

        merged = os.path.join(tmpdir, "merged.mp4")
        await self._run_ffmpeg([
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0", "-i", concat_file,
            "-c", "copy", merged,
        ])

        # Mix with audio (or video only)
        if audio_path and os.path.exists(audio_path):
            await self._run_ffmpeg([
                "ffmpeg", "-y",
                "-i", merged, "-i", audio_path,
                "-c:v", "copy", "-c:a", "aac",
                "-shortest", "-movflags", "+faststart",
                output_path,
            ])
        else:
            await self._run_ffmpeg([
                "ffmpeg", "-y", "-i", merged,
                "-c:v", "copy", "-an",
                "-movflags", "+faststart",
                output_path,
            ])
        return output_path

    async def _text_to_video(self, audio_path: str, tmpdir: str, duration_sec: int) -> str:
        output_path = os.path.join(tmpdir, "output.mp4")
        await self._run_ffmpeg([
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", f"color=c=black:size={OUT_W}x{OUT_H}:rate=25:duration={duration_sec}",
            "-i", audio_path,
            "-c:v", "libx264", "-c:a", "aac",
            "-shortest", "-movflags", "+faststart",
            output_path,
        ])
        return output_path

    async def _run_ffmpeg(self, cmd: list[str]):
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(f"FFmpeg failed: {stderr.decode()[-600:]}")


video_service = VideoService()
