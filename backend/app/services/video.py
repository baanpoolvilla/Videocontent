import asyncio
import os
import tempfile
import uuid
import httpx
from app.services.storage import storage_service


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
            minio_url = f"http://{__import__('app.core.config', fromlist=['settings']).settings.MINIO_ENDPOINT}{url}"
        else:
            minio_url = url
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(minio_url)
            resp.raise_for_status()
            with open(dest, "wb") as f:
                f.write(resp.content)

    async def _images_to_video(self, image_paths: list[str], audio_path: str, tmpdir: str, duration_sec: int) -> str:
        output_path = os.path.join(tmpdir, "output.mp4")
        per_image = duration_sec / len(image_paths)

        concat_file = os.path.join(tmpdir, "concat.txt")
        with open(concat_file, "w") as f:
            for img in image_paths:
                f.write(f"file '{img}'\n")
                f.write(f"duration {per_image}\n")
            f.write(f"file '{image_paths[-1]}'\n")

        cmd = [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0", "-i", concat_file,
            "-i", audio_path,
            "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black",
            "-c:v", "libx264", "-c:a", "aac",
            "-shortest", "-movflags", "+faststart",
            output_path,
        ]
        await self._run_ffmpeg(cmd)
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
