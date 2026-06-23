import asyncio
import logging
from typing import Annotated
from uuid import UUID

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db, AsyncSessionLocal
from app.core.deps import CurrentUser

logger = logging.getLogger(__name__)
from app.models.brand_profile import BrandProfile
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
from app.services.wan import wan_service

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
    query = query.order_by(ContentJob.created_at.desc())
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


@router.delete("/{job_id}", status_code=204)
async def delete_job(
    job_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(ContentJob).where(ContentJob.id == job_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Job not found")
    try:
        # Use SQL-level DELETE so ondelete="CASCADE" on FK fires automatically
        await db.execute(sa_delete(ContentJob).where(ContentJob.id == job_id))
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Delete failed: {e}")


@router.get("/{job_id}/scripts", response_model=list[ScriptOut])
async def get_job_scripts(
    job_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(Script).where(Script.content_job_id == job_id))
    return result.scalars().all()


@router.patch("/{job_id}/scripts/{script_id}", response_model=ScriptOut)
async def update_script(
    job_id: UUID,
    script_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    hook: str | None = None,
    body: str | None = None,
    cta: str | None = None,
    full_script: str | None = None,
    is_approved: bool | None = None,
    reviewer_notes: str | None = None,
):
    result = await db.execute(
        select(Script).where(Script.id == script_id, Script.content_job_id == job_id)
    )
    script = result.scalar_one_or_none()
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")
    if hook is not None:          script.hook = hook
    if body is not None:          script.body = body
    if cta is not None:           script.cta = cta
    if full_script is not None:   script.full_script = full_script
    if is_approved is not None:   script.is_approved = is_approved
    if reviewer_notes is not None: script.reviewer_notes = reviewer_notes
    await db.commit()
    await db.refresh(script)
    return script


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
    concept: str = "",
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
    analysis = analysis_result.scalars().first()
    if not analysis:
        raise HTTPException(status_code=400, detail="No analysis found — run /analyze first")

    # Auto-fill tone/cta from default brand profile when not explicitly passed
    if not tone_of_voice or not cta_style:
        bp_result = await db.execute(select(BrandProfile).where(BrandProfile.is_default == True))
        brand = bp_result.scalars().first()
        if brand:
            if not tone_of_voice and brand.tone_of_voice:
                tone_of_voice = brand.tone_of_voice
            if not cta_style and brand.cta_style:
                cta_style = brand.cta_style

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
        concept=concept,
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
    voice_style: str = "เป็นกันเอง (หญิง)",
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
    script = script_result.scalars().first()
    if not script:
        raise HTTPException(status_code=400, detail="No script found — run /generate-script first")

    try:
        tts_result = await tts_service.generate_voiceover(
            text=script.full_script or "",
            job_id=str(job_id),
            voice_style=voice_style,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS failed: {e}")

    return {
        "job_id": str(job_id),
        "script_id": str(script.id),
        "voiceover_url": tts_result["url"],
        "characters_used": tts_result["characters_used"],
        "voice_id": tts_result["voice_id"],
        "model_id": tts_result["model_id"],
    }


_STYLE_PROMPTS = {
    "playful": "playful animated overlay, vibrant colors, energetic motion, pool villa",
    "luxury":  "luxury cinematic, slow elegant motion, golden hour lighting, premium pool villa",
    "party":   "party vibes, dynamic movement, festive colorful lights, pool party",
    "minimal": "minimal clean motion, smooth transitions, modern sleek, pool villa",
}


async def _do_render(
    job_id: UUID,
    voiceover_url: str,
    duration_sec: int,
    style: str,
    video_prompt: str,
    ai_model: str,
    aspect_ratio: str,
):
    from app.services.wan import MODELS as WAN_MODELS
    fal_model = WAN_MODELS.get(ai_model, WAN_MODELS["kling3s"])

    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(select(ContentJob).where(ContentJob.id == job_id))
            job = result.scalar_one_or_none()
            if not job:
                return

            product_result = await db.execute(select(Product).where(Product.id == job.product_id))
            product = product_result.scalar_one_or_none()
            image_urls = list(product.media_urls or []) if product else []
            provider = "ffmpeg-kenburs"

            if settings.FAL_KEY and image_urls and ai_model != "kenburs":
                prompt = video_prompt.strip() or _STYLE_PROMPTS.get(style, _STYLE_PROMPTS["playful"])
                n_clips = min(len(image_urls), 3)
                images_to_use = [image_urls[i % len(image_urls)] for i in range(n_clips)]

                async def _gen_clip(img_path: str) -> str:
                    raw = img_path.strip("/")
                    public_url = f"{settings.API_BASE_URL}/api/v1/files/{raw}"
                    try:
                        r = await wan_service.image_to_video(
                            image_url=public_url,
                            prompt=prompt,
                            aspect_ratio=aspect_ratio,
                            duration="5",
                            model=fal_model,
                        )
                        return r.get("video_url", "")
                    except Exception as ex:
                        logger.warning(f"[RENDER] clip failed: {ex}")
                        return ""

                clip_urls_raw = await asyncio.gather(*[_gen_clip(img) for img in images_to_use])
                clip_urls = [u for u in clip_urls_raw if u]

                if clip_urls:
                    render_result = await video_service.compose_from_clips(
                        job_id=str(job_id),
                        clip_urls=clip_urls,
                        voiceover_url=voiceover_url,
                        duration_sec=duration_sec,
                    )
                    provider = ai_model
                else:
                    logger.warning("[RENDER] all AI clips failed — falling back to Ken Burns")
                    render_result = await video_service.render_video(
                        job_id=str(job_id),
                        voiceover_url=voiceover_url,
                        image_urls=image_urls,
                        duration_sec=duration_sec,
                    )
            else:
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
                ffmpeg_config={"duration_sec": duration_sec, "images": len(image_urls), "provider": provider},
            )
            db.add(render)
            job.status = "completed"
            job.review_status = "review_needed"
            await db.commit()
            logger.info(f"[RENDER] done job={job_id} provider={provider} url={render_result['url'][:60]}")

        except Exception as e:
            logger.error(f"[RENDER] failed job={job_id}: {e}")
            try:
                result2 = await db.execute(select(ContentJob).where(ContentJob.id == job_id))
                job2 = result2.scalar_one_or_none()
                if job2:
                    job2.status = "failed"
                    job2.error_message = str(e)[:500]
                    await db.commit()
            except Exception:
                pass


@router.post("/{job_id}/render", response_model=dict, status_code=202)
async def render_video(
    job_id: UUID,
    background_tasks: BackgroundTasks,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    voiceover_url: str = "",
    duration_sec: int = 30,
    style: str = "playful",
    video_prompt: str = "",
    ai_model: str = "kling3s",
    aspect_ratio: str = "9x16",
):
    result = await db.execute(select(ContentJob).where(ContentJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job.status = "rendering"
    await db.commit()

    background_tasks.add_task(
        _do_render,
        job_id=job_id,
        voiceover_url=voiceover_url,
        duration_sec=duration_sec,
        style=style,
        video_prompt=video_prompt,
        ai_model=ai_model,
        aspect_ratio=aspect_ratio,
    )

    return {"status": "rendering", "job_id": str(job_id)}


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
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

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


@router.get("/{job_id}/suggest-video-prompt", response_model=dict)
async def suggest_video_prompt(
    job_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    style: str = "playful",
):
    result = await db.execute(select(ContentJob).where(ContentJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    product_result = await db.execute(select(Product).where(Product.id == job.product_id))
    product = product_result.scalar_one_or_none()

    script_result = await db.execute(
        select(Script).where(Script.content_job_id == job_id).order_by(Script.version.desc())
    )
    script = script_result.scalars().first()
    script_text = script.full_script if script else ""

    try:
        video_prompt = await ai_service.suggest_video_prompt(
            script=script_text,
            product_name=product.name if product else "",
            style=style,
        )
    except Exception:
        video_prompt = _STYLE_PROMPTS.get(style, _STYLE_PROMPTS["playful"])

    return {"video_prompt": video_prompt, "style": style}


@router.post("/{job_id}/wan-render", response_model=dict)
async def wan_render(
    job_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    prompt: str = "",
    aspect_ratio: str = "9:16",
    duration: str = "5",
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
        script = script_result.scalars().first()
        prompt = script.hook if script and script.hook else (product.name if product else "")

    image_urls = list(product.media_urls or []) if product else []

    try:
        if image_urls:
            # Build publicly accessible URL via backend file proxy
            raw = image_urls[0].strip("/")
            img_public = f"{settings.API_BASE_URL}/api/v1/files/{raw}"
            wan_result = await wan_service.image_to_video(
                image_url=img_public,
                prompt=prompt,
                aspect_ratio=aspect_ratio,
                duration=duration,
            )
        else:
            wan_result = await wan_service.text_to_video(
                prompt=prompt,
                aspect_ratio=aspect_ratio,
                duration=duration,
            )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    render = RenderVersion(
        content_job_id=job_id,
        version_label="seedance2-v1",
        final_video_url=wan_result.get("video_url"),
        status="completed" if wan_result.get("video_url") else "processing",
        ffmpeg_config={"provider": "seedance2-fal", "prompt": prompt},
    )
    db.add(render)
    job.status = "completed"
    job.review_status = "review_needed"
    await db.commit()
    await db.refresh(render)

    return {
        "render_id": str(render.id),
        "job_id": str(job_id),
        "video_url": wan_result.get("video_url", ""),
        "status": "completed",
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


@router.get("/{job_id}/renders", response_model=list[RenderVersionOut])
async def list_renders(
    job_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(RenderVersion)
        .where(RenderVersion.content_job_id == job_id)
        .order_by(RenderVersion.created_at.desc())
    )
    return result.scalars().all()
