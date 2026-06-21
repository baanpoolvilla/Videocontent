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
from app.models.analysis import Analysis
from app.models.product import Product
from app.schemas.content_job import ContentJobCreate, ContentJobOut, RenderVersionOut, ScriptOut
from app.services.ai import ai_service
from app.services.tts import tts_service

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


@router.post("/{job_id}/generate-script", response_model=ScriptOut)
async def generate_script(
    job_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    tone_of_voice: str = "",
    cta_style: str = "",
    duration_sec: int = 30,
):
    result = await db.execute(select(ContentJob).where(ContentJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    product_result = await db.execute(select(Product).where(Product.id == job.product_id))
    product = product_result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    analysis_result = await db.execute(
        select(Analysis).where(Analysis.product_id == job.product_id).order_by(Analysis.created_at.desc())
    )
    analysis = analysis_result.scalar_one_or_none()
    if not analysis:
        raise HTTPException(status_code=400, detail="No analysis found — run /analyze first")

    analysis_data = {
        "selling_points": analysis.selling_points or [],
        "target_audience": analysis.target_audience or "",
        "suggested_hooks": analysis.suggested_hooks or [],
        "mood": analysis.mood or "",
    }

    ai_result = await ai_service.generate_script(
        product_name=product.name,
        analysis=analysis_data,
        tone_of_voice=tone_of_voice,
        cta_style=cta_style,
        duration_sec=duration_sec,
    )

    existing = await db.execute(select(Script).where(Script.content_job_id == job_id))
    latest = existing.scalars().all()
    version = len(latest) + 1

    script = Script(
        content_job_id=job_id,
        hook=ai_result["script"].get("hook"),
        body=ai_result["script"].get("body"),
        cta=ai_result["script"].get("cta"),
        full_script=ai_result["script"].get("full_script"),
        version=version,
        model_used=ai_result["model_used"],
        tokens_used=ai_result["tokens_used"],
    )
    db.add(script)
    job.status = "processing"
    await db.commit()
    await db.refresh(script)
    return script


@router.post("/{job_id}/voiceover", response_model=dict)
async def generate_voiceover(
    job_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    script_id: str | None = None,
):
    result = await db.execute(select(ContentJob).where(ContentJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if script_id:
        from uuid import UUID as UUIDType
        script_result = await db.execute(
            select(Script).where(Script.id == UUIDType(script_id), Script.content_job_id == job_id)
        )
    else:
        script_result = await db.execute(
            select(Script).where(Script.content_job_id == job_id).order_by(Script.version.desc())
        )
    script = script_result.scalar_one_or_none()
    if not script:
        raise HTTPException(status_code=400, detail="No script found — run /generate-script first")

    tts_result = await tts_service.generate_voiceover(
        text=script.full_script or "",
        job_id=str(job_id),
    )

    return {
        "job_id": str(job_id),
        "script_id": str(script.id),
        "voiceover_url": tts_result["url"],
        "characters_used": tts_result["characters_used"],
        "voice_id": tts_result["voice_id"],
        "model_id": tts_result["model_id"],
    }


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
