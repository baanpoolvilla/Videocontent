"""
Mock backend — ไม่ต้องใช้ database เลย
รัน: python mock_backend.py
"""
import uuid
from fastapi import FastAPI, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

app = FastAPI(title="AI Content Pipeline — Mock")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── In-memory stores ─────────────────────────────────────────────────────────

FAKE_TOKEN = "mock-jwt-token-no-auth-needed"

products_db: list[dict] = [
    {"id": str(uuid.uuid4()), "name": "เซรั่มหน้าใส 30ml", "description": "Niacinamide 10% ลดรอยสิว", "category": "สกินแคร์", "price": 890.0, "media_urls": []},
    {"id": str(uuid.uuid4()), "name": "หูฟังไร้สาย X2", "description": "ไร้สาย 40 ชั่วโมง ตัดเสียงรบกวน", "category": "อิเล็กทรอนิกส์", "price": 2490.0, "media_urls": []},
    {"id": str(uuid.uuid4()), "name": "กระเป๋าหนัง Mini", "description": "หนังแท้ ทนทาน สีดำคลาสสิก", "category": "แฟชั่น", "price": 3200.0, "media_urls": []},
    {"id": str(uuid.uuid4()), "name": "ขวดน้ำ Smart Bottle", "description": "บอกอุณหภูมิได้ 500ml", "category": "ไลฟ์สไตล์", "price": 650.0, "media_urls": []},
]

jobs_db: list[dict] = [
    {"id": str(uuid.uuid4()), "product_id": products_db[0]["id"], "status": "completed", "review_status": "approved", "platform": "tiktok", "error_message": None, "retry_count": 0, "created_by": "admin"},
    {"id": str(uuid.uuid4()), "product_id": products_db[1]["id"], "status": "processing", "review_status": "draft", "platform": "instagram", "error_message": None, "retry_count": 0, "created_by": "admin"},
    {"id": str(uuid.uuid4()), "product_id": products_db[2]["id"], "status": "completed", "review_status": "review_needed", "platform": "youtube_shorts", "error_message": None, "retry_count": 0, "created_by": "admin"},
    {"id": str(uuid.uuid4()), "product_id": products_db[3]["id"], "status": "failed", "review_status": "draft", "platform": "tiktok", "error_message": "เสียงไม่ตรงไฟล์", "retry_count": 2, "created_by": "admin"},
]

# ─── Auth ─────────────────────────────────────────────────────────────────────

@app.post("/api/v1/auth/login")
async def login(username: str = Form(...), password: str = Form(...)):
    # ยอมรับทุก credential ใน mock
    return {
        "access_token": FAKE_TOKEN,
        "refresh_token": "mock-refresh-token",
        "token_type": "bearer",
    }

# ─── Dashboard ────────────────────────────────────────────────────────────────

@app.get("/api/v1/dashboard/stats")
async def dashboard_stats():
    return {
        "total_products": len(products_db),
        "total_jobs": len(jobs_db),
        "completed_jobs": sum(1 for j in jobs_db if j["status"] == "completed"),
        "pending_review": sum(1 for j in jobs_db if j["review_status"] == "review_needed"),
        "total_renders": len(jobs_db) * 3,
    }

# ─── Products ─────────────────────────────────────────────────────────────────

@app.get("/api/v1/products/")
async def list_products():
    return products_db

class ProductCreate(BaseModel):
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = None

@app.post("/api/v1/products/")
async def create_product(body: ProductCreate):
    new = {
        "id": str(uuid.uuid4()),
        "name": body.name,
        "description": body.description,
        "category": body.category,
        "price": body.price,
        "media_urls": [],
    }
    products_db.insert(0, new)
    return new

@app.get("/api/v1/products/{product_id}")
async def get_product(product_id: str):
    for p in products_db:
        if p["id"] == product_id:
            return p
    raise HTTPException(status_code=404, detail="Product not found")

# ─── Jobs ─────────────────────────────────────────────────────────────────────

@app.get("/api/v1/jobs/")
async def list_jobs():
    return jobs_db

@app.patch("/api/v1/jobs/{job_id}/approve")
async def approve_job(job_id: str):
    for j in jobs_db:
        if j["id"] == job_id:
            j["review_status"] = "approved"
            return j
    raise HTTPException(status_code=404, detail="Job not found")

@app.patch("/api/v1/jobs/{job_id}/reject")
async def reject_job(job_id: str):
    for j in jobs_db:
        if j["id"] == job_id:
            j["review_status"] = "rejected"
            return j
    raise HTTPException(status_code=404, detail="Job not found")

# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "mode": "mock — no database"}

# ─── Run ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    print("\n✦  Mock Backend — AI Content Pipeline")
    print("   http://localhost:8000")
    print("   http://localhost:8000/api/v1/docs  ← Swagger UI\n")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="warning")
