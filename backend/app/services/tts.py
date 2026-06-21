import io
from gtts import gTTS
from app.services.storage import storage_service


class TTSService:
    async def generate_voiceover(self, text: str, job_id: str, lang: str = "th") -> dict:
        tts = gTTS(text=text, lang=lang, slow=False)

        audio_buffer = io.BytesIO()
        tts.write_to_fp(audio_buffer)
        audio_bytes = audio_buffer.getvalue()

        url = await storage_service.upload_bytes(
            data=audio_bytes,
            filename=f"{job_id}_voiceover.mp3",
            content_type="audio/mpeg",
            bucket="assets",
            prefix=f"voiceovers/{job_id}",
        )

        return {
            "url": url,
            "characters_used": len(text),
            "voice_id": "gtts-th",
            "model_id": "google-tts",
        }


tts_service = TTSService()
