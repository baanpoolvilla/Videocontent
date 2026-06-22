from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import CurrentUser
from app.models.product import Product
from app.models.analysis import Analysis
from app.schemas.product import ProductCreate, ProductOut, ProductUpdate
from app.services.storage import storage_service
from app.services.ai import ai_service

router = APIRouter(prefix="/products", tags=["products"])


@router.get("/", response_model=list[ProductOut])
async def list_products(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    skip: int = 0,
    limit: int = 50,
):
    result = await db.execute(select(Product).offset(skip).limit(limit))
    return result.scalars().all()


@router.post("/", response_model=ProductOut, status_code=201)
async def create_product(
    body: ProductCreate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    product = Product(**body.model_dump(exclude={"metadata"}), metadata_=body.metadata, created_by=current_user.id)
    db.add(product)
    await db.commit()
    await db.refresh(product)
    return product


@router.get("/{product_id}", response_model=ProductOut)
async def get_product(
    product_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.patch("/{product_id}", response_model=ProductOut)
async def update_product(
    product_id: UUID,
    body: ProductUpdate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(product, field, value)
    await db.commit()
    await db.refresh(product)
    return product


@router.delete("/{product_id}", status_code=204)
async def delete_product(
    product_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    await db.delete(product)
    await db.commit()


@router.get("/{product_id}/analysis", response_model=dict)
async def get_latest_analysis(
    product_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(Analysis)
        .where(Analysis.product_id == product_id)
        .order_by(Analysis.created_at.desc())
    )
    analysis = result.scalars().first()
    if not analysis:
        return {}
    return {
        "analysis_id": str(analysis.id),
        "key_features": analysis.key_features or [],
        "selling_points": analysis.selling_points or [],
        "target_audience": analysis.target_audience or "",
        "mood": analysis.mood or "",
        "suggested_hooks": analysis.suggested_hooks or [],
        "model_used": analysis.model_used or "",
        "tokens_used": analysis.tokens_used,
        "created_at": analysis.created_at.isoformat() if analysis.created_at else None,
    }


@router.post("/{product_id}/analyze", response_model=dict)
async def analyze_product(
    product_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    ai_result = await ai_service.analyze_product(
        product_name=product.name,
        description=product.description or "",
    )

    analysis = Analysis(
        product_id=product.id,
        model_used=ai_result["model_used"],
        raw_response=ai_result["analysis"],
        key_features=ai_result["analysis"].get("key_features"),
        selling_points=ai_result["analysis"].get("selling_points"),
        target_audience=ai_result["analysis"].get("target_audience"),
        mood=ai_result["analysis"].get("mood"),
        suggested_hooks=ai_result["analysis"].get("suggested_hooks"),
        tokens_used=ai_result["tokens_used"],
    )
    db.add(analysis)
    await db.commit()
    await db.refresh(analysis)

    return {
        "analysis_id": str(analysis.id),
        "product_id": str(product_id),
        **ai_result["analysis"],
        "tokens_used": ai_result["tokens_used"],
        "model_used": ai_result["model_used"],
    }


@router.post("/{product_id}/upload", response_model=dict)
async def upload_product_media(
    product_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
):
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    url = await storage_service.upload(file, bucket="products", prefix=str(product_id))
    product.media_urls = [*product.media_urls, url]
    await db.commit()
    return {"url": url}
