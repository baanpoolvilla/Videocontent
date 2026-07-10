import io
import json
import re
import logging
import httpx
import google.generativeai as genai
import openai
from PIL import Image
from pydantic import BaseModel
from app.core.config import settings

logger = logging.getLogger(__name__)


class _ScriptSchema(BaseModel):
    hook: str
    body: str
    cta: str
    full_script: str
    beats: list[str]
    title_card: str
    beat_overlays: list[str]


class _StyleSchema(BaseModel):
    style: str
    reasoning: str


STYLE_DESCRIPTIONS = {
    "warm": "Bright, punchy, saturated Ken Burns grade — safe default for general products, food, everyday items.",
    "editorial": "Dark, moody, desaturated high-contrast grade with a serif title card — luxury real estate, upscale interiors, premium fashion.",
    "prime": "Bright, warm, sunlit grade with an animated title card — pool villas, resorts, daytime outdoor property showcases.",
    "midnight": "Very dark, crushed-black, cool-toned grade with a centered champagne-gold title card — beauty/skincare, spa, premium personal care, nightlife.",
    "tv_shopping": "Punchy, boosted-saturation grade with a hot-pink background pill behind bold white text — online sellers, flash sales, impulse-buy retail, loud promotional offers.",
}


def _clean_spoken_text(text: str) -> str:
    """Strip markdown formatting and director's stage-direction notes that Gemini sometimes
    embeds directly in hook/body/cta/full_script — this text gets read aloud by TTS, so
    labels like "**Hook (5 วินาที):**" or "(ภาพ: ...)" must not survive into it."""
    if not text:
        return text
    # Section header labels, with or without markdown bold, e.g. "**Hook (ประมาณ 5 วินาที):**"
    text = re.sub(
        r'\*{0,2}\s*(Hook|Body|CTA|เนื้อหา|บทนำ|บทสรุป|สคริปต์)\s*\([^)]{0,40}\)\s*:?\s*\*{0,2}',
        '', text, flags=re.IGNORECASE,
    )
    # Parenthetical stage/visual/audio directions, e.g. "(ภาพ: ...)" "(เสียง: ...)"
    text = re.sub(
        r'\((?:ภาพ|เสียง|เพลง|Visual|Audio|SFX|Music|VO|Scene)\s*[:：][^)]*\)',
        '', text, flags=re.IGNORECASE,
    )
    # Same labels when NOT wrapped in parens — a bare "เสียง: ..." prefix before the actual line
    text = re.sub(
        r'(?:^|\n)\s*(?:ภาพ|เสียง|เพลง|Visual|Audio|VO|Scene)\s*[:：]\s*',
        lambda m: "\n" if m.group(0).startswith("\n") else "",
        text, flags=re.IGNORECASE,
    )
    # Any remaining markdown bold/italic markers — unwrap, keep the inner text
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'(?<!\*)\*([^*\n]+?)\*(?!\*)', r'\1', text)
    # Collapse extra whitespace left behind by the removals
    text = re.sub(r'[ \t]{2,}', ' ', text)
    text = re.sub(r'\n{2,}', '\n', text)
    return text.strip()


def _clean_prompt(text: str) -> str:
    """Remove Thai chars and all quotation-mark variants using integer code-point checks.
    No literal Thai or curly-quote characters appear in this source file."""
    out = []
    for ch in text:
        cp = ord(ch)
        if 0x0E00 <= cp <= 0x0E7F:
            continue
        if cp in (0x201C, 0x201D, 0x2018, 0x2019, 0x22, 0x27, 0x60):
            continue
        out.append(ch)
    return "".join(out).strip()


# Tone → cinematic keywords injected into every video prompt
TONE_CINEMATIC: dict[str, dict[str, str]] = {
    "หรู พรีเมียม ซีเนมาติก": {
        "camera":   "slow dolly-in",
        "lighting": "golden hour, motivated rim light, warm fill",
        "optics":   "85mm portrait lens, f/1.8 shallow bokeh, anamorphic lens flare",
        "grade":    "teal-and-orange color grade, Arri Alexa color science, subtle film grain",
        "feel":     "luxury resort campaign, Four Seasons editorial, aspirational",
    },
    "ผ่อนคลาย พักผ่อน ชวนมาเที่ยว": {
        "camera":   "gentle floating drift",
        "lighting": "soft warm afternoon sun, dappled light through palm fronds",
        "optics":   "35mm wide, soft vignette, sun flare",
        "grade":    "warm tropical palette, turquoise-and-sand tones, sun-bleached highlights",
        "feel":     "vacation lifestyle, Booking.com hero shot, breezy and inviting",
    },
    "สนุก มีชีวิตชีวา เชิญชวน": {
        "camera":   "energetic tracking shot, low angle",
        "lighting": "bright midday sun, high key, vibrant saturation",
        "optics":   "24mm wide, motion blur accents",
        "grade":    "punchy saturated colors, vivid pop, high contrast highlights",
        "feel":     "W Hotel pool party, celebratory, dynamic energy",
    },
    "มืออาชีพ กระชับ ข้อมูลครบ": {
        "camera":   "steady crane reveal",
        "lighting": "soft diffused overcast light, clean neutral exposure",
        "optics":   "24mm wide, sharp throughout frame, no distortion",
        "grade":    "neutral color grade, clean whites, architectural precision",
        "feel":     "property development reel, real estate showcase, confident",
    },
    "อบอุ่น เป็นกันเอง เชิญชวน": {
        "camera":   "handheld gentle drift",
        "lighting": "warm practical lights, candlelight warmth, golden hour glow",
        "optics":   "50mm natural perspective, creamy bokeh",
        "grade":    "warm amber tones, lifted shadows, intimate feel",
        "feel":     "boutique hotel lifestyle, Airbnb editorial, welcoming",
    },
    "เล่าเรื่อง อารมณ์ ความรู้สึก": {
        "camera":   "slow pan reveal",
        "lighting": "moody directional light, deep shadows, single motivated key",
        "optics":   "35mm f/1.4, selective focus, shallow depth layers",
        "grade":    "desaturated shadows, cinematic crush, contemplative palette",
        "feel":     "travel documentary, emotional brand film, evocative",
    },
}

_DEFAULT_TONE = {
    "camera":   "slow dolly-in",
    "lighting": "golden hour, soft rim light",
    "optics":   "85mm, shallow bokeh",
    "grade":    "cinematic color grade, film grain",
    "feel":     "luxury resort campaign",
}


class AIService:
    def __init__(self):
        genai.configure(api_key=settings.GEMINI_API_KEY)
        self.model = genai.GenerativeModel("gemini-2.5-flash")
        self.model_name = "gemini-2.5-flash"
        self.openai_client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)

    async def _generate(self, prompt: str, system: str = "", temperature: float = 0.7) -> str:
        import asyncio
        config = genai.types.GenerationConfig(temperature=temperature, max_output_tokens=8192)
        full_prompt = f"{system}\n\n{prompt}" if system else prompt
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None, lambda: self.model.generate_content(full_prompt, generation_config=config)
        )
        return response.text.strip()

    async def _load_image(self, url: str) -> Image.Image | None:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(url)
                if r.is_success:
                    return Image.open(io.BytesIO(r.content))
        except Exception as e:
            logger.warning(f"[AI] failed to load image {url}: {e}")
        return None

    async def suggest_video_prompt_from_image(
        self,
        image_url: str,
        product_name: str,
        style: str = "playful",
        concept: str = "",
        ai_model: str = "hailuo2pro",
        slot_index: int = 0,
        total_slots: int = 1,
        tone: str = "",
    ) -> str:
        """
        If user supplied a concept → translate it to English + add cinematic language (no image needed).
        If no concept → use Gemini Vision on the product image to write a cinematic prompt.
        """
        # ── Load image for visual context ────────────────────────────────────
        img = await self._load_image(image_url)
        if img is None:
            return await self.suggest_video_prompt("", product_name, style, concept)

        style_feel = {
            "luxury":  "opulent, serene, aspirational — Four Seasons campaign",
            "party":   "euphoric, electric, FOMO-inducing — W Hotel pool party",
            "minimal": "calm, architectural, premium — Muji/Aesop campaign",
            "playful": "fun, inviting, vacation-ready — Booking.com hero shot",
        }.get(style, "premium cinematic luxury resort")

        # Tone-specific cinematic keywords from user's dropdown selection
        tc = TONE_CINEMATIC.get(tone, _DEFAULT_TONE)
        tone_block = (
            f"\nCINEMATIC STYLE (user-selected tone — apply these EXACTLY):\n"
            f"  Camera move : {tc['camera']}\n"
            f"  Lighting    : {tc['lighting']}\n"
            f"  Optics      : {tc['optics']}\n"
            f"  Color grade : {tc['grade']}\n"
            f"  Overall feel: {tc['feel']}\n"
        )

        # Per-model word targets — 90% of each model's char limit (~5 chars/word)
        model_word_limit = {
            "kling3s":        430,   # 2500 chars × 90% ÷ 5
            "kling3s_pro":    430,
            "hailuo2pro":     350,   # 2000 chars × 90% ÷ 5
            "seedance2":      350,
            "seedance2_pro":  350,
            "seedance2_multi":350,   # per-slot limit; combined prompt is assembled by backend
            "wan21":          350,
            "kenburs":        150,
        }
        word_limit = model_word_limit.get(ai_model, 350)
        word_range = f"{max(word_limit - 50, 100)}-{word_limit}"

        # Step 3 for adding a new model: add an entry here describing what makes it tick
        model_guide = {
            "hailuo2pro": (
                "Hailuo 2.3 Pro by Minimax. "
                "STRENGTHS: ultra-smooth motion, gorgeous atmospheric lighting, silky bokeh. "
                "POWER KEYWORDS: ultra-slow motion, golden hour, soft bokeh, dreamy atmosphere, "
                "water shimmer, gentle breeze, luminous glow, cinematic flow. "
                "AVOID: fast cuts, jarring motion, too many simultaneous subjects."
            ),
            "kling3s": (
                "Kling v3 Standard by Kuaishou. "
                "STRENGTHS: follows prompts precisely, photorealistic, handles complex scenes. "
                "POWER KEYWORDS: photorealistic, 8K detail, sharp foreground, dynamic camera, "
                "natural physics, film grain, precise motion. "
                "STRATEGY: be specific — Kling rewards exact descriptions."
            ),
            "kling3s_pro": (
                "Kling v3 Pro by Kuaishou (studio-grade tier). "
                "STRENGTHS: handles complex motion masterfully, highest Kling quality. "
                "POWER KEYWORDS: anamorphic lens, 85mm portrait, f/1.4 bokeh, tack sharp, "
                "cinematic color science, award-winning cinematography, complex scene. "
                "PUSH FOR: maximum technical precision — focal length, aperture feel, lighting setup."
            ),
            "seedance2": (
                "Seedance 2.0 Turbo by ByteDance. "
                "STRENGTHS: natural outdoor motion, tropical/lifestyle scenes, fast generation. "
                "POWER KEYWORDS: natural motion, organic movement, outdoor lifestyle, tropical warmth, "
                "water movement, foliage sway, leisure, vacation mood. "
                "AVOID: overly technical language — keep it vivid and naturalistic."
            ),
            "seedance2_pro": (
                "Seedance 2.0 Standard by ByteDance (highest quality). "
                "STRENGTHS: cinematic naturalism + luxury lifestyle, best ByteDance output. "
                "POWER KEYWORDS: award-winning cinematography, resort editorial, aspirational, "
                "magazine quality, hero shot, luxury lifestyle, premium feel. "
                "COMBINE: cinematic language with natural motion."
            ),
            "wan21": (
                "Wan 2.2 Turbo by Alibaba. "
                "STRENGTHS: follows detailed scene descriptions closely, versatile, layered compositions. "
                "POWER KEYWORDS: layered composition, foreground detail, depth layers, "
                "specific motion, background depth, cinematic scene. "
                "STRATEGY: describe in layers — foreground, midground, background, then motion and light."
            ),
            "seedance2_multi": (
                "Seedance 2.0 Reference-to-Video by ByteDance (multi-image, one video). "
                "STRENGTHS: AI weaves multiple images into a single seamless video with natural shot transitions. "
                "POWER KEYWORDS: seamless transition, multi-angle showcase, natural scene flow, "
                "lifestyle journey, cinematic reveal, premium resort narrative. "
                "STRATEGY: write a vivid single-scene description — backend will combine all slot prompts "
                "into one multi-shot sequence. Focus on mood and motion rather than shot structure."
            ),
            "kenburs": "FFmpeg Ken Burns — static zoom/pan only, prompt is ignored.",
        }.get(ai_model, "AI image-to-video model")

        # Story arc — each clip knows its narrative role in the sequence
        if total_slots > 1:
            pct = slot_index / max(total_slots - 1, 1)
            if slot_index == 0:
                role = (
                    "OPENING CLIP — Wide establishing shot. Reveal the property, draw the viewer in. "
                    "Use a dramatic camera move to introduce scale and atmosphere. First impressions matter."
                )
            elif slot_index == total_slots - 1:
                role = (
                    "CLOSING CLIP — Emotional final moment. Slow pull-back, intimate detail, "
                    "or golden-hour hero shot. Leave the viewer wanting to be there."
                )
            elif pct < 0.4:
                role = (
                    "EXPLORATION CLIP — Continue from the opening. Show a different zone or angle. "
                    "Transition smoothly — maintain the same time of day and atmosphere."
                )
            elif pct < 0.7:
                role = (
                    "FEATURE CLIP — Spotlight the standout element visible in this image. "
                    "This is the centrepiece moment — make it memorable."
                )
            else:
                role = (
                    "ATMOSPHERE CLIP — Shift into mood and sensory detail. Golden light, "
                    "gentle motion, intimate textures. Build emotion toward the closing shot."
                )

            story_block = (
                f"\nSTORY POSITION: Clip {slot_index + 1} of {total_slots} in a connected property showcase.\n"
                f"YOUR ROLE: {role}\n"
                f"CONTINUITY (all clips must feel like one film):\n"
                f"- Same time of day across all clips (commit to golden hour OR blue hour OR midday)\n"
                f"- Match color temperature and emotional tone\n"
                f"- Camera direction should feel like a natural continuation from the previous clip\n"
            )
        else:
            story_block = ""

        shot_grammar = (
            "SHOT GRAMMAR FORMAT (use this structure):\n"
            "  [Camera move] · [Shot type] · [Subject + action] · [Lighting] · [Optics] · [Color grade/feel]\n"
            "  Example: Slow dolly-in · extreme close-up · infinity pool reflecting golden sunset · "
            "warm rim light, lens flare · 85mm f/1.8 shallow bokeh · teal-orange Arri Alexa grade\n"
            "Fill every element with specific details from the image. One continuous sentence, no bullet points.\n"
        )

        if concept.strip():
            prompt_text = (
                f"You are a cinematographer writing an AI video prompt.\n\n"
                f"STEP 1 — Read the uploaded image: note architecture, colors, textures, mood, time of day.\n"
                f"STEP 2 — Write a prompt that EMBODIES this user concept:\n"
                f'"{concept.strip()}"\n\n'
                f"The image = VISUAL DETAILS. The concept = ACTION/INTENT. Merge both.\n\n"
                f"PRODUCT: {product_name} · STYLE: {style_feel}\n"
                f"TARGET MODEL: {model_guide}\n"
                f"{tone_block}"
                f"{story_block}"
                f"{shot_grammar}"
                f"OUTPUT RULES:\n"
                f"1. English ONLY — zero Thai characters.\n"
                f"2. {word_range} words — every word must add visual specificity.\n"
                f"3. Follow the shot grammar format above.\n"
                f"4. Raw text only — no labels, no markdown, no intro sentences."
            )
        else:
            prompt_text = (
                f"You are a cinematographer writing an AI video prompt.\n"
                f"Study the uploaded image carefully — note every detail: light, color, texture, depth, mood.\n\n"
                f"PRODUCT: {product_name} · STYLE: {style_feel}\n"
                f"TARGET MODEL: {model_guide}\n"
                f"{tone_block}"
                f"{story_block}"
                f"{shot_grammar}"
                f"OUTPUT RULES:\n"
                f"1. English ONLY — zero Thai characters.\n"
                f"2. {word_range} words — every word must add visual specificity.\n"
                f"3. Follow the shot grammar format above.\n"
                f"4. Raw text only — no labels, no markdown, no intro sentences."
            )

        import asyncio as _asyncio
        config = genai.types.GenerationConfig(temperature=0.82, max_output_tokens=8192)
        loop = _asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None, lambda: self.model.generate_content([prompt_text, img], generation_config=config)
        )
        raw = response.text.strip()
        clean = _clean_prompt(raw)
        words = clean.split()
        logger.info(f"[AI] vision prompt slot={slot_index}/{total_slots} model={ai_model} ({len(words)} words): {' '.join(words[:10])}...")
        return " ".join(words[:word_limit])

    async def analyze_product(self, product_name: str, description: str, brand_context: str = "") -> dict:
        prompt = f"""วิเคราะห์สินค้าต่อไปนี้เพื่อสร้างวิดีโอสั้น:

ชื่อสินค้า: {product_name}
คำอธิบาย: {description}
ข้อมูลแบรนด์: {brand_context}

กรุณาวิเคราะห์และตอบในรูปแบบ JSON เท่านั้น ไม่ต้องมีข้อความอื่น:
{{
  "key_features": ["คุณสมบัติหลัก 3-5 ข้อ"],
  "selling_points": ["จุดขาย 3-5 ข้อ"],
  "target_audience": "กลุ่มเป้าหมาย",
  "mood": "อารมณ์/โทนของวิดีโอ",
  "suggested_hooks": ["Hook 3 แบบที่แตกต่างกัน"]
}}"""

        content = await self._generate(prompt)
        try:
            start = content.find("{")
            end = content.rfind("}") + 1
            result = json.loads(content[start:end])
        except (json.JSONDecodeError, ValueError):
            result = {"raw": content}

        return {"analysis": result, "tokens_used": 0, "model_used": self.model_name}

    async def check_content_safety(self, text: str) -> dict:
        """Run text through OpenAI's Moderation API (free, separate from chat billing) before
        it becomes a script or a rendered video. Fails open (allows through) on any API error
        rather than blocking every job if the moderation endpoint has a hiccup — this is a
        safety net, not the only line of defense."""
        if not text.strip():
            return {"flagged": False, "categories": []}
        import asyncio
        loop = asyncio.get_event_loop()
        try:
            result = await loop.run_in_executor(
                None,
                lambda: self.openai_client.moderations.create(model="omni-moderation-latest", input=text),
            )
            r = result.results[0]
            flagged_categories = [cat for cat, val in r.categories.model_dump().items() if val]
            return {"flagged": r.flagged, "categories": flagged_categories}
        except Exception as e:
            logger.warning(f"[AI] content safety check failed ({e}) — allowing through")
            return {"flagged": False, "categories": []}

    async def analyze_visual_style(
        self, image_urls: list[str], product_name: str, description: str = "",
    ) -> dict:
        """Look at the actual uploaded photos (not just the text fields) and pick the
        best-fit Quick Ad style automatically — used when style="auto" instead of a
        hand-picked style, so the user doesn't have to know what "editorial" even means."""
        import asyncio
        import base64

        content: list[dict] = [{
            "type": "text",
            "text": (
                f"You are an art director choosing a video ad style.\n"
                f"PRODUCT: {product_name}\nDESCRIPTION: {description}\n\n"
                f"Look at the attached photo(s) and pick exactly ONE style id from:\n"
                + "\n".join(f'- "{k}": {v}' for k, v in STYLE_DESCRIPTIONS.items())
                + "\n\nReply with the style id that best fits what's actually shown in the photos."
            ),
        }]
        for url in image_urls[:3]:
            img = await self._load_image(url)
            if img is None:
                continue
            buf = io.BytesIO()
            img.convert("RGB").save(buf, "JPEG", quality=85)
            b64 = base64.b64encode(buf.getvalue()).decode()
            content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}})

        if len(content) == 1:
            return {"style": "warm", "reasoning": "no images could be decoded for visual analysis"}

        loop = asyncio.get_event_loop()
        try:
            completion = await loop.run_in_executor(
                None,
                lambda: self.openai_client.beta.chat.completions.parse(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": content}],
                    response_format=_StyleSchema,
                    temperature=0.3,
                ),
            )
            parsed = completion.choices[0].message.parsed
            if parsed is None or parsed.style not in STYLE_DESCRIPTIONS:
                raise RuntimeError(f"invalid style choice from model: {parsed}")
            logger.info(f"[AI] auto-style picked '{parsed.style}' — {parsed.reasoning}")
            return {"style": parsed.style, "reasoning": parsed.reasoning}
        except Exception as e:
            logger.warning(f"[AI] analyze_visual_style failed ({e}) — defaulting to 'warm'")
            return {"style": "warm", "reasoning": f"fallback after error: {e}"}

    async def generate_script(
        self,
        product_name: str,
        analysis: dict,
        tone_of_voice: str = "",
        cta_style: str = "",
        duration_sec: int = 30,
        concept: str = "",
        scenes: list[str] = [],
    ) -> dict:
        concept_block = f"\nแนวคิดพิเศษจากผู้สร้าง: {concept}" if concept.strip() else ""
        if scenes:
            scenes_block = "\n\nลำดับ scene ในวิดีโอ (script ควรพูดถึงแต่ละ scene ตามลำดับนี้):\n"
            for i, s in enumerate(scenes, 1):
                clean = s.strip()[:120]
                if clean:
                    scenes_block += f"  Scene {i}: {clean}\n"
        else:
            scenes_block = ""
        prompt = f"""สร้าง Script วิดีโอสั้นสำหรับสินค้า: {product_name}

ข้อมูลการวิเคราะห์:
- จุดขาย: {", ".join(analysis.get("selling_points", []))}
- กลุ่มเป้าหมาย: {analysis.get("target_audience", "")}
- Hook ที่แนะนำ: {", ".join(analysis.get("suggested_hooks", []))}
{concept_block}{scenes_block}
โทนเสียงและสไตล์: {tone_of_voice or "เป็นมิตร น่าเชื่อถือ"}
CTA: {cta_style or "กระตุ้นการซื้อ"}
ความยาว: {duration_sec} วินาที

IMPORTANT: สร้าง Script ที่แตกต่างจากเวอร์ชันอื่นอย่างชัดเจน ตาม "โทนเสียงและสไตล์" ที่กำหนด
ตอบเป็นเนื้อความล้วนสำหรับแต่ละช่อง ห้ามใส่ markdown (เช่น **ตัวหนา**), หัวข้อกำกับ (เช่น "Hook:"),
หรือคำกำกับฉาก/ภาพ/เสียงในวงเล็บ (เช่น "(ภาพ: ...)") ปนอยู่ในเนื้อความ — ทุกช่องต้องเป็นคำพูดล้วนๆ
ที่อ่านออกเสียงได้ทันทีเท่านั้น
hook: ประโยคเปิดที่ดึงดูดใน 3 วินาที
body: เนื้อหาหลัก 15-20 วินาที
cta: Call to Action 5-7 วินาที
full_script: Script ฉบับเต็มที่พูดได้เลย
beats: แบ่ง full_script ออกเป็นช่วงพูดสั้นๆ 3-6 ช่วงตามลำดับ (แต่ละช่วงคือประโยคหรือกลุ่มประโยคที่ควรพูดรวดเดียว
  แล้วเว้นจังหวะเงียบสั้นๆ ก่อนพูดช่วงถัดไป — เหมือนตัดช็อตภาพ) รวมกันแล้วต้องได้เนื้อความเดียวกับ full_script
title_card: หัวข้อสั้น 2-5 คำ สำหรับโชว์เป็นตัวอักษรใหญ่บนวิดีโอ (คนละอย่างกับ hook ที่พูดออกเสียง) —
  ต้องเป็นวลีที่จบสมบูรณ์ในตัวเองสั้นๆ กระชับ ห้ามเป็นประโยคยาวที่ดูเหมือนถูกตัดครึ่ง
beat_overlays: ข้อความดีไซน์สั้นๆ 2-4 คำ หนึ่งอันต่อ 1 beat (ต้องมีจำนวนเท่ากับ beats เป๊ะ เรียงตามลำดับ)
  โชว์บนจอคู่กับตอนที่พูดช่วงนั้นๆ — เป็นคำสรุป/จุดขายของ beat นั้น ไม่ใช่คำพูดที่ตัดมาโดยตรง
  ตัวอย่างสไตล์: "FLAWLESS CONFIDENCE" -> "DOCTOR DESIGNED" -> "VISIBLE RESULTS" (แต่ละอันเป็นวลีอิสระ กระชับ จบในตัวเอง)"""

        import asyncio
        loop = asyncio.get_event_loop()
        model_used = "gpt-4o-mini"
        try:
            # Primary: OpenAI structured outputs — the response_format schema is enforced by
            # the API itself, so this can't drift into markdown/scene-breakdown/wrong-shape
            # responses the way asking Gemini nicely in the prompt text could (and did).
            completion = await loop.run_in_executor(
                None,
                lambda: self.openai_client.beta.chat.completions.parse(
                    model=model_used,
                    messages=[{"role": "user", "content": prompt}],
                    response_format=_ScriptSchema,
                    temperature=0.95,
                ),
            )
            parsed = completion.choices[0].message.parsed
            if parsed is None:
                raise RuntimeError("OpenAI refused/could not parse a structured response")
            result = parsed.model_dump()
        except Exception as e:
            logger.warning(f"[AI] OpenAI generate_script failed ({e}) — falling back to Gemini")
            model_used = self.model_name
            content = await self._generate(prompt, temperature=0.95)
            start = content.find("{")
            end = content.rfind("}") + 1
            raw = content[start:end] if start != -1 and end > start else content
            try:
                result = json.loads(raw)
            except (json.JSONDecodeError, ValueError):
                try:
                    # Gemini sometimes ignores the requested schema and returns a Python-repr-style
                    # dict (single-quoted) instead of strict JSON — ast handles that syntax fine.
                    import ast
                    result = ast.literal_eval(raw)
                    if not isinstance(result, dict):
                        result = {"full_script": content}
                except Exception:
                    result = {"full_script": content}

            # Gemini sometimes returns hook/body/cta as dicts ({"visual":...,"voice_over":...})
            # instead of plain strings — flatten them to avoid DB type errors
            def _to_str(val) -> str:
                if isinstance(val, str):
                    return val
                if isinstance(val, dict):
                    return val.get("voice_over") or val.get("visual") or val.get("text") or str(val)
                if isinstance(val, list):
                    parts = []
                    for item in val:
                        if isinstance(item, dict):
                            parts.append(item.get("voice_over") or item.get("visual") or "")
                        elif isinstance(item, str):
                            parts.append(item)
                    return " ".join(p for p in parts if p)
                return str(val) if val is not None else ""

            result["hook"]        = _to_str(result.get("hook", ""))
            result["body"]        = _to_str(result.get("body", ""))
            result["cta"]         = _to_str(result.get("cta", ""))
            result["full_script"] = _to_str(result.get("full_script", ""))

            # Gemini sometimes ignores the requested schema entirely and returns its own
            # scene-by-scene breakdown ({"scene_1": {"voiceover": "...", ...}, ...}) instead of
            # hook/body/cta — stitch the spoken lines back together from that shape too.
            if not result["full_script"].strip():
                scene_keys = sorted(
                    (k for k in result if re.match(r"^scene[_ ]?\d+$", str(k), re.IGNORECASE)),
                    key=lambda k: int(re.search(r"\d+", str(k)).group()),
                )
                scene_lines = []
                for k in scene_keys:
                    scene = result[k]
                    if isinstance(scene, dict):
                        vo = scene.get("voiceover") or scene.get("voice_over") or scene.get("text") or ""
                        if vo:
                            scene_lines.append(_to_str(vo))
                if scene_lines:
                    result["full_script"] = " ".join(scene_lines)
                    if not result["hook"]:
                        result["hook"] = scene_lines[0]

            # Build full_script from parts if still empty
            if not result["full_script"].strip():
                result["full_script"] = "\n".join(
                    p for p in [result["hook"], result["body"], result["cta"]] if p
                )

            # Gemini's free-text prompt (unlike OpenAI's enforced schema) often ignores the
            # "beats" field entirely — fall back to hook/body/cta as beats, or split full_script
            # into sentences if even those are empty.
            raw_beats = result.get("beats")
            if not isinstance(raw_beats, list) or not [b for b in raw_beats if isinstance(b, str) and b.strip()]:
                fallback_beats = [p for p in [result["hook"], result["body"], result["cta"]] if p.strip()]
                if not fallback_beats and result["full_script"].strip():
                    fallback_beats = [s.strip() for s in re.split(r"(?<=[.!?ๆ])\s+|\n+", result["full_script"]) if s.strip()]
                result["beats"] = fallback_beats
            else:
                result["beats"] = [b for b in raw_beats if isinstance(b, str) and b.strip()]

        # Strip markdown/stage-direction labels either model can still embed in the text itself —
        # this is what actually gets read aloud by TTS, so it must be pure spoken content.
        result["hook"]        = _clean_spoken_text(result.get("hook", ""))
        result["body"]        = _clean_spoken_text(result.get("body", ""))
        result["cta"]         = _clean_spoken_text(result.get("cta", ""))
        result["full_script"] = _clean_spoken_text(result.get("full_script", ""))
        result["beats"] = [
            cleaned for b in result.get("beats", [])
            if (cleaned := _clean_spoken_text(b)).strip()
        ] or ([result["full_script"]] if result["full_script"].strip() else [])
        # title_card is a short on-screen phrase, distinct from the spoken hook — Gemini's
        # free-text fallback path doesn't reliably populate it, so fall back to the hook
        # (still passes through _short_headline's overflow guard in video.py either way).
        result["title_card"] = _clean_spoken_text(result.get("title_card", "")) or result["hook"]

        # beat_overlays must line up 1:1 with beats (the renderer times each overlay to its
        # matching beat's start/end) — pad with a naive first-few-words fallback for any beat
        # the model didn't give one for, rather than letting the lists drift out of sync.
        raw_overlays = result.get("beat_overlays")
        cleaned_overlays = (
            [_clean_spoken_text(o) for o in raw_overlays if isinstance(o, str) and o.strip()]
            if isinstance(raw_overlays, list) else []
        )
        beats = result["beats"]
        for b in beats[len(cleaned_overlays):]:
            words = b.split()[:3]
            cleaned_overlays.append(" ".join(words) if words else b[:20])
        result["beat_overlays"] = cleaned_overlays[:len(beats)]

        return {"script": result, "tokens_used": 0, "model_used": model_used}

    async def suggest_video_prompt(
        self,
        script: str,
        product_name: str,
        style: str = "playful",
        concept: str = "",
    ) -> str:
        style_rules = {
            "luxury": {
                "shot":    "ultra-slow crane descend or dolly push-in, 120fps slow-motion",
                "light":   "golden hour 6pm amber backlight, anamorphic lens flare, god rays",
                "subject": "infinity pool edge, silk draped daybed, champagne on marble, candles",
                "grade":   "teal-orange cinematic LUT, deep blacks, 4K LOG",
                "feel":    "opulent, serene, aspirational",
            },
            "party": {
                "shot":    "spinning drone orbit or handheld tracking shot, whip pans",
                "light":   "neon RGB pool uplighting, bokeh string lights, vibrant color pops",
                "subject": "pool party crowd, DJ setup, water splashes, colorful floaties",
                "grade":   "vivid punchy saturation, high contrast, energetic",
                "feel":    "euphoric, electric, FOMO-inducing",
            },
            "minimal": {
                "shot":    "locked-off symmetrical frame, birds-eye top-down, ultra-slow pan",
                "light":   "soft overcast diffused, clean white balance, subtle rim light",
                "subject": "still pool surface reflections, architectural lines, single leaf floating",
                "grade":   "desaturated cool tones, film-like subtlety, clean negative space",
                "feel":    "calm, architectural, premium",
            },
            "playful": {
                "shot":    "wide-angle fun perspective, dynamic tracking, quick zoom burst",
                "light":   "bright tropical midday sun, vivid turquoise water, cheerful warmth",
                "subject": "turquoise infinity pool, tropical palms, colorful towels, sun loungers",
                "grade":   "warm vivid grade, boosted saturation, holiday postcard colors",
                "feel":    "fun, inviting, vacation-ready",
            },
        }.get(style, {
            "shot": "smooth cinematic dolly", "light": "golden hour",
            "subject": "private pool villa", "grade": "4K cinematic", "feel": "premium luxury",
        })

        system_prompt = (
            "You are the creative director of award-winning luxury resort commercials.\n"
            "Your job: read a Thai voiceover script and write ONE detailed cinematic AI video prompt in English.\n\n"
            "STRICT RULES:\n"
            "1. English ONLY - zero Thai characters.\n"
            "2. 110-130 words — longer, more detailed prompts produce better AI video output.\n"
            "3. Start with SHOT TYPE (e.g. Low-angle crane shot, Aerial drone orbit, Extreme close-up).\n"
            "4. Include: shot type, subject in frame, what moves naturally, lighting details, "
            "atmosphere, color grade, quality tags.\n"
            "5. Reference SPECIFIC visual elements from the script's mood/selling-point.\n"
            "6. End with quality tags: cinematic, ultra-realistic, slow-motion, photorealistic, "
            "4K, shallow depth of field.\n"
            "7. NO explanations, NO labels, NO quotes - raw prompt text only."
        )

        concept_block = f"\nUSER VISUAL REQUEST (highest priority): {concept}" if concept.strip() else ""

        user_prompt = (
            f"SCRIPT (Thai - read for mood and selling points):\n"
            f"{script[:300]}{concept_block}\n\n"
            f"PRODUCT: {product_name}\n\n"
            f"VISUAL STYLE: {style_rules['feel']}\n\n"
            f"CINEMATOGRAPHY:\n"
            f"- Shot: {style_rules['shot']}\n"
            f"- Lighting: {style_rules['light']}\n"
            f"- Subjects: {style_rules['subject']}\n"
            f"- Grade: {style_rules['grade']}\n\n"
            f"TASK: Write ONE cinematic video prompt (110-130 words). Start with shot type immediately."
        )

        raw = await self._generate(user_prompt, system=system_prompt, temperature=0.85)
        clean = _clean_prompt(raw)
        words = clean.split()
        logger.info(f"[AI] prompt ({len(words)} words): {' '.join(words[:10])}...")
        return " ".join(words[:155])


    async def generate_storyboard(
        self,
        product_name: str,
        image_count: int,
        video_type: str,
        focus: str,
        duration_sec: int,
        ai_model: str,
    ) -> dict:
        """Generate a complete storyboard plan from user's 3-question answers."""
        # Decide clip count based on duration + available images
        if duration_sec <= 15:
            clip_dur, clip_count = 5, 3
        elif duration_sec <= 30:
            clip_dur, clip_count = 5, min(6, image_count)
        else:
            clip_dur, clip_count = 5, min(8, image_count)
        clip_count = max(2, min(clip_count, image_count))

        model_label = {
            "hailuo2pro":     "Hailuo 2.3 Pro",
            "kling3s":        "Kling v3 Standard",
            "kling3s_pro":    "Kling v3 Pro",
            "seedance2":      "Seedance 2.0 Fast",
            "seedance2_pro":  "Seedance 2.0 Pro",
            "seedance2_multi":"Seedance Multi-Shot (9 images in one video)",
            "wan21":          "Wan 2.2 Turbo",
            "kenburs":        "Ken Burns (FFmpeg)",
        }.get(ai_model, ai_model)

        prompt = (
            f"Plan a short vertical social media video (9:16, TikTok/Reels) for Thai audience.\n\n"
            f"Property: {product_name}\n"
            f"Available images: {image_count} photos (index 0 to {image_count - 1})\n"
            f"Video style: {video_type}\n"
            f"Focus / highlight: {focus if focus else 'general property highlights'}\n"
            f"Total duration: {duration_sec} seconds\n"
            f"Clips: {clip_count} clips × {clip_dur}s each\n"
            f"AI model: {model_label}\n\n"
            f"Rules:\n"
            f"- Spread images evenly — use different image_index for each clip if possible\n"
            f"- Story arc: OPENING (grab attention) → FEATURE (highlights) → CLOSING (emotion/CTA)\n"
            f"- label: Thai, 1-4 words, describes the scene (e.g. สระน้ำ Infinity, ห้องนอน, วิวทะเล)\n"
            f"- concept: English, 1 sentence cinematic description matching video style and focus\n"
            f"- script_concept: Thai, one sentence describing the overall voiceover theme\n\n"
            f"Return ONLY valid JSON, no markdown fences:\n"
            f'{{"clips":[{{"image_index":0,"label":"Thai label","concept":"English cinematic concept",'
            f'"duration_sec":{clip_dur},"scene_role":"OPENING"}}],"script_concept":"Thai voiceover theme"}}'
        )

        raw = await self._generate(prompt, temperature=0.75)
        raw = re.sub(r'^```(?:json)?\s*', '', raw.strip())
        raw = re.sub(r'\s*```$', '', raw.strip())

        try:
            data = json.loads(raw)
            # Validate and clamp image indices
            for c in data.get("clips", []):
                c["image_index"] = max(0, min(int(c.get("image_index", 0)), image_count - 1))
            logger.info(f"[AI] storyboard generated: {len(data.get('clips',[]))} clips")
            return data
        except Exception as e:
            logger.warning(f"[AI] storyboard JSON parse failed: {e} — using fallback")
            clips = []
            for i in range(clip_count):
                role = "OPENING" if i == 0 else ("CLOSING" if i == clip_count - 1 else "FEATURE")
                clips.append({
                    "image_index": i % image_count,
                    "label": f"Scene {i + 1}",
                    "concept": f"{video_type} cinematic shot highlighting {focus or product_name}",
                    "duration_sec": clip_dur,
                    "scene_role": role,
                })
            return {"clips": clips, "script_concept": f"วิดีโอ{video_type}ที่สวยงามน่าประทับใจ"}


ai_service = AIService()
