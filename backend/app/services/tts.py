import io
import logging
import tempfile
import os
import httpx
from app.core.config import settings
from app.services.storage import storage_service

logger = logging.getLogger(__name__)

# ElevenLabs voice IDs (multilingual v2 — supports Thai)
ELEVENLABS_VOICE_MAP = {
    "เป็นกันเอง (หญิง)": "21m00Tcm4TlvDq8ikWAM",  # Rachel
    "มืออาชีพ (ชาย)":    "pNInz6obpgDQGcFmaJgB",  # Adam
    "สดใส (หญิง)":       "EXAVITQu4vr4xnSDxMaL",  # Bella
    "หนักแน่น (ชาย)":    "VR6AewLTigWG4xSOukaG",  # Arnold
}

# Edge TTS — Microsoft neural voices, free, Thai-native
EDGE_VOICE_MAP = {
    "หญิง (ไทย)":   "th-TH-PremwadeeNeural",   # natural, warm female
    "ชาย (ไทย)":    "th-TH-NiwatNeural",        # clear, professional male
    "หญิง 2 (ไทย)": "th-TH-AcharaNeural",       # second female option
}

# Default voices per style key (used when caller passes ElevenLabs-style names)
EDGE_STYLE_TO_VOICE = {
    "เป็นกันเอง (หญิง)": "th-TH-PremwadeeNeural",
    "มืออาชีพ (ชาย)":    "th-TH-NiwatNeural",
    "สดใส (หญิง)":       "th-TH-AcharaNeural",
    "หนักแน่น (ชาย)":    "th-TH-NiwatNeural",
    "หญิง (ไทย)":        "th-TH-PremwadeeNeural",
    "ชาย (ไทย)":         "th-TH-NiwatNeural",
    "หญิง 2 (ไทย)":      "th-TH-AcharaNeural",
}


class TTSService:
    async def generate_voiceover(
        self,
        text: str,
        job_id: str,
        voice_style: str = "หญิง (ไทย)",
        lang: str = "th",
    ) -> dict:
        """
        Priority:
          1. ElevenLabs  — if ELEVENLABS_API_KEY set
          2. Edge TTS    — free Microsoft neural Thai voice (default)
          3. gTTS        — last resort fallback
        """
        # Skip ElevenLabs for Thai Edge TTS voices — use Edge TTS directly
        is_thai_voice = voice_style in EDGE_VOICE_MAP or voice_style in EDGE_STYLE_TO_VOICE and EDGE_STYLE_TO_VOICE[voice_style].startswith("th-TH")
        if settings.ELEVENLABS_API_KEY and not is_thai_voice:
            logger.info(f"[TTS] using ElevenLabs voice_style={voice_style}")
            try:
                return await self._elevenlabs(text, job_id, voice_style)
            except Exception as e:
                logger.warning(f"[TTS] ElevenLabs failed ({e}) — falling back to Edge TTS")

        logger.info(f"[TTS] using Edge TTS voice_style={voice_style}")
        try:
            return await self._edge_tts(text, job_id, voice_style)
        except Exception as e:
            logger.warning(f"[TTS] Edge TTS failed ({e}) — falling back to gTTS")
            return await self._gtts(text, job_id, lang)

    async def _edge_tts(self, text: str, job_id: str, voice_style: str) -> dict:
        import edge_tts

        voice = EDGE_STYLE_TO_VOICE.get(voice_style, "th-TH-PremwadeeNeural")
        logger.info(f"[TTS] Edge TTS voice={voice} chars={len(text)}")

        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            tmp_path = tmp.name

        try:
            communicate = edge_tts.Communicate(text, voice)
            await communicate.save(tmp_path)
            with open(tmp_path, "rb") as f:
                audio_bytes = f.read()
        finally:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass

        if not audio_bytes:
            raise RuntimeError("Edge TTS returned empty audio")

        url = await storage_service.upload_bytes(
            data=audio_bytes,
            filename=f"{job_id}_voiceover.mp3",
            content_type="audio/mpeg",
            bucket="assets",
            prefix=f"voiceovers/{job_id}",
        )
        logger.info(f"[TTS] Edge TTS done size={len(audio_bytes)} url={url[:60]}")
        return {"url": url, "characters_used": len(text), "voice_id": voice, "model_id": "edge-tts"}

    async def _elevenlabs(self, text: str, job_id: str, voice_style: str) -> dict:
        voice_id = ELEVENLABS_VOICE_MAP.get(voice_style, "21m00Tcm4TlvDq8ikWAM")
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
                raise RuntimeError(f"ElevenLabs {resp.status_code}: {resp.text[:100]}")
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
        from gtts import gTTS
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
