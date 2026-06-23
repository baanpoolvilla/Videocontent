import asyncio
import os
import tempfile
import uuid
import httpx
from app.services.storage import storage_service


# Ken Burns presets — alternate per image for visual variety
_KB_EFFECTS = [
    # zoom in from center
    "scale=1296:2304,zoompan=z='min(zoom+0.0012,1.2)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={d}:s=1080x1920:fps=25",
    # pan left-to-right at slight zoom
    "scale=1296:2304,zoompan=z=1.15:x='if(gte(on,1),x+1.0,0)':y='ih/2-(ih/zoom/2)':d={d}:s=1080x1920:fps=25",
    # zoom out from top
    "scale=1296:2304,zoompan=z='if(lte(zoom,1.0),1.2,max(1.001,zoom-0.0012))':x='iw/2-(iw/zoom/2)':y='0':d={d}:s=1080x1920:fps=25",
    # pan right-to-left
    "scale=1296:2304,zoompan=z=1.15:x='if(gte(on,1),x-1.0,iw-ow)':y='ih/2-(ih/zoom/2)':d={d}:s=1080x1920:fps=25",
]


class VideoService:
    async def render_video(
        self,
        job_id: str,
        voiceover_url: str,
        image_urls: list[str],
        duration_sec: int = 30,
    ) -> dict:
        with tempfile.TemporaryDirectory() as tmpdir:
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
        self, image_paths: list[str], audio_path: str, tmpdir: str, duration_sec: int
    ) -> str:
        output_path = os.path.join(tmpdir, "output.mp4")
        n = len(image_paths)
        per_image = max(2.0, duration_sec / n)
        fps = 25
        d = int(per_image * fps)

        # Create individual Ken Burns clips per image
        clip_paths = []
        for i, img_path in enumerate(image_paths):
            clip_path = os.path.join(tmpdir, f"clip_{i}.mp4")
            vf = _KB_EFFECTS[i % len(_KB_EFFECTS)].format(d=d)
            cmd = [
                "ffmpeg", "-y",
                "-loop", "1", "-i", img_path,
                "-vf", vf,
                "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p",
                "-t", str(per_image),
                clip_path,
            ]
            await self._run_ffmpeg(cmd)
            clip_paths.append(clip_path)

        # Concatenate all clips (no re-encode)
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

        # Mix with audio
        await self._run_ffmpeg([
            "ffmpeg", "-y",
            "-i", merged, "-i", audio_path,
            "-c:v", "copy", "-c:a", "aac",
            "-shortest", "-movflags", "+faststart",
            output_path,
        ])
        return output_path

    async def _text_to_video(self, audio_path: str, tmpdir: str, duration_sec: int) -> str:
        output_path = os.path.join(tmpdir, "output.mp4")
        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", f"color=c=black:size=1080x1920:rate=25:duration={duration_sec}",
            "-i", audio_path,
            "-c:v", "libx264", "-c:a", "aac",
            "-shortest", "-movflags", "+faststart",
            output_path,
        ]
        await self._run_ffmpeg(cmd)
        return output_path

    async def _run_ffmpeg(self, cmd: list[str]):
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(f"FFmpeg failed: {stderr.decode()[-500:]}")


video_service = VideoService()
