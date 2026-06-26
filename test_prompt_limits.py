"""
Test per-model prompt word limits — verifies Gemini writes the correct length per model.
Run: docker compose exec backend python test_prompt_limits.py
"""
import asyncio, os, sys
import google.generativeai as genai

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
if not GEMINI_API_KEY:
    print("❌ GEMINI_API_KEY not set"); sys.exit(1)

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel("gemini-2.5-flash")

# Same dict as ai.py — what we expect
MODEL_WORD_LIMIT = {
    "kling3s":       430,
    "kling3s_pro":   430,
    "hailuo2pro":    350,
    "seedance2":     350,
    "seedance2_pro": 350,
    "wan21":         350,
}

CONCEPT = "luxury infinity pool at golden hour, ultra-slow motion water ripple"
PRODUCT = "Pool Villa Pattaya Party"

async def test_model(ai_model: str, word_limit: int):
    word_range = f"{max(word_limit - 50, 100)}-{word_limit}"

    prompt_text = (
        f"You are a cinematographer writing an AI video prompt.\n"
        f"Write ONE cinematic prompt for a luxury pool villa scene.\n\n"
        f"PRODUCT: {PRODUCT} · STYLE: opulent, serene, aspirational\n"
        f"CONCEPT: {CONCEPT}\n"
        f"OUTPUT RULES:\n"
        f"1. English ONLY — zero Thai characters.\n"
        f"2. {word_range} words — fill every word with specific visual detail for {ai_model}.\n"
        f"3. Start with camera movement.\n"
        f"4. Raw text only — no labels, no markdown."
    )

    loop = asyncio.get_event_loop()
    config = genai.types.GenerationConfig(temperature=0.82, max_output_tokens=8192)
    resp = await loop.run_in_executor(
        None, lambda: model.generate_content(prompt_text, generation_config=config)
    )
    raw = resp.text.strip()
    words = raw.split()
    # Apply same truncation as ai.py
    truncated = " ".join(words[:word_limit])
    word_count = len(truncated.split())

    ok = word_count >= (word_limit - 60)  # within 60 words of target
    status = "✅" if ok else "⚠️ "
    print(f"  {status} {ai_model:<16} target={word_limit:>3} words  got={word_count:>3} words  chars={len(truncated):>5}  preview: {' '.join(words[:8])}...")
    return ok

async def main():
    print("=" * 70)
    print("PER-MODEL PROMPT LIMIT TEST")
    print("=" * 70)
    print(f"\nConcept: \"{CONCEPT}\"\n")

    results = []
    for ai_model, word_limit in MODEL_WORD_LIMIT.items():
        ok = await test_model(ai_model, word_limit)
        results.append(ok)

    print("\n" + "=" * 70)
    passed = sum(results)
    total = len(results)
    if passed == total:
        print(f"✅ ALL {total} MODELS PASSED")
    else:
        print(f"⚠️  {passed}/{total} passed — check warnings above")
    print("=" * 70)

asyncio.run(main())
