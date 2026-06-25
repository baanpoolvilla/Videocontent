import asyncio
import json
import logging
import os
import tempfile
import httpx
from app.services.storage import storage_service

logger = logging.getLogger(__name__)

# Output size
OUT_W, OUT_H = 1080, 1920
# Pre-scale size (30% larger for Ken Burns headroom)
PRE_W, PRE_H = int(OUT_W * 1.3), int(OUT_H * 1.3)   # 1404 x 2496

# Crossfade settings for AI clips
FADE_DUR = 0.5          # seconds — dissolve between clips
FADE_TRANSITION = "dissolve"   # xfade transition type

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
    max_x = int(PRE_W - PRE_W / z)
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
        labels: list[str] = [],
    ) -> dict:
        """Compose AI-generated clips into final video with crossfade transitions and optional text labels."""
        with tempfile.TemporaryDirectory() as tmpdir:
            # 1. Download all clips
            clip_paths = []
            for i, url in enumerate(clip_urls):
                p = os.path.join(tmpdir, f"clip_{i}.mp4")
                await self._download_file(url, p)
                clip_paths.append(p)

            # 2. Normalize: same resolution, fps, codec — strip audio (voiceover added later)
            # If label is set for this clip, burn it in as a fade-in/fade-out text overlay (first 3s only)
            norm_paths = []
            for i, cp in enumerate(clip_paths):
                np_ = os.path.join(tmpdir, f"norm_{i}.mp4")
                label = labels[i].strip() if i < len(labels) else ""
                # Sanitize: remove ffmpeg filter special chars
                safe_label = label.replace("'", "").replace("\\", "").replace(":", " ").replace("[", "").replace("]", "").replace(";", "")[:35]

                base_vf = (
                    f"scale={OUT_W}:{OUT_H}:force_original_aspect_ratio=increase,"
                    f"crop={OUT_W}:{OUT_H}"
                )
                if safe_label:
                    # Text fades in 0→0.5s, stays until 2.5s, fades out 2.5→3.0s
                    alpha_expr = "if(lt(t,0.5),(t/0.5),if(lt(t,2.5),1,if(lt(t,3.0),((3.0-t)/0.5),0)))"
                    vf = (
                        f"{base_vf},"
                        f"drawtext=text='{safe_label}'"
                        f":fontsize=52:fontcolor=white"
                        f":x=(w-text_w)/2:y=h*0.82"
                        f":alpha='{alpha_expr}'"
                        f":box=1:boxcolor=black@0.45:boxborderw=14"
                        f":shadowcolor=black@0.7:shadowx=2:shadowy=2"
                    )
                else:
                    vf = base_vf

                await self._run_ffmpeg([
                    "ffmpeg", "-y", "-i", cp,
                    "-vf", vf,
                    "-r", "25",
                    "-c:v", "libx264", "-preset", "fast", "-crf", "18",
                    "-pix_fmt", "yuv420p", "-an",
                    np_,
                ])
                norm_paths.append(np_)
                logger.info(f"[VIDEO] normalized clip {i} label={repr(safe_label)}")

            # 3. Merge with crossfade dissolve between clips
            if len(norm_paths) == 1:
                merged = norm_paths[0]
                logger.info("[VIDEO] single clip — no xfade needed")
            else:
                merged = os.path.join(tmpdir, "merged.mp4")
                durations = [await self._get_duration(p) for p in norm_paths]
                fade_dur = min(FADE_DUR, min(durations) * 0.15)
                logger.info(f"[VIDEO] xfade {len(norm_paths)} clips fade={fade_dur:.2f}s transition={FADE_TRANSITION}")
                await self._xfade_clips(norm_paths, durations, fade_dur, merged)

            # 4. Optional logo overlay
            logo_path = None
            if logo_url:
                logo_path = os.path.join(tmpdir, "logo.png")
                try:
                    await self._download_file(logo_url, logo_path)
                except Exception:
                    logo_path = None

            base = merged
            if logo_path:
                base = os.path.join(tmpdir, "with_logo.mp4")
                await self._run_ffmpeg([
                    "ffmpeg", "-y",
                    "-i", merged, "-i", logo_path,
                    "-filter_complex",
                    "[1:v]scale=iw*0.15:-1,format=rgba,colorchannelmixer=aa=0.85[logo];"
                    "[0:v][logo]overlay=W-w-30:H-h-30[v]",
                    "-map", "[v]", "-map", "0:a?",
                    "-c:v", "libx264", "-preset", "fast", "-crf", "18",
                    "-c:a", "copy", "-movflags", "+faststart",
                    base,
                ])

            # 5. Mix voiceover
            output_path = os.path.join(tmpdir, "output.mp4")
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

    async def remix_audio(self, job_id: str, video_url: str, voiceover_url: str) -> dict:
        """Take existing video file, replace/add audio track — no re-render."""
        logger.info(f"[REMIX] start job={job_id} video={video_url[:60]} audio={voiceover_url[:60] if voiceover_url else 'NONE'}")
        with tempfile.TemporaryDirectory() as tmpdir:
            video_path = os.path.join(tmpdir, "source.mp4")
            await self._download_file(video_url, video_path)
            logger.info(f"[REMIX] video downloaded size={os.path.getsize(video_path)}")

            output_path = os.path.join(tmpdir, "output.mp4")
            if voiceover_url:
                audio_path = os.path.join(tmpdir, "audio.mp3")
                await self._download_file(voiceover_url, audio_path)
                logger.info(f"[REMIX] audio downloaded size={os.path.getsize(audio_path)}")
                await self._run_ffmpeg([
                    "ffmpeg", "-y",
                    "-i", video_path, "-i", audio_path,
                    "-map", "0:v:0",
                    "-map", "1:a:0",
                    "-c:v", "copy", "-c:a", "aac",
                    "-shortest", "-movflags", "+faststart",
                    output_path,
                ])
            else:
                logger.warning(f"[REMIX] no voiceover_url — stripping audio from job={job_id}")
                await self._run_ffmpeg([
                    "ffmpeg", "-y", "-i", video_path,
                    "-map", "0:v:0",
                    "-c:v", "copy", "-an",
                    "-movflags", "+faststart",
                    output_path,
                ])

            with open(output_path, "rb") as f:
                video_bytes = f.read()

        url = await storage_service.upload_bytes(
            data=video_bytes,
            filename=f"{job_id}_remixed.mp4",
            content_type="video/mp4",
            bucket="renders",
            prefix=job_id,
        )
        return {"url": url, "size_bytes": len(video_bytes)}

    async def _get_duration(self, video_path: str) -> float:
        """Get video duration in seconds using ffprobe."""
        proc = await asyncio.create_subprocess_exec(
            "ffprobe", "-v", "quiet",
            "-print_format", "json",
            "-show_streams", video_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        try:
            data = json.loads(stdout)
            for stream in data.get("streams", []):
                if stream.get("codec_type") == "video":
                    return float(stream.get("duration", 5.0))
        except Exception:
            pass
        return 5.0

    async def _xfade_clips(
        self,
        clip_paths: list[str],
        durations: list[float],
        fade_dur: float,
        output: str,
    ):
        """Chain clips with xfade dissolve transition using calculated offsets."""
        n = len(clip_paths)

        inputs = []
        for cp in clip_paths:
            inputs += ["-i", cp]

        # Build chained xfade filter
        # offset[i] = sum(d[0..i]) - (i+1)*fade_dur  (time in the chained stream where transition starts)
        filter_parts = []
        cumulative = 0.0

        for i in range(n - 1):
            cumulative += durations[i]
            offset = max(0.0, cumulative - (i + 1) * fade_dur)

            in_a = "[0:v]" if i == 0 else f"[v{i-1}{i}]"
            in_b = f"[{i+1}:v]"
            out_label = "[vout]" if i == n - 2 else f"[v{i}{i+1}]"

            filter_parts.append(
                f"{in_a}{in_b}xfade=transition={FADE_TRANSITION}"
                f":duration={fade_dur:.3f}:offset={offset:.3f}{out_label}"
            )

        await self._run_ffmpeg([
            "ffmpeg", "-y",
            *inputs,
            "-filter_complex", ";".join(filter_parts),
            "-map", "[vout]",
            "-c:v", "libx264", "-preset", "fast", "-crf", "18",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart",
            output,
        ])

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

        # Crossfade between Ken Burns clips too
        merged = os.path.join(tmpdir, "merged.mp4")
        if len(clip_paths) == 1:
            merged = clip_paths[0]
        else:
            durations = [per_image] * len(clip_paths)
            fade_dur = min(FADE_DUR, per_image * 0.15)
            await self._xfade_clips(clip_paths, durations, fade_dur, merged)

        if audio_path and os.path.exists(audio_path):
            await self._run_ffmpeg([
                "ffmpeg", "-y",
                "-i", merged, "-i", audio_path,
                "-map", "0:v:0", "-map", "1:a:0",
                "-c:v", "copy", "-c:a", "aac",
                "-t", str(duration_sec),
                "-movflags", "+faststart",
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
