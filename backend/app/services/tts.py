import io
from elevenlabs.client import ElevenLabs
from app.core.config import settings
from app.services.storage import storage_service


VOICE_ID = "21m00Tcm4TlvDq8ikWAM"  # Rachel — multilingual v2 compatible
MODEL_ID = "eleven_multilingual_v2"


class TTSService:
    def __init__(self):
        self.client = ElevenLabs(api_key=settings.ELEVENLABS_API_KEY)

    async def generate_voiceover(self, text: str, job_id: str) -> dict:
        audio = self.client.text_to_speech.convert(
            voice_id=VOICE_ID,
            text=text,
            model_id=MODEL_ID,
            output_format="mp3_44100_128",
        )

        audio_bytes = b"".join(audio)
        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = f"{job_id}_voiceover.mp3"
        audio_file.seek(0)

        from fastapi import UploadFile
        upload = UploadFile(filename=audio_file.name, file=audio_file)
        upload.content_type = "audio/mpeg"

        url = await storage_service.upload(upload, bucket="assets", prefix=f"voiceovers/{job_id}")

        return {
            "url": url,
            "characters_used": len(text),
            "voice_id": VOICE_ID,
            "model_id": MODEL_ID,
        }


tts_service = TTSService()
