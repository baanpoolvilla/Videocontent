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
from app.services.video import video_service
from app.services.kling import kling_service

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


@router.post("/{job_id}/render", response_model=dict)
async def render_video(
    job_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    voiceover_url: str = "",
    duration_sec: int = 30,
):
    result = await db.execute(select(ContentJob).where(ContentJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    product_result = await db.execute(select(Product).where(Product.id == job.product_id))
    product = product_result.scalar_one_or_none()

    image_urls = list(product.media_urls or []) if product else []

    render_result = await video_service.render_video(
        job_id=str(job_id),
        voiceover_url=voiceover_url,
        image_urls=image_urls,
        duration_sec=duration_sec,
    )

    render = RenderVersion(
        content_job_id=job_id,
        version_label="v1",
        final_video_url=render_result["url"],
        status="completed",
        ffmpeg_config={"duration_sec": duration_sec, "images": len(image_urls)},
    )
    db.add(render)
    job.status = "completed"
    job.review_status = "review_needed"
    await db.commit()
    await db.refresh(render)

    return {
        "render_id": str(render.id),
        "job_id": str(job_id),
        "video_url": render_result["url"],
        "size_bytes": render_result["size_bytes"],
        "status": "completed",
    }


@router.post("/{job_id}/kling-render", response_model=dict)
async def kling_render(
    job_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    prompt: str = "",
    duration: str = "5",
    aspect_ratio: str = "9:16",
):
    result = await db.execute(select(ContentJob).where(ContentJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    product_result = await db.execute(select(Product).where(Product.id == job.product_id))
    product = product_result.scalar_one_or_none()

    if not prompt:
        script_result = await db.execute(
            select(Script).where(Script.content_job_id == job_id).order_by(Script.version.desc())
        )
        script = script_result.scalar_one_or_none()
        prompt = script.hook if script and script.hook else (product.name if product else "")

    image_urls = list(product.media_urls or []) if product else []

    try:
        if image_urls:
            kling_result = await kling_service.image_to_video(
                image_url=image_urls[0],
                prompt=prompt,
                duration=duration,
                aspect_ratio=aspect_ratio,
            )
            task_type = "image2video"
        else:
            kling_result = await kling_service.text_to_video(
                prompt=prompt,
                duration=duration,
                aspect_ratio=aspect_ratio,
            )
            task_type = "text2video"
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    render = RenderVersion(
        content_job_id=job_id,
        version_label="kling-v1",
        kling_task_id=kling_result["task_id"],
        kling_status="processing",
        status="processing",
        ffmpeg_config={"task_type": task_type, "prompt": prompt},
    )
    db.add(render)
    await db.commit()
    await db.refresh(render)

    return {
        "render_id": str(render.id),
        "job_id": str(job_id),
        "task_id": kling_result["task_id"],
        "status": "processing",
        "message": "Kling AI กำลังสร้างวิดีโอ ใช้ /kling-status เพื่อเช็คผล",
    }


@router.get("/{job_id}/kling-status/{task_id}", response_model=dict)
async def kling_status(
    job_id: UUID,
    task_id: str,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    task_type: str = "image2video",
):
    status_result = await kling_service.get_task_status(task_id, task_type)

    if status_result["status"] == "succeed" and status_result["video_url"]:
        render_result = await db.execute(
            select(RenderVersion).where(
                RenderVersion.content_job_id == job_id,
                RenderVersion.kling_task_id == task_id,
            )
        )
        render = render_result.scalar_one_or_none()
        if render:
            render.kling_status = "succeed"
            render.final_video_url = status_result["video_url"]
            render.status = "completed"
            job_result = await db.execute(select(ContentJob).where(ContentJob.id == job_id))
            job = job_result.scalar_one_or_none()
            if job:
                job.status = "completed"
                job.review_status = "review_needed"
            await db.commit()

    return status_result


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
