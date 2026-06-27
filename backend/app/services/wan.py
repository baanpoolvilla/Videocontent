import asyncio
import logging
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

FAL_QUEUE = "https://queue.fal.run"

# ─── TO ADD A NEW MODEL ──────────────────────────────────────────────────────
# 1. Add alias → fal.ai path here in MODELS
# 2. If model has a minimum duration, add to MODEL_MIN_DURATION
# 3. Add alias to frontend storyboard/page.tsx MODELS array (with price/label/etc.)
# 4. Add alias to ai.py suggest_video_prompt_from_image model_label dict
# ─────────────────────────────────────────────────────────────────────────────

# Model IDs on fal.ai — key = alias used by frontend, value = fal.ai endpoint path
MODELS = {
    "hailuo2pro":     "fal-ai/minimax/hailuo-2.3/pro/image-to-video",         # $0.49/คลิป — min 6s
    "kling3s":        "fal-ai/kling-video/v3/standard/image-to-video",        # $1.89/คลิป
    "kling3s_pro":    "fal-ai/kling-video/v3/pro/image-to-video",             # $2.88/คลิป
    "seedance2":      "bytedance/seedance-2.0/fast/image-to-video",           # $2.43/คลิป — fast
    "seedance2_pro":  "bytedance/seedance-2.0/image-to-video",                # $4.25/คลิป — pro 4K
    "seedance2_multi":"bytedance/seedance-2.0/reference-to-video",            # multi-image → 1 clip
    "wan21":          "fal-ai/wan/v2.2-a14b/image-to-video/turbo",            # $0.10/คลิป — Wan Turbo
    "kenburs":        "kenburs",                                                # ฟรี — FFmpeg Ken Burns
}

# Minimum duration (seconds) required by each model (fal.ai rejects lower values)
MODEL_MIN_DURATION: dict[str, int] = {
    "fal-ai/minimax/hailuo-2.3/pro/image-to-video": 6,  # Hailuo requires >= 6s
}

# Max prompt characters per model — 90% of documented limit to stay safe
MODEL_PROMPT_CHARS: dict[str, int] = {
    "fal-ai/kling-video/v3/standard/image-to-video":  2400,
    "fal-ai/kling-video/v3/pro/image-to-video":       2400,
    "fal-ai/minimax/hailuo-2.3/pro/image-to-video":   1900,
    "bytedance/seedance-2.0/fast/image-to-video":      1900,
    "bytedance/seedance-2.0/image-to-video":           1900,
    "bytedance/seedance-2.0/reference-to-video":       3800,  # multi-shot prompt is longer
    "fal-ai/wan/v2.2-a14b/image-to-video/turbo":       1900,
}

# Max seconds per single clip generation for each model
MODEL_MAX_DUR_PER_CLIP: dict[str, int] = {
    "fal-ai/kling-video/v3/standard/image-to-video":    10,
    "fal-ai/kling-video/v3/pro/image-to-video":         10,
    "fal-ai/minimax/hailuo-2.3/pro/image-to-video":     10,  # API accepts "6" or "10" only
    "bytedance/seedance-2.0/fast/image-to-video":        15,
    "bytedance/seedance-2.0/image-to-video":             15,
    "bytedance/seedance-2.0/reference-to-video":         15,  # up to 15s for full multi-shot
    "fal-ai/wan/v2.2-a14b/image-to-video/turbo":          5,
}

# Models that accept multiple reference images in one call (Seedance reference-to-video)
MULTI_IMAGE_MODELS = {"bytedance/seedance-2.0/reference-to-video"}

DEFAULT_I2V = MODELS["kling3s"]
DEFAULT_T2V = MODELS["kling3s"]


_CINEMATIC_SUFFIX = ", smooth cinematic motion, high detail, photorealistic, professional videography"
_LUXURY_SUFFIX = ", elegant smooth motion, luxury atmosphere, cinematic lighting, high production value"


class WanService:
    def _headers(self) -> dict:
        return {"Authorization": f"Key {settings.FAL_KEY}", "Content-Type": "application/json"}

    def _enhance_prompt(self, prompt: str, model: str, char_limit: int) -> str:
        """Append quality/style suffix unless prompt is already near the char limit."""
        p = prompt.strip()
        if not p:
            return p
        suffix = _LUXURY_SUFFIX if "kling-video" in model else _CINEMATIC_SUFFIX
        if len(p) + len(suffix) <= char_limit:
            return p + suffix
        return p[:char_limit]

    def _build_payload(self, model: str, image_url: str, prompt: str, dur_int: int, aspect_ratio: str, char_limit: int, end_image_url: str = "") -> dict:
        p = self._enhance_prompt(prompt, model, char_limit)

        if "kling-video" in model:
            # duration must be "5" or "10" (string); API rejects other values
            kling_dur = "10" if dur_int >= 8 else "5"
            payload: dict = {
                "start_image_url": image_url,
                "prompt": p,
                "duration": kling_dur,
                "aspect_ratio": aspect_ratio,
                "cfg_scale": 0.5,
                "negative_prompt": "blur, distort, low quality, watermark, text, signature",
            }
            if end_image_url:
                payload["end_image_url"] = end_image_url
            return payload

        if "wan/v2.2-a14b/image-to-video/turbo" in model:
            num_frames = max(17, min(dur_int * 16, 161))
            payload = {
                "image_url": image_url,
                "prompt": p,
                "num_frames": num_frames,
                "aspect_ratio": aspect_ratio,
                "video_quality": "maximum",
                "resolution": "720p",
            }
            if end_image_url:
                payload["end_image_url"] = end_image_url
            return payload

        if "hailuo" in model:
            # Hailuo accepts duration "6" or "10" only; no end_image_url
            hailuo_dur = "10" if dur_int >= 8 else "6"
            return {"image_url": image_url, "prompt": p, "duration": hailuo_dur, "prompt_optimizer": True}

        if "seedance-2.0/fast" in model:
            # Fast tier: max 1080p resolution
            payload = {
                "image_url": image_url,
                "prompt": p,
                "duration": dur_int,
                "aspect_ratio": aspect_ratio,
                "resolution": "1080p",
            }
            if end_image_url:
                payload["end_image_url"] = end_image_url
            return payload

        # Default: Seedance 2.0 Pro — 4K + high bitrate
        payload = {
            "image_url": image_url,
            "prompt": p,
            "duration": dur_int,
            "aspect_ratio": aspect_ratio,
            "resolution": "4k",
            "bitrate_mode": "high",
        }
        if end_image_url:
            payload["end_image_url"] = end_image_url
        return payload

    async def image_to_video(
        self,
        image_url: str,
        prompt: str,
        aspect_ratio: str = "9:16",
        duration: str = "5",
        model: str = DEFAULT_I2V,
        end_image_url: str = "",
    ) -> dict:
        dur_int = int(duration) if str(duration).isdigit() else 5
        min_dur = MODEL_MIN_DURATION.get(model, 5)
        dur_int = max(dur_int, min_dur)
        char_limit = MODEL_PROMPT_CHARS.get(model, 1900)
        payload = self._build_payload(model, image_url, prompt, dur_int, aspect_ratio, char_limit, end_image_url)
        logger.info(f"[FAL] image_to_video model={model} duration={dur_int}s aspect={aspect_ratio} image={image_url[:60]}")
        logger.info(f"[FAL] end_image_url={'SET' if end_image_url else 'none'}")
        logger.info(f"[FAL] prompt preview: {prompt[:120]}")
        logger.info(f"[FAL] payload keys: {list(payload.keys())}")
        return await self._run(model, payload)

    async def multi_image_to_video(
        self,
        image_urls: list[str],
        prompt: str,
        aspect_ratio: str = "9:16",
        duration: int = 15,
    ) -> dict:
        """Seedance reference-to-video: up to 9 images → 1 AI-generated multi-shot video.
        Tags images as @Image1..@Image9 in the prompt for per-shot control.
        """
        model = MODELS["seedance2_multi"]
        char_limit = MODEL_PROMPT_CHARS.get(model, 3800)

        # Build multi-shot prompt: "Shot 1: @Image1 [prompt]. Shot 2: @Image2 [prompt]..."
        # Each shot references one image; AI creates natural transitions between them
        shot_lines = []
        for i, _ in enumerate(image_urls[:9], start=1):
            cam = [
                "smooth slow dolly forward",
                "gentle pull back revealing",
                "smooth pan right",
                "slow pan left",
                "subtle crane shot descending",
                "gentle zoom in",
            ][(i - 1) % 6]
            shot_lines.append(f"Shot {i}: @Image{i} {cam}, {prompt}")
        multi_prompt = ". ".join(shot_lines)
        enhanced = self._enhance_prompt(multi_prompt, model, char_limit)

        payload = {
            "prompt": enhanced,
            "image_urls": list(image_urls[:9]),
            "duration": min(max(duration, 4), 15),
            "aspect_ratio": aspect_ratio,
            "resolution": "720p",      # reference-to-video max on fal.ai
            "generate_audio": False,   # we mix voiceover ourselves
        }
        logger.info(f"[FAL] multi_image_to_video model={model} images={len(image_urls)} dur={duration}s")
        logger.info(f"[FAL] prompt preview: {enhanced[:200]}")
        return await self._run(model, payload)

    async def text_to_video(
        self,
        prompt: str,
        aspect_ratio: str = "9:16",
        duration: str = "5",
    ) -> dict:
        payload = {
            "prompt": prompt,
            "duration": int(duration) if str(duration).isdigit() else 5,
            "aspect_ratio": aspect_ratio,
        }
        return await self._run(DEFAULT_T2V, payload)

    async def _run(self, model: str, payload: dict) -> dict:
        logger.info(f"[FAL] model={model} key_set={bool(settings.FAL_KEY)}")
        if not settings.FAL_KEY:
            raise RuntimeError("FAL_KEY not configured")

        url = f"{FAL_QUEUE}/{model}"
        logger.info(f"[FAL] POST {url}")

        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(url, headers=self._headers(), json=payload)
            if not r.is_success:
                raise RuntimeError(f"fal.ai submit error {r.status_code}: {r.text[:600]}")
            data = r.json()
            logger.info(f"[FAL] submit response: {str(data)[:300]}")

        request_id = data.get("request_id") or data.get("id")
        if not request_id:
            raise RuntimeError(f"fal.ai did not return request_id: {data}")

        status_url   = data.get("status_url") or f"{FAL_QUEUE}/{model}/requests/{request_id}/status"
        # Use fal.ai's own response_url — constructing it with model path returns 405
        response_url = data.get("response_url") or f"{FAL_QUEUE}/{model}/requests/{request_id}"
        logger.info(f"[FAL] request_id={request_id}")
        logger.info(f"[FAL] status_url={status_url}")
        logger.info(f"[FAL] response_url={response_url}")

        # Poll until COMPLETED (max 5 min) — use ?logs=1 so output is embedded when COMPLETED
        completed_data: dict = {}
        for attempt in range(60):
            await asyncio.sleep(5)
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(status_url + "?logs=1", headers=self._headers())
                if not r.is_success:
                    logger.warning(f"[FAL] status check {r.status_code}: {r.text[:200]}")
                    continue
                status_data = r.json()

            st = status_data.get("status", "")
            logger.info(f"[FAL] attempt {attempt+1} status={st}")
            if st == "COMPLETED":
                completed_data = status_data
                break
            if st in ("FAILED", "ERROR"):
                raise RuntimeError(f"fal.ai generation failed: {status_data}")

        # Try output embedded in status response first (fal.ai includes it when ?logs=1)
        result: dict = {}
        out = completed_data.get("output") or {}
        video_url = (out.get("video") or {}).get("url") or out.get("video_url") or ""
        logger.info(f"[FAL] status output keys: {list(out.keys()) if out else 'empty'}")

        if not video_url:
            # Fall back: fetch from response_url
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(response_url, headers=self._headers())
                if r.is_success:
                    result = r.json()
                else:
                    logger.warning(f"[FAL] result fetch {r.status_code}: {r.text[:200]}")
                    raise RuntimeError(f"fal.ai result error {r.status_code}: {r.text[:200]}")

        if not video_url:
            video_url = (
                (result.get("video") or {}).get("url")
                or result.get("video_url")
                or ""
            )
        logger.info(f"[FAL] done video_url={video_url[:60] if video_url else 'EMPTY'}")
        return {"task_id": request_id, "video_url": video_url, "status": "succeed"}


wan_service = WanService()
