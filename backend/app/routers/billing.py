import httpx
import logging
from fastapi import APIRouter
from app.core.config import settings
from app.routers.auth import CurrentUser

router = APIRouter(prefix="/billing", tags=["billing"])
logger = logging.getLogger(__name__)

FAL_CREDIT_URL = "https://rest.alpha.fal.ai/billing/credit"

# Verified fal.ai pricing (USD per clip, 5-second generation)
MODEL_PRICING = {
    "kenburs":       {"usd_per_clip": 0.00,  "label": "Ken Burns (ฟรี)",    "model_id": "ffmpeg"},
    "hailuo2pro":    {"usd_per_clip": 0.49,  "label": "Hailuo 2.3 Pro",     "model_id": "fal-ai/minimax/hailuo-2.3/pro/image-to-video"},
    "kling3s":       {"usd_per_clip": 1.89,  "label": "Kling v3 Standard",  "model_id": "fal-ai/kling-video/v3/standard/image-to-video"},
    "seedance2":     {"usd_per_clip": 2.43,  "label": "Seedance 2.0 Fast",  "model_id": "bytedance/seedance-2.0/fast/image-to-video"},
    "seedance2_pro": {"usd_per_clip": 4.25,  "label": "Seedance 2.0 Pro",   "model_id": "bytedance/seedance-2.0/image-to-video"},
}

THB_PER_USD = 35.0  # approximate exchange rate


@router.get("/fal-balance")
async def get_fal_balance(current_user: CurrentUser):
    """Fetch remaining credit from fal.ai and return with pricing info."""
    balance_usd = None
    error = None

    if settings.FAL_KEY:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(
                    FAL_CREDIT_URL,
                    headers={"Authorization": f"Key {settings.FAL_KEY}"},
                )
                if r.is_success:
                    data = r.json()
                    # fal.ai returns {"balance": X} or {"credit": X}
                    balance_usd = (
                        data.get("balance")
                        or data.get("credit")
                        or data.get("credits")
                        or data.get("amount")
                    )
                    logger.info(f"[BILLING] fal.ai balance={balance_usd} raw={str(data)[:200]}")
                else:
                    error = f"fal.ai API {r.status_code}: {r.text[:200]}"
                    logger.warning(f"[BILLING] {error}")
        except Exception as e:
            error = str(e)
            logger.warning(f"[BILLING] failed to fetch balance: {e}")

    # Build pricing table with THB
    pricing = {}
    for model_id, info in MODEL_PRICING.items():
        usd = info["usd_per_clip"]
        pricing[model_id] = {
            "label":          info["label"],
            "model_id":       info["model_id"],
            "usd_per_clip":   usd,
            "thb_per_clip":   round(usd * THB_PER_USD, 0),
            "usd_per_video":  round(usd * 3, 2),   # 3 clips max
            "thb_per_video":  round(usd * 3 * THB_PER_USD, 0),
        }

    return {
        "balance_usd":  balance_usd,
        "balance_thb":  round(balance_usd * THB_PER_USD, 0) if balance_usd is not None else None,
        "thb_per_usd":  THB_PER_USD,
        "pricing":      pricing,
        "error":        error,
    }
