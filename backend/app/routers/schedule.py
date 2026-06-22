from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import CurrentUser
from app.models.platform_account import PlatformAccount
from app.models.scheduled_post import ScheduledPost
from app.schemas.schedule import (
    PlatformAccountCreate, PlatformAccountOut,
    SchedulePostCreate, ScheduledPostOut,
)

router = APIRouter(prefix="/schedule", tags=["schedule"])


# ── Platform Accounts ────────────────────────────────────────────────────────

@router.get("/platform-accounts/", response_model=list[PlatformAccountOut])
async def list_platform_accounts(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(PlatformAccount)
        .where(PlatformAccount.is_active == True)
        .order_by(PlatformAccount.platform, PlatformAccount.account_name)
    )
    return result.scalars().all()


@router.post("/platform-accounts/", response_model=PlatformAccountOut, status_code=201)
async def create_platform_account(
    body: PlatformAccountCreate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    account = PlatformAccount(**body.model_dump(), created_by=current_user.id)
    db.add(account)
    await db.commit()
    await db.refresh(account)
    return account


@router.delete("/platform-accounts/{account_id}", status_code=204)
async def delete_platform_account(
    account_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(PlatformAccount).where(PlatformAccount.id == account_id))
    acct = result.scalar_one_or_none()
    if not acct:
        raise HTTPException(404, "Account not found")
    acct.is_active = False
    await db.commit()


# ── Scheduled Posts ─────────────────────────────────────────────────────────

@router.post("/posts/", response_model=list[ScheduledPostOut], status_code=201)
async def create_scheduled_posts(
    body: SchedulePostCreate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create one scheduled post per selected platform."""
    created = []
    for platform in body.platforms:
        post = ScheduledPost(
            content_job_id=body.content_job_id,
            platform=platform,
            scheduled_at=body.scheduled_at,
            caption=body.caption,
            hashtags=body.hashtags,
            posted_by=current_user.id,
            status="scheduled",
        )
        db.add(post)
        created.append(post)
    await db.commit()
    for p in created:
        await db.refresh(p)
    return created


@router.get("/posts/", response_model=list[ScheduledPostOut])
async def list_scheduled_posts(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    job_id: UUID | None = None,
):
    q = select(ScheduledPost).order_by(ScheduledPost.scheduled_at.asc())
    if job_id:
        q = q.where(ScheduledPost.content_job_id == job_id)
    result = await db.execute(q)
    return result.scalars().all()


@router.delete("/posts/{post_id}", status_code=204)
async def cancel_scheduled_post(
    post_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(ScheduledPost).where(ScheduledPost.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(404, "Scheduled post not found")
    if post.status == "published":
        raise HTTPException(400, "Cannot cancel a published post")
    await db.delete(post)
    await db.commit()
