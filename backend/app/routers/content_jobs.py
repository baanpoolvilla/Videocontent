import asyncio
import logging
from typing import Annotated
from uuid import UUID

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File
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
from app.services.storage import storage_service
from math import ceil
from app.services.wan import wan_service, MODEL_MAX_DUR_PER_CLIP, MULTI_IMAGE_MODELS

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
    result = await db.execute(
        select(RenderVersion)
        .where(RenderVersion.content_job_id == job_id)
        .order_by(RenderVersion.created_at.desc())
    )
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
    scenes: str = "",   # JSON array of scene descriptions, e.g. '["สระน้ำ","ห้องนอน"]'
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

    import json as _json
    scenes_list: list[str] = []
    if scenes:
        try:
            scenes_list = _json.loads(scenes)
        except Exception:
            pass

    ai_result = await ai_service.generate_script(
        product_name=product.name,
        analysis=analysis_data,
        tone_of_voice=tone_of_voice,
        cta_style=cta_style,
        duration_sec=duration_sec,
        concept=concept,
        scenes=scenes_list,
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
    "playful": "playful vibrant colors, energetic movement, pool villa lifestyle",
    "luxury":  "luxury cinematic, golden hour lighting, premium pool villa resort",
    "party":   "party vibes, festive colorful lights, pool party celebration",
    "minimal": "modern sleek architecture, clean lines, elegant pool villa",
}

# Rotating camera movement prefixes — cycle across clips so each clip has unique direction
# Same technique used by Runway, CapCut, Pika to create visual rhythm
_CAMERA_MOVES = [
    "Smooth slow dolly forward,",
    "Gentle pull back revealing,",
    "Smooth pan right,",
    "Slow pan left,",
    "Subtle crane shot descending,",
    "Gentle zoom in,",
]


async def _extract_last_frame(video_url: str, job_id: str, clip_idx: int) -> str:
    """Download video clip, extract last frame, upload to MinIO — used for frame chaining."""
    import tempfile, os
    tmp_video = tmp_frame = ""
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.get(video_url)
            if not r.is_success:
                return ""
        tmp_video = tempfile.mktemp(suffix=".mp4")
        tmp_frame = tempfile.mktemp(suffix=".jpg")
        with open(tmp_video, "wb") as f:
            f.write(r.content)
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-sseof", "-0.5", "-i", tmp_video,
            "-vframes", "1", "-q:v", "2", "-y", tmp_frame,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()
        if not os.path.exists(tmp_frame):
            return ""
        with open(tmp_frame, "rb") as f:
            data = f.read()
        internal_path = await storage_service.upload_bytes(
            data=data,
            filename=f"chain_{clip_idx}.jpg",
            content_type="image/jpeg",
            bucket="renders",
            prefix=str(job_id),
        )
        # upload_bytes returns "/renders/..." — wrap in public proxy URL so fal.ai can fetch it
        public_url = f"{settings.API_BASE_URL}/api/v1/files{internal_path}"
        logger.info(f"[CHAIN] frame extracted clip={clip_idx} url={public_url[:60]}")
        return public_url
    except Exception as e:
        logger.warning(f"[CHAIN] failed clip={clip_idx}: {e}")
        return ""
    finally:
        for p in (tmp_video, tmp_frame):
            try:
                if p and os.path.exists(p):
                    os.unlink(p)
            except Exception:
                pass


async def _do_render(
    job_id: UUID,
    voiceover_url: str,
    duration_sec: int,
    style: str,
    video_prompt: str,
    ai_model: str,
    aspect_ratio: str,
    logo_url: str = "",
    clip_count: int = 0,
):
    import re
    from app.services.wan import MODELS as WAN_MODELS
    fal_model = WAN_MODELS.get(ai_model, WAN_MODELS["kling3s"])
    logger.info(f"[RENDER] START job={job_id} ai_model={ai_model} fal_model={fal_model}")
    # frontend sends "9x16" to avoid URL colon issue — convert back for fal.ai
    aspect_ratio = aspect_ratio.replace("x", ":")
    # Strip Thai characters from video prompt — fal.ai only understands English
    video_prompt = re.sub(r'[฀-๿]+', '', video_prompt).strip()

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
                per_clip_dur = MODEL_MAX_DUR_PER_CLIP.get(fal_model, 5)
                logger.info(f"[RENDER] AI mode ai_model={ai_model} fal_model={fal_model} aspect={aspect_ratio}")

                clip_urls: list[str] = []

                if fal_model in MULTI_IMAGE_MODELS and len(image_urls) > 1:
                    # ─── Seedance Reference-to-Video: all images in ONE API call ───
                    # AI generates natural multi-shot transitions internally (no FFmpeg crossfade needed)
                    pub_urls = [f"{settings.API_BASE_URL}/api/v1/files/{u.strip('/')}" for u in image_urls[:9]]
                    logger.info(f"[RENDER] multi-image mode images={len(pub_urls)} dur={duration_sec}s")
                    try:
                        r = await wan_service.multi_image_to_video(
                            image_urls=pub_urls,
                            prompt=prompt,
                            aspect_ratio=aspect_ratio,
                            duration=min(duration_sec, 15),
                        )
                        clip_url = r.get("video_url", "")
                        if clip_url:
                            clip_urls.append(clip_url)
                    except Exception as ex:
                        logger.warning(f"[RENDER] multi-image failed: {ex} — falling back to chaining")

                if not clip_urls:
                    # ─── Frame chaining + rotating camera movement (Runway/CapCut approach) ───
                    # If fal_model is reference-to-video (multi-image endpoint), fall back to seedance2_pro
                    from app.services.wan import MODELS as WAN_MODELS
                    chain_model = WAN_MODELS["seedance2_pro"] if fal_model in MULTI_IMAGE_MODELS else fal_model
                    chain_per_clip = MODEL_MAX_DUR_PER_CLIP.get(chain_model, 5)
                    n_clips = clip_count if clip_count > 0 else ceil(duration_sec / chain_per_clip)
                    logger.info(f"[RENDER] chaining mode model={chain_model} n_clips={n_clips} per_clip={chain_per_clip}s")
                    chain_url = f"{settings.API_BASE_URL}/api/v1/files/{image_urls[0].strip('/')}"
                    for ci in range(n_clips):
                        next_img = image_urls[(ci + 1) % len(image_urls)]
                        end_url = f"{settings.API_BASE_URL}/api/v1/files/{next_img.strip('/')}" if len(image_urls) > 1 else ""
                        cam = _CAMERA_MOVES[ci % len(_CAMERA_MOVES)]
                        clip_prompt = f"{cam} {prompt}"
                        try:
                            r = await wan_service.image_to_video(
                                image_url=chain_url,
                                prompt=clip_prompt,
                                aspect_ratio=aspect_ratio,
                                duration=str(chain_per_clip),
                                model=chain_model,
                                end_image_url=end_url,
                            )
                            clip_url = r.get("video_url", "")
                            if clip_url:
                                clip_urls.append(clip_url)
                                frame = await _extract_last_frame(clip_url, str(job_id), ci)
                                chain_url = frame or f"{settings.API_BASE_URL}/api/v1/files/{next_img.strip('/')}"
                            else:
                                chain_url = f"{settings.API_BASE_URL}/api/v1/files/{next_img.strip('/')}"
                        except Exception as ex:
                            logger.warning(f"[RENDER] clip {ci} failed: {ex}")
                            chain_url = f"{settings.API_BASE_URL}/api/v1/files/{next_img.strip('/')}"

                if clip_urls:
                    render_result = await video_service.compose_from_clips(
                        job_id=str(job_id),
                        clip_urls=clip_urls,
                        voiceover_url=voiceover_url,
                        duration_sec=duration_sec,
                        logo_url=logo_url,
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
    logo_url: str = "",
    clip_count: int = 0,
):
    result = await db.execute(select(ContentJob).where(ContentJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job.status = "processing"
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
        logo_url=logo_url,
        clip_count=clip_count,
    )

    return {"status": "rendering", "job_id": str(job_id)}


@router.post("/{job_id}/remix-audio", response_model=dict)
async def remix_audio(
    job_id: UUID,
    background_tasks: BackgroundTasks,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    voiceover_url: str = "",
    voice_style: str = "เป็นกันเอง (หญิง)",
    original_vol: float = 0.0,
    voice_vol: float = 1.0,
    audio_offset: float = 0.0,
):
    """Mix new voiceover into the existing rendered video — no fal.ai, no re-render."""
    result = await db.execute(select(ContentJob).where(ContentJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Get latest completed render
    rr = await db.execute(
        select(RenderVersion)
        .where(RenderVersion.content_job_id == job_id, RenderVersion.status == "completed")
        .order_by(RenderVersion.created_at.desc())
    )
    latest_render = rr.scalars().first()
    if not latest_render or not latest_render.final_video_url:
        raise HTTPException(status_code=404, detail="ไม่พบวิดีโอที่ render ไว้ — กรุณา render ก่อน")

    video_url = latest_render.final_video_url
    job.status = "processing"
    await db.commit()

    background_tasks.add_task(
        _do_remix_audio,
        job_id=job_id,
        video_url=video_url,
        voiceover_url=voiceover_url,
        voice_style=voice_style,
        original_vol=original_vol,
        voice_vol=voice_vol,
        audio_offset=audio_offset,
    )
    return {"status": "processing", "job_id": str(job_id), "source_video": video_url}


async def _do_remix_audio(job_id: UUID, video_url: str, voiceover_url: str, voice_style: str, original_vol: float = 0.0, voice_vol: float = 1.0, audio_offset: float = 0.0):
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(select(ContentJob).where(ContentJob.id == job_id))
            job = result.scalar_one_or_none()
            if not job:
                return

            # Generate voiceover if not provided
            if not voiceover_url:
                script_r = await db.execute(
                    select(Script).where(Script.content_job_id == job_id).order_by(Script.version.desc())
                )
                script = script_r.scalars().first()
                text = (script.full_script or "") if script else ""
                if text:
                    vo = await tts_service.generate_voiceover(text, str(job_id), voice_style)
                    voiceover_url = vo.get("url", "")

            render_result = await video_service.remix_audio(
                job_id=str(job_id),
                video_url=video_url,
                voiceover_url=voiceover_url,
                original_vol=original_vol,
                voice_vol=voice_vol,
                audio_offset=audio_offset,
            )

            render = RenderVersion(
                content_job_id=job_id,
                version_label="voice",
                final_video_url=render_result["url"],
                status="completed",
                ffmpeg_config={"provider": "remix-audio"},
            )
            db.add(render)
            job.status = "completed"
            job.review_status = "review_needed"
            await db.commit()
            logger.info(f"[REMIX] done job={job_id} url={render_result['url'][:60]}")

        except Exception as e:
            logger.error(f"[REMIX] failed job={job_id}: {e}")
            try:
                r2 = await db.execute(select(ContentJob).where(ContentJob.id == job_id))
                j2 = r2.scalar_one_or_none()
                if j2:
                    j2.status = "failed"
                    j2.error_message = str(e)[:500]
                    await db.commit()
            except Exception:
                pass


from pydantic import BaseModel as _BM
class _StoryClip(_BM):
    image_index: int = 0
    prompt: str = ""
    duration_sec: int = 5
    label: str = ""     # optional text overlay — shown first 3s of clip, empty = no overlay

class _StoryRequest(_BM):
    clips: list[_StoryClip]
    ai_model: str = "hailuo2pro"
    aspect_ratio: str = "9:16"
    voiceover_url: str = ""

@router.post("/{job_id}/story-render", response_model=dict, status_code=202)
async def story_render(
    job_id: UUID,
    body: _StoryRequest,
    background_tasks: BackgroundTasks,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(ContentJob).where(ContentJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    product_result = await db.execute(select(Product).where(Product.id == job.product_id))
    product = product_result.scalar_one_or_none()
    image_urls = list(product.media_urls or []) if product else []
    job.status = "processing"
    await db.commit()
    background_tasks.add_task(_do_story_render, job_id=job_id, image_urls=image_urls, body=body)
    return {"status": "processing", "job_id": str(job_id), "clips": len(body.clips)}


async def _do_story_render(job_id: UUID, image_urls: list[str], body: _StoryRequest):
    from app.services.wan import MODELS as WAN_MODELS
    import re
    fal_model = WAN_MODELS.get(body.ai_model, WAN_MODELS["hailuo2pro"])
    aspect = body.aspect_ratio.replace("x", ":")

    async with AsyncSessionLocal() as db:
        try:
            clip_urls: list[str] = []

            # ── seedance2_multi: all images in one call, ignore per-clip structure ──
            if fal_model in MULTI_IMAGE_MODELS and image_urls and settings.FAL_KEY:
                pub_urls = [f"{settings.API_BASE_URL}/api/v1/files/{u.strip('/')}" for u in image_urls[:9]]
                combined_prompt = re.sub(r'[฀-๿]+', '', " ".join(s.prompt for s in body.clips if s.prompt)).strip()
                combined_prompt = combined_prompt or _STYLE_PROMPTS.get("luxury", "")
                total_dur = sum(s.duration_sec for s in body.clips)
                logger.info(f"[STORY] multi-image mode images={len(pub_urls)} dur={total_dur}s")
                try:
                    r = await wan_service.multi_image_to_video(
                        image_urls=pub_urls, prompt=combined_prompt,
                        aspect_ratio=aspect, duration=min(total_dur, 15),
                    )
                    clip_url = r.get("video_url", "")
                    if clip_url:
                        clip_urls.append(clip_url)
                except Exception as ex:
                    logger.warning(f"[STORY] multi-image failed: {ex} — falling back to per-clip")

            if not clip_urls:
                # ── Per-clip rendering with frame chaining ──
                clip_model = WAN_MODELS["seedance2_pro"] if fal_model in MULTI_IMAGE_MODELS else fal_model
                chain_url: str = ""
                for ci, slot in enumerate(body.clips):
                    idx = min(slot.image_index, len(image_urls) - 1)
                    img_path = image_urls[idx] if image_urls else ""
                    prompt = re.sub(r'[฀-๿]+', '', slot.prompt).strip() or _STYLE_PROMPTS.get("luxury", "")

                    if body.ai_model != "kenburs" and img_path and settings.FAL_KEY:
                        raw = img_path.strip("/")
                        start_url = chain_url or f"{settings.API_BASE_URL}/api/v1/files/{raw}"
                        next_slot = body.clips[ci + 1] if ci + 1 < len(body.clips) else None
                        if next_slot and image_urls:
                            next_idx = min(next_slot.image_index, len(image_urls) - 1)
                            next_raw = image_urls[next_idx].strip("/")
                            end_url = f"{settings.API_BASE_URL}/api/v1/files/{next_raw}"
                        else:
                            end_url = ""
                        try:
                            result = await wan_service.image_to_video(
                                image_url=start_url,
                                prompt=prompt[:2000],
                                duration=str(slot.duration_sec),
                                aspect_ratio=aspect,
                                model=clip_model,
                                end_image_url=end_url,
                            )
                            clip_url = result["video_url"]
                            clip_urls.append(clip_url)
                            frame = await _extract_last_frame(clip_url, str(job_id), ci)
                            chain_url = frame
                            logger.info(f"[STORY] clip done idx={idx} url={clip_url[:60]}")
                        except Exception as e:
                            logger.warning(f"[STORY] clip failed idx={idx}: {e} — falling back to kenburs")
                            chain_url = ""
                            kb_result = await video_service.render_video(
                                job_id=f"{job_id}_s{idx}",
                                voiceover_url="",
                                image_urls=[img_path],
                                duration_sec=slot.duration_sec,
                            )
                            clip_urls.append(kb_result["url"])
                    else:
                        chain_url = ""
                        kb_result = await video_service.render_video(
                            job_id=f"{job_id}_s{idx}",
                            voiceover_url="",
                            image_urls=[img_path] if img_path else [],
                            duration_sec=slot.duration_sec,
                        )
                        clip_urls.append(kb_result["url"])

            total_dur = sum(s.duration_sec for s in body.clips)
            labels = [s.label for s in body.clips]
            final = await video_service.compose_from_clips(
                job_id=str(job_id),
                clip_urls=clip_urls,
                voiceover_url=body.voiceover_url,
                duration_sec=total_dur,
                labels=labels,
            )

            result2 = await db.execute(select(ContentJob).where(ContentJob.id == job_id))
            job2 = result2.scalar_one_or_none()
            if job2:
                render = RenderVersion(
                    content_job_id=job_id,
                    version_label="story",
                    final_video_url=final["url"],
                    status="completed",
                    ffmpeg_config={"provider": "story", "clips": len(body.clips), "model": body.ai_model},
                )
                db.add(render)
                job2.status = "completed"
                job2.review_status = "review_needed"
                await db.commit()
                logger.info(f"[STORY] done job={job_id} clips={len(clip_urls)} url={final['url'][:60]}")

        except Exception as e:
            logger.error(f"[STORY] failed job={job_id}: {e}")
            try:
                async with AsyncSessionLocal() as db2:
                    r = await db2.execute(select(ContentJob).where(ContentJob.id == job_id))
                    j = r.scalar_one_or_none()
                    if j:
                        j.status = "failed"
                        j.error_message = str(e)[:500]
                        await db2.commit()
            except Exception:
                pass


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
    concept: str = "",
    image_url: str = "",
    ai_model: str = "hailuo2pro",
    slot_index: int = 0,
    total_slots: int = 1,
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

    # Use vision: prefer caller-supplied image_url, then first product image
    # Use INTERNAL URL for Gemini image loading (backend→backend, avoids DNS/HTTPS issues)
    image_urls = list(product.media_urls or []) if product else []
    if not image_url:
        raw = image_urls[0] if image_urls else None
        if raw:
            image_url = f"{settings.API_INTERNAL_URL}/api/v1/files/{raw.strip('/')}"
    logger.info(f"[SUGGEST] image_url={image_url[:80] if image_url else 'NONE'} style={style} model={ai_model}")

    try:
        if image_url:
            video_prompt = await ai_service.suggest_video_prompt_from_image(
                image_url=image_url,
                product_name=product.name if product else "",
                style=style,
                concept=concept,
                ai_model=ai_model,
                slot_index=slot_index,
                total_slots=total_slots,
            )
        else:
            video_prompt = await ai_service.suggest_video_prompt(
                script=script_text,
                product_name=product.name if product else "",
                style=style,
                concept=concept,
            )
    except Exception as _e:
        logger.error(f"[SUGGEST] Gemini failed — falling back to generic prompt: {_e}")
        video_prompt = _STYLE_PROMPTS.get(style, _STYLE_PROMPTS["playful"])

    return {"video_prompt": video_prompt, "style": style, "concept": concept}


@router.post("/{job_id}/ai-storyboard", response_model=dict)
async def ai_storyboard(
    job_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    video_type: str = "รีวิวบ้าน",
    focus: str = "",
    duration_sec: int = 30,
    ai_model: str = "hailuo2pro",
):
    """Generate a complete storyboard plan from 3 user answers — Gemini decides scenes, labels, concepts."""
    result = await db.execute(select(ContentJob).where(ContentJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    product_result = await db.execute(select(Product).where(Product.id == job.product_id))
    product = product_result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    image_urls = list(product.media_urls or [])
    if not image_urls:
        raise HTTPException(status_code=400, detail="Product has no images")
    storyboard = await ai_service.generate_storyboard(
        product_name=product.name,
        image_count=len(image_urls),
        video_type=video_type,
        focus=focus,
        duration_sec=duration_sec,
        ai_model=ai_model,
    )
    return storyboard


@router.post("/{job_id}/upload-audio", response_model=dict)
async def upload_audio(
    job_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
):
    """Upload user's own audio file to use as voiceover — skip ElevenLabs."""
    result = await db.execute(select(ContentJob).where(ContentJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if file is None:
        raise HTTPException(status_code=400, detail="No file uploaded")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    ext = (file.filename or "audio.mp3").rsplit(".", 1)[-1].lower()
    ct = file.content_type or "audio/mpeg"
    url = await storage_service.upload_bytes(
        data=data,
        filename=f"voiceover.{ext}",
        content_type=ct,
        bucket="renders",
        prefix=str(job_id),
    )
    logger.info(f"[UPLOAD-AUDIO] job={job_id} size={len(data)} url={url[:60]}")
    return {"url": url, "filename": file.filename, "size_bytes": len(data)}


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


