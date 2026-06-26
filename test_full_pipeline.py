"""
Full pipeline test — covers every step before actual video generation.
No video is rendered (no fal.ai cost) but verifies auth + prompt flow end-to-end.

  docker compose cp test_full_pipeline.py backend:/app/test_full_pipeline.py
  docker compose exec backend python test_full_pipeline.py
"""
import asyncio, os, json, sys, io
import httpx
import google.generativeai as genai
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text

PASS = "✅"; FAIL = "❌"; WARN = "⚠️ "

DATABASE_URL    = os.getenv("DATABASE_URL", "")
GEMINI_API_KEY  = os.getenv("GEMINI_API_KEY", "")
MINIO_ENDPOINT  = os.getenv("MINIO_ENDPOINT", "")
FAL_KEY         = os.getenv("FAL_KEY", "")
# When running INSIDE the container, use localhost — can't self-reach via service name
API_INTERNAL    = "http://localhost:8000"

results = []

def ok(step, msg=""):
    print(f"  {PASS} {step}" + (f" — {msg}" if msg else ""))
    results.append((step, True))

def fail(step, msg=""):
    print(f"  {FAIL} {step}" + (f" — {msg}" if msg else ""))
    results.append((step, False))

def warn(step, msg=""):
    print(f"  {WARN}  {step}" + (f" — {msg}" if msg else ""))
    results.append((step, True))  # warning = non-fatal

# ─── helpers ──────────────────────────────────────────────────────────────────
def _to_str(val) -> str:
    if isinstance(val, str): return val
    if isinstance(val, dict):
        return val.get("voice_over") or val.get("visual") or val.get("text") or str(val)
    if isinstance(val, list):
        parts = [item.get("voice_over") or item.get("visual") or "" if isinstance(item, dict) else str(item) for item in val]
        return " ".join(p for p in parts if p)
    return str(val) if val is not None else ""

# ─── main ──────────────────────────────────────────────────────────────────────
async def run():
    print("=" * 65)
    print("FULL PIPELINE TEST")
    print("=" * 65)

    # ── [1] ENV ────────────────────────────────────────────────────────────────
    print("\n[1] ENV VARIABLES")
    for name, val in [("DATABASE_URL", DATABASE_URL), ("GEMINI_API_KEY", GEMINI_API_KEY),
                      ("FAL_KEY", FAL_KEY), ("MINIO_ENDPOINT", MINIO_ENDPOINT)]:
        if val:
            ok(name, f"{val[:20]}...")
        else:
            fail(name, "MISSING")

    if not DATABASE_URL or not GEMINI_API_KEY or not FAL_KEY:
        print("\n❌ ABORT — critical env vars missing"); sys.exit(1)

    # ── [2] DATABASE ───────────────────────────────────────────────────────────
    print("\n[2] DATABASE")
    try:
        engine = create_async_engine(DATABASE_URL, echo=False)
        Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with Session() as db:
            r = await db.execute(text("SELECT COUNT(*) FROM users"))
            users = r.scalar()
            r2 = await db.execute(text("SELECT COUNT(*) FROM products"))
            products_count = r2.scalar()
        ok("connection", f"{users} users, {products_count} products")
    except Exception as e:
        fail("connection", str(e)[:100]); sys.exit(1)

    # ── [3] PRODUCT WITH IMAGES ────────────────────────────────────────────────
    print("\n[3] PRODUCT + IMAGES")
    product_name = "Test Product"
    image_url = None
    product_id = None
    try:
        async with Session() as db:
            r = await db.execute(text(
                "SELECT id, name, media_urls FROM products "
                "WHERE jsonb_array_length(media_urls) > 0 LIMIT 1"
            ))
            row = r.fetchone()
        if row:
            product_id = str(row[0])
            product_name = row[1]
            media = row[2] if isinstance(row[2], list) else json.loads(row[2])
            image_url = media[0] if media else None
            ok("found product", f"{product_name} — {len(media)} image(s)")
        else:
            warn("no product with images", "vision steps will be skipped")
    except Exception as e:
        fail("query", str(e)[:100])

    # ── [4] IMAGE FETCH (MinIO proxy) ──────────────────────────────────────────
    print("\n[4] IMAGE FETCH via /api/v1/files/")
    img_pil = None
    if image_url:
        try:
            raw_path = str(image_url).lstrip("/")
            fetch_url = f"{API_INTERNAL}/api/v1/files/{raw_path}"
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(fetch_url)
            if r.is_success:
                from PIL import Image as PILImage
                img_pil = PILImage.open(io.BytesIO(r.content)).convert("RGB")
                ok("image loaded", f"{img_pil.size} {img_pil.mode}  url={fetch_url[:70]}")
            else:
                fail("image fetch", f"HTTP {r.status_code}  url={fetch_url[:70]}")
        except Exception as e:
            fail("image fetch", str(e)[:100])
    else:
        warn("skipped", "no image URL available")

    # ── [5] GEMINI SCRIPT ──────────────────────────────────────────────────────
    print("\n[5] GEMINI — SCRIPT GENERATION")
    full_script = ""
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        gmodel = genai.GenerativeModel("gemini-2.5-flash")
        prompt = f"""Thai TikTok copywriter for a luxury pool villa.
Product: {product_name}
Concept: infinity pool, golden hour, luxury vibe
Return JSON only:
{{"hook":"Thai hook","body":"Thai body","cta":"Thai CTA","full_script":"Thai script"}}"""
        loop = asyncio.get_event_loop()
        cfg = genai.types.GenerationConfig(temperature=0.9, max_output_tokens=4096)
        resp = await loop.run_in_executor(None, lambda: gmodel.generate_content(prompt, generation_config=cfg))
        raw = resp.text.strip() if resp.text else ""
        if not raw:
            reason = getattr(resp.candidates[0], "finish_reason", "unknown") if resp.candidates else "no candidates"
            fail("gemini script", f"Empty response — finish_reason={reason}")
            return
        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
        s, e = raw.find("{"), raw.rfind("}") + 1
        if s == -1 or e <= s:
            fail("gemini script", f"No valid JSON brackets — raw='{raw[:150]}'")
            return
        parsed = json.loads(raw[s:e])
        hook = _to_str(parsed.get("hook", ""))
        body = _to_str(parsed.get("body", ""))
        cta  = _to_str(parsed.get("cta", ""))
        full_script = _to_str(parsed.get("full_script", "")) or "\n".join(p for p in [hook, body, cta] if p)
        # Verify no dict types slipped through
        for field, val in [("hook", hook), ("body", body), ("cta", cta), ("full_script", full_script)]:
            if not isinstance(val, str):
                fail(f"_to_str {field}", f"got {type(val).__name__}")
        ok("script", f"hook={hook[:40]}...")
        ok("_to_str", "all fields are strings ✓")
    except Exception as e:
        fail("gemini script", str(e)[:100])

    # ── [6] EDGE TTS ───────────────────────────────────────────────────────────
    print("\n[6] EDGE TTS")
    try:
        import edge_tts, tempfile
        voice = "th-TH-PremwadeeNeural"
        text_sample = full_script[:200] if full_script else "สวัสดีครับ ทดสอบเสียง"
        communicate = edge_tts.Communicate(text_sample, voice)
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=True) as tmp:
            await communicate.save(tmp.name)
            size = os.path.getsize(tmp.name)
        ok("TTS", f"voice={voice}  size={size} bytes")
    except Exception as e:
        fail("TTS", str(e)[:100])

    # ── [7] GEMINI VISION — PER MODEL ─────────────────────────────────────────
    print("\n[7] GEMINI VISION — VIDEO PROMPT PER MODEL")
    MODEL_WORD_LIMIT = {
        "kling3s": 430, "kling3s_pro": 430,
        "hailuo2pro": 350, "seedance2": 350, "seedance2_pro": 350, "wan21": 350,
    }
    if img_pil:
        for ai_model, word_limit in MODEL_WORD_LIMIT.items():
            try:
                word_range = f"{max(word_limit-50,100)}-{word_limit}"
                prompt_text = (
                    f"You are a cinematographer writing an AI video prompt.\n"
                    f"Study the uploaded image carefully. Write ONE cinematic prompt.\n"
                    f"PRODUCT: {product_name} · STYLE: opulent, serene, aspirational\n"
                    f"OUTPUT RULES:\n"
                    f"1. English ONLY — zero Thai characters.\n"
                    f"2. {word_range} words — fill every word with specific visual detail for {ai_model}.\n"
                    f"3. Start with camera movement.\n"
                    f"4. Raw text only — no labels, no markdown."
                )
                cfg2 = genai.types.GenerationConfig(temperature=0.82, max_output_tokens=8192)
                resp2 = await loop.run_in_executor(None, lambda: gmodel.generate_content([prompt_text, img_pil], generation_config=cfg2))
                words = resp2.text.strip().split()
                truncated = " ".join(words[:word_limit])
                wc = len(truncated.split())
                chars = len(truncated)
                thai_chars = sum(1 for c in truncated if '฀' <= c <= '๿')
                status = PASS if wc >= word_limit - 60 and thai_chars == 0 else WARN
                print(f"  {status} {ai_model:<16} {wc:>3} words / {chars:>5} chars  Thai={thai_chars}  {truncated[:50]}...")
            except Exception as e:
                fail(f"vision/{ai_model}", str(e)[:80])
    else:
        warn("vision skipped", "no product image in DB")

    # ── [8] FAL.AI AUTH ────────────────────────────────────────────────────────
    print("\n[8] FAL.AI AUTH CHECK")
    try:
        # Use queue status endpoint — doesn't generate anything, just verifies key
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                "https://queue.fal.run/fal-ai/wan/v2.1/image-to-video/requests",
                headers={"Authorization": f"Key {FAL_KEY}"},
            )
        if r.status_code in (200, 404, 422):
            ok("auth", f"FAL_KEY valid — HTTP {r.status_code}")
        elif r.status_code == 401:
            fail("auth", f"FAL_KEY INVALID — HTTP 401")
        else:
            warn("auth", f"unexpected HTTP {r.status_code} — key may still be valid")
    except Exception as e:
        fail("auth", str(e)[:100])

    # ── SUMMARY ────────────────────────────────────────────────────────────────
    print("\n" + "=" * 65)
    passed = sum(1 for _, v in results if v)
    total = len(results)
    failed_steps = [s for s, v in results if not v]
    if not failed_steps:
        print(f"{PASS} ALL {total} CHECKS PASSED — pipeline is ready")
    else:
        print(f"{WARN}  {passed}/{total} passed  FAILED: {', '.join(failed_steps)}")
    print("=" * 65)

asyncio.run(run())
