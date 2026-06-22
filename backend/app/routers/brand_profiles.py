from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import CurrentUser
from app.models.brand_profile import BrandProfile
from app.schemas.brand_profile import BrandProfileCreate, BrandProfileOut, BrandProfileUpdate

router = APIRouter(prefix="/brand-profiles", tags=["brand-profiles"])


@router.get("/", response_model=list[BrandProfileOut])
async def list_profiles(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(BrandProfile).order_by(BrandProfile.is_default.desc(), BrandProfile.created_at.desc()))
    return result.scalars().all()


@router.post("/", response_model=BrandProfileOut, status_code=201)
async def create_profile(
    body: BrandProfileCreate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if body.is_default:
        await db.execute(
            select(BrandProfile)  # will be used below
        )
        existing = await db.execute(select(BrandProfile).where(BrandProfile.is_default == True))
        for p in existing.scalars().all():
            p.is_default = False

    profile = BrandProfile(**body.model_dump(), created_by=current_user.id)
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return profile


@router.get("/default", response_model=BrandProfileOut | None)
async def get_default_profile(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(BrandProfile).where(BrandProfile.is_default == True))
    return result.scalars().first()


@router.get("/{profile_id}", response_model=BrandProfileOut)
async def get_profile(
    profile_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(BrandProfile).where(BrandProfile.id == profile_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Brand profile not found")
    return profile


@router.patch("/{profile_id}", response_model=BrandProfileOut)
async def update_profile(
    profile_id: UUID,
    body: BrandProfileUpdate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(BrandProfile).where(BrandProfile.id == profile_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Brand profile not found")

    if body.is_default:
        existing = await db.execute(select(BrandProfile).where(BrandProfile.is_default == True))
        for p in existing.scalars().all():
            p.is_default = False

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(profile, field, value)

    await db.commit()
    await db.refresh(profile)
    return profile


@router.delete("/{profile_id}", status_code=204)
async def delete_profile(
    profile_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(BrandProfile).where(BrandProfile.id == profile_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Brand profile not found")
    await db.delete(profile)
    await db.commit()


@router.post("/{profile_id}/set-default", response_model=BrandProfileOut)
async def set_default(
    profile_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    existing = await db.execute(select(BrandProfile).where(BrandProfile.is_default == True))
    for p in existing.scalars().all():
        p.is_default = False

    result = await db.execute(select(BrandProfile).where(BrandProfile.id == profile_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Brand profile not found")
    profile.is_default = True
    await db.commit()
    await db.refresh(profile)
    return profile
