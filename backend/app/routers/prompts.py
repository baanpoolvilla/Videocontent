from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import CurrentUser
from app.models.prompt_template import PromptTemplate
from app.schemas.prompt_template import PromptTemplateCreate, PromptTemplateOut, PromptTemplateUpdate

router = APIRouter(prefix="/prompts", tags=["prompts"])


@router.get("/", response_model=list[PromptTemplateOut])
async def list_prompts(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(PromptTemplate).order_by(PromptTemplate.is_active.desc(), PromptTemplate.created_at.desc())
    )
    return result.scalars().all()


@router.post("/", response_model=PromptTemplateOut, status_code=201)
async def create_prompt(
    body: PromptTemplateCreate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    pt = PromptTemplate(**body.model_dump(), created_by=current_user.id)
    db.add(pt)
    await db.commit()
    await db.refresh(pt)
    return pt


@router.patch("/{prompt_id}", response_model=PromptTemplateOut)
async def update_prompt(
    prompt_id: UUID,
    body: PromptTemplateUpdate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(PromptTemplate).where(PromptTemplate.id == prompt_id))
    pt = result.scalar_one_or_none()
    if not pt:
        raise HTTPException(404, "Prompt not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(pt, field, value)
    await db.commit()
    await db.refresh(pt)
    return pt


@router.delete("/{prompt_id}", status_code=204)
async def delete_prompt(
    prompt_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(PromptTemplate).where(PromptTemplate.id == prompt_id))
    pt = result.scalar_one_or_none()
    if not pt:
        raise HTTPException(404, "Prompt not found")
    await db.delete(pt)
    await db.commit()
