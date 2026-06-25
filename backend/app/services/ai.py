import io
import json
import re
import logging
import httpx
import google.generativeai as genai
from PIL import Image
from app.core.config import settings

logger = logging.getLogger(__name__)


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


class AIService:
    def __init__(self):
        genai.configure(api_key=settings.GEMINI_API_KEY)
        self.model = genai.GenerativeModel("gemini-2.5-flash")
        self.model_name = "gemini-2.5-flash"

    def _generate(self, prompt: str, system: str = "", temperature: float = 0.7) -> str:
        config = genai.types.GenerationConfig(temperature=temperature, max_output_tokens=8192)
        full_prompt = f"{system}\n\n{prompt}" if system else prompt
        response = self.model.generate_content(full_prompt, generation_config=config)
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
    ) -> str:
        """Use Gemini Vision to look at the actual product image and write a cinematic prompt."""
        img = await self._load_image(image_url)
        if img is None:
            return await self.suggest_video_prompt("", product_name, style, concept)

        style_feel = {
            "luxury":  "opulent, serene, aspirational — Four Seasons campaign",
            "party":   "euphoric, electric, FOMO-inducing — W Hotel pool party",
            "minimal": "calm, architectural, premium — Muji/Aesop campaign",
            "playful": "fun, inviting, vacation-ready — Booking.com hero shot",
        }.get(style, "premium cinematic luxury resort")

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
                "Wan 2.1 by Alibaba. "
                "STRENGTHS: follows detailed scene descriptions closely, versatile, layered compositions. "
                "POWER KEYWORDS: layered composition, foreground detail, depth layers, "
                "specific motion, background depth, cinematic scene. "
                "STRATEGY: describe in layers — foreground, midground, background, then motion and light."
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

        # Concept is the anchor — everything builds around what the user wants
        if concept.strip():
            concept_block = (
                "\nUSER CONCEPT — NON-NEGOTIABLE ANCHOR:\n"
                f'"{concept.strip()}"\n'
                "Make this the CENTRAL ACTION of the video. "
                "Camera, lighting, and atmosphere all SERVE this concept. Never replace or ignore it.\n"
            )
        else:
            concept_block = ""

        prompt_text = (
            f"You are an elite cinematographer writing AI video generation prompts.\n"
            f"TARGET VIDEO MODEL: {model_guide}\n"
            f"{story_block}"
            f"{concept_block}\n"
            f"PRODUCT: {product_name}\n"
            f"VISUAL STYLE: {style_feel}\n\n"
            f"Study the uploaded image carefully. Write ONE prompt that produces a stunning, "
            f"professional video from this exact image.\n\n"
            f"WRITE IN THIS ORDER (no labels in output):\n"
            f"1. Camera move with speed — e.g. 'Ultra-slow dolly push-in reveals,' "
            f"'Gentle overhead crane descends over,' 'Low orbital arc sweeps across'\n"
            f"2. Central subject — richly describe exactly what is in the image\n"
            f"3. Natural motion in frame — water rippling, palms swaying, steam curling, "
            f"curtains drifting, reflections shimmering, leaves catching light\n"
            f"4. Lighting — quality, direction, color temp: golden-hour amber backlight, "
            f"dappled sunlight through palms, soft volumetric rays, bokeh highlights\n"
            f"5. Atmosphere — sensory mood: tropical warmth, morning mist, blue-hour serenity, "
            f"candlelight flicker, salt-air breeze\n"
            f"6. Quality tags — cinematic, photorealistic, 4K, ultra-slow motion, "
            f"anamorphic lens character, shallow depth of field\n\n"
            f"RULES:\n"
            f"1. English ONLY — absolutely zero Thai characters in output.\n"
            f"2. 140-155 words — richer prompts produce dramatically better video.\n"
            f"3. Describe ONLY what is visible in the image — no invented people or new locations.\n"
            f"4. Start directly with camera move — not 'I', not 'Here is', not 'The prompt'.\n"
            f"5. Specific beats vague — every word must earn its place.\n"
            f"6. Output raw prompt text ONLY — no labels, no numbering, no markdown."
        )

        config = genai.types.GenerationConfig(temperature=0.82, max_output_tokens=8192)
        response = self.model.generate_content([prompt_text, img], generation_config=config)
        raw = response.text.strip()
        clean = _clean_prompt(raw)
        words = clean.split()
        logger.info(f"[AI] vision prompt slot={slot_index}/{total_slots} ({len(words)} words): {' '.join(words[:10])}...")
        return " ".join(words[:155])

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

        content = self._generate(prompt)
        try:
            start = content.find("{")
            end = content.rfind("}") + 1
            result = json.loads(content[start:end])
        except (json.JSONDecodeError, ValueError):
            result = {"raw": content}

        return {"analysis": result, "tokens_used": 0, "model_used": self.model_name}

    async def generate_script(
        self,
        product_name: str,
        analysis: dict,
        tone_of_voice: str = "",
        cta_style: str = "",
        duration_sec: int = 30,
        concept: str = "",
    ) -> dict:
        concept_block = f"\nแนวคิดพิเศษจากผู้สร้าง: {concept}" if concept.strip() else ""
        prompt = f"""สร้าง Script วิดีโอสั้นสำหรับสินค้า: {product_name}

ข้อมูลการวิเคราะห์:
- จุดขาย: {", ".join(analysis.get("selling_points", []))}
- กลุ่มเป้าหมาย: {analysis.get("target_audience", "")}
- Hook ที่แนะนำ: {", ".join(analysis.get("suggested_hooks", []))}
{concept_block}
โทนเสียงและสไตล์: {tone_of_voice or "เป็นมิตร น่าเชื่อถือ"}
CTA: {cta_style or "กระตุ้นการซื้อ"}
ความยาว: {duration_sec} วินาที

IMPORTANT: สร้าง Script ที่แตกต่างจากเวอร์ชันอื่นอย่างชัดเจน ตาม "โทนเสียงและสไตล์" ที่กำหนด
สร้าง Script ในรูปแบบ JSON เท่านั้น ไม่ต้องมีข้อความอื่น:
{{
  "hook": "ประโยคเปิดที่ดึงดูดใน 3 วินาที",
  "body": "เนื้อหาหลัก 15-20 วินาที",
  "cta": "Call to Action 5-7 วินาที",
  "full_script": "Script ฉบับเต็มที่พูดได้เลย"
}}"""

        content = self._generate(prompt, temperature=0.95)
        try:
            start = content.find("{")
            end = content.rfind("}") + 1
            result = json.loads(content[start:end])
        except (json.JSONDecodeError, ValueError):
            result = {"full_script": content}

        return {"script": result, "tokens_used": 0, "model_used": self.model_name}

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
            f"PRODUCT: {product_name} - private pool villa, Pattaya-Jomtien, Thailand\n\n"
            f"VISUAL STYLE: {style_rules['feel']}\n\n"
            f"CINEMATOGRAPHY:\n"
            f"- Shot: {style_rules['shot']}\n"
            f"- Lighting: {style_rules['light']}\n"
            f"- Subjects: {style_rules['subject']}\n"
            f"- Grade: {style_rules['grade']}\n\n"
            f"TASK: Write ONE cinematic video prompt (110-130 words). Start with shot type immediately."
        )

        raw = self._generate(user_prompt, system=system_prompt, temperature=0.85)
        clean = _clean_prompt(raw)
        words = clean.split()
        logger.info(f"[AI] prompt ({len(words)} words): {' '.join(words[:10])}...")
        return " ".join(words[:155])


ai_service = AIService()
