from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import CurrentUser
from app.models.asset import Asset
from app.schemas.asset import AssetOut
from app.services.storage import storage_service

router = APIRouter(prefix="/assets", tags=["assets"])

ALLOWED_TYPES = {
    "image": ["image/jpeg", "image/png", "image/webp", "image/gif"],
    "video": ["video/mp4", "video/quicktime", "video/webm"],
    "audio": ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4"],
    "logo":  ["image/jpeg", "image/png", "image/webp", "image/svg+xml"],
    "overlay": ["image/png", "image/webp"],
    "intro": ["video/mp4", "video/quicktime"],
    "outro": ["video/mp4", "video/quicktime"],
}


@router.get("/", response_model=list[AssetOut])
async def list_assets(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    asset_type: str | None = None,
):
    q = select(Asset).order_by(Asset.created_at.desc())
    if asset_type:
        q = q.where(Asset.asset_type == asset_type)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/upload", response_model=AssetOut, status_code=201)
async def upload_asset(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
    asset_type: str = Form("image"),
    name: str = Form(""),
):
    content = await file.read()
    await file.seek(0)

    asset_name = name.strip() or (file.filename or "untitled")

    url = await storage_service.upload(file, bucket="assets", prefix=asset_type)

    asset = Asset(
        name=asset_name,
        asset_type=asset_type,
        url=url,
        bucket="assets",
        size_bytes=len(content),
        mime_type=file.content_type,
        created_by=current_user.id,
    )
    db.add(asset)
    await db.commit()
    await db.refresh(asset)
    return asset


@router.delete("/{asset_id}", status_code=204)
async def delete_asset(
    asset_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")
    await db.delete(asset)
    await db.commit()
