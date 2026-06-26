import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.tts import TTSService, EDGE_VOICE_MAP as VOICE_MAP

router = APIRouter(prefix="/voice", tags=["voice"])
tts_service = TTSService()

VOICE_OPTIONS = [
    {"id": k, "label": k}
    for k in VOICE_MAP
]


class VoiceGenerateRequest(BaseModel):
    text: str
    voice_style: str = "เป็นกันเอง (หญิง)"
    lang: str = "th"


class VoiceGenerateResponse(BaseModel):
    url: str
    characters_used: int
    voice_style: str
    provider: str


@router.get("/voices")
async def list_voices():
    return VOICE_OPTIONS


@router.post("/generate", response_model=VoiceGenerateResponse)
async def generate_voice(req: VoiceGenerateRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="text is required")
    if len(req.text) > 5000:
        raise HTTPException(status_code=400, detail="text must be under 5000 characters")

    job_id = str(uuid.uuid4())
    result = await tts_service.generate_voiceover(
        text=req.text,
        job_id=job_id,
        voice_style=req.voice_style,
        lang=req.lang,
    )

    provider = result.get("model_id", "edge-tts")
    return VoiceGenerateResponse(
        url=result["url"],
        characters_used=result.get("characters_used", len(req.text)),
        voice_style=req.voice_style,
        provider=provider,
    )
