from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import CurrentUser
from app.models.content_job import ContentJob
from app.models.product import Product
from app.models.render_version import RenderVersion

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats")
async def get_stats(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    total_products = await db.scalar(select(func.count()).select_from(Product))
    total_jobs = await db.scalar(select(func.count()).select_from(ContentJob))
    completed_jobs = await db.scalar(
        select(func.count()).select_from(ContentJob).where(ContentJob.status == "completed")
    )
    pending_review = await db.scalar(
        select(func.count()).select_from(ContentJob).where(ContentJob.review_status == "review_needed")
    )
    total_renders = await db.scalar(select(func.count()).select_from(RenderVersion))

    return {
        "total_products": total_products,
        "total_jobs": total_jobs,
        "completed_jobs": completed_jobs,
        "pending_review": pending_review,
        "total_renders": total_renders,
    }
