from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import make_asgi_app

from app.core.config import settings
from app.routers import auth, brand_profiles, content_jobs, dashboard, files, products

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    docs_url=f"{settings.API_PREFIX}/docs",
    redoc_url=f"{settings.API_PREFIX}/redoc",
    openapi_url=f"{settings.API_PREFIX}/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Prometheus metrics endpoint
metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)

# Routers
app.include_router(auth.router, prefix=settings.API_PREFIX)
app.include_router(products.router, prefix=settings.API_PREFIX)
app.include_router(content_jobs.router, prefix=settings.API_PREFIX)
app.include_router(dashboard.router, prefix=settings.API_PREFIX)
app.include_router(files.router, prefix=settings.API_PREFIX)
app.include_router(brand_profiles.router, prefix=settings.API_PREFIX)


@app.get("/health")
async def health():
    return {"status": "ok", "version": settings.VERSION}
