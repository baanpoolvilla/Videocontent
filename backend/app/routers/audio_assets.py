from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import CurrentUser
from app.models.audio_asset import AudioAsset

router = APIRouter(prefix="/audio-assets", tags=["audio-assets"])


@router.post("/", response_model=dict)
async def save_audio(
    body: dict,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    asset = AudioAsset(
        name=body.get("name", "เสียงพากย์"),
        url=body["url"],
        voice_style=body.get("voice_style"),
        characters_used=body.get("characters_used", 0),
        script_text=body.get("script_text"),
        captions_json=body.get("captions"),
    )
    db.add(asset)
    await db.commit()
    await db.refresh(asset)
    return _fmt(asset)


@router.get("/", response_model=list)
async def list_audio(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(AudioAsset).order_by(AudioAsset.created_at.desc())
    )
    return [_fmt(a) for a in result.scalars().all()]


@router.patch("/{asset_id}", response_model=dict)
async def rename_audio(
    asset_id: UUID,
    body: dict,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(AudioAsset).where(AudioAsset.id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Not found")
    if "name" in body:
        asset.name = body["name"]
    await db.commit()
    await db.refresh(asset)
    return _fmt(asset)


@router.delete("/{asset_id}")
async def delete_audio(
    asset_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(AudioAsset).where(AudioAsset.id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(asset)
    await db.commit()
    return {"deleted": str(asset_id)}


def _fmt(a: AudioAsset) -> dict:
    return {
        "id": str(a.id),
        "name": a.name,
        "url": a.url,
        "voice_style": a.voice_style,
        "characters_used": a.characters_used,
        "script_text": a.script_text,
        "captions": a.captions_json or [],
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }
