from typing import Annotated
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import CurrentUser
from app.models.content_job import ContentJob
from app.models.script import Script
from app.models.render_version import RenderVersion
from app.schemas.content_job import ContentJobCreate, ContentJobOut, RenderVersionOut, ScriptOut

router = APIRouter(prefix="/jobs", tags=["content-jobs"])


@router.get("/", response_model=list[ContentJobOut])
async def list_jobs(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    status: str | None = None,
    skip: int = 0,
    limit: int = 50,
):
    query = select(ContentJob)
    if status:
        query = query.where(ContentJob.status == status)
    result = await db.execute(query.offset(skip).limit(limit))
    return result.scalars().all()


@router.post("/", response_model=ContentJobOut, status_code=201)
async def create_job(
    body: ContentJobCreate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    job = ContentJob(**body.model_dump(), created_by=current_user.id)
    db.add(job)
    await db.commit()
    await db.refresh(job)

    # Trigger n8n workflow
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(
                f"{settings.N8N_WEBHOOK_URL}/webhook/content-pipeline",
                json={"job_id": str(job.id), "product_id": str(job.product_id)},
            )
    except Exception:
        pass  # Non-blocking — n8n workflow triggers asynchronously

    return job


@router.get("/{job_id}", response_model=ContentJobOut)
async def get_job(
    job_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(ContentJob).where(ContentJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.get("/{job_id}/scripts", response_model=list[ScriptOut])
async def get_job_scripts(
    job_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(Script).where(Script.content_job_id == job_id))
    return result.scalars().all()


@router.get("/{job_id}/renders", response_model=list[RenderVersionOut])
async def get_job_renders(
    job_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(RenderVersion).where(RenderVersion.content_job_id == job_id))
    return result.scalars().all()


@router.patch("/{job_id}/approve")
async def approve_job(
    job_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(ContentJob).where(ContentJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job.review_status = "approved"
    await db.commit()
    return {"status": "approved"}


@router.patch("/{job_id}/reject")
async def reject_job(
    job_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    comment: str = "",
):
    result = await db.execute(select(ContentJob).where(ContentJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job.review_status = "rejected"
    await db.commit()
    return {"status": "rejected"}
