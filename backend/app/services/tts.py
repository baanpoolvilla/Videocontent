import io
import logging
import httpx
from gtts import gTTS
from app.core.config import settings
from app.services.storage import storage_service

logger = logging.getLogger(__name__)

# ElevenLabs voice IDs (multilingual v2 — all support Thai)
VOICE_MAP = {
    "เป็นกันเอง (หญิง)": "21m00Tcm4TlvDq8ikWAM",  # Rachel
    "มืออาชีพ (ชาย)":    "pNInz6obpgDQGcFmaJgB",  # Adam
    "สดใส (หญิง)":       "EXAVITQu4vr4xnSDxMaL",  # Bella
    "หนักแน่น (ชาย)":    "VR6AewLTigWG4xSOukaG",  # Arnold
}


class TTSService:
    async def generate_voiceover(
        self, text: str, job_id: str,
        voice_style: str = "เป็นกันเอง (หญิง)",
        lang: str = "th",
    ) -> dict:
        logger.info(f"[TTS] elevenlabs_key={'set' if settings.ELEVENLABS_API_KEY else 'NOT SET'} voice_style={voice_style}")
        if settings.ELEVENLABS_API_KEY:
            return await self._elevenlabs(text, job_id, voice_style)
        logger.warning("[TTS] No ElevenLabs key — using gTTS fallback (lower quality)")
        return await self._gtts(text, job_id, lang)

    async def _elevenlabs(self, text: str, job_id: str, voice_style: str) -> dict:
        voice_id = VOICE_MAP.get(voice_style, "21m00Tcm4TlvDq8ikWAM")
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
                headers={"xi-api-key": settings.ELEVENLABS_API_KEY, "Content-Type": "application/json"},
                json={
                    "text": text,
                    "model_id": "eleven_multilingual_v2",
                    "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
                },
            )
            if not resp.is_success:
                # Fall back to gTTS on any ElevenLabs billing/quota error
                return await self._gtts(text, job_id, "th")
            audio_bytes = resp.content

        url = await storage_service.upload_bytes(
            data=audio_bytes,
            filename=f"{job_id}_voiceover.mp3",
            content_type="audio/mpeg",
            bucket="assets",
            prefix=f"voiceovers/{job_id}",
        )
        return {"url": url, "characters_used": len(text), "voice_id": voice_id, "model_id": "eleven_multilingual_v2"}

    async def _gtts(self, text: str, job_id: str, lang: str) -> dict:
        tts = gTTS(text=text, lang=lang, slow=False)
        buf = io.BytesIO()
        tts.write_to_fp(buf)
        audio_bytes = buf.getvalue()
        url = await storage_service.upload_bytes(
            data=audio_bytes,
            filename=f"{job_id}_voiceover.mp3",
            content_type="audio/mpeg",
            bucket="assets",
            prefix=f"voiceovers/{job_id}",
        )
        return {"url": url, "characters_used": len(text), "voice_id": "gtts-th", "model_id": "google-tts"}


tts_service = TTSService()
