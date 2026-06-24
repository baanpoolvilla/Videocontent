import json
import re
import logging
import google.generativeai as genai
from app.core.config import settings

logger = logging.getLogger(__name__)


class AIService:
    def __init__(self):
        genai.configure(api_key=settings.GEMINI_API_KEY)
        self.model = genai.GenerativeModel("gemini-2.5-flash")
        self.model_name = "gemini-2.5-flash"

    def _generate(self, prompt: str, system: str = "", temperature: float = 0.7) -> str:
        config = genai.types.GenerationConfig(temperature=temperature, max_output_tokens=1024)
        full_prompt = f"{system}\n\n{prompt}" if system else prompt
        response = self.model.generate_content(full_prompt, generation_config=config)
        return response.text.strip()

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
            "Your job: read a Thai voiceover script and write ONE ultra-cinematic AI video prompt in English for Kling v3.\n\n"
            "STRICT RULES:\n"
            "1. English ONLY - zero Thai characters.\n"
            "2. 50-70 words exactly - count carefully.\n"
            "3. Start with SHOT TYPE (e.g. Low-angle crane shot, Aerial drone orbit, Extreme close-up).\n"
            "4. Include: shot type -> subject in frame -> what moves -> lighting -> color grade -> emotional tone.\n"
            "5. Reference SPECIFIC visual elements from the script's mood/selling-point.\n"
            "6. Use Kling v3 power-words: cinematic, ultra-realistic, slow-motion, photorealistic, 4K.\n"
            "7. NO explanations, NO labels, NO quotes - raw prompt text only."
        )

        concept_block = f"\nUSER VISUAL REQUEST (highest priority): {concept}" if concept.strip() else ""

        user_prompt = (
            f"SCRIPT (Thai - read for mood and selling points):\n"
            f'"""{script[:300]}"""{concept_block}\n\n'
            f"PRODUCT: {product_name} - private pool villa, Pattaya-Jomtien, Thailand\n\n"
            f"VISUAL STYLE: {style_rules['feel']}\n\n"
            f"CINEMATOGRAPHY:\n"
            f"- Shot: {style_rules['shot']}\n"
            f"- Lighting: {style_rules['light']}\n"
            f"- Subjects: {style_rules['subject']}\n"
            f"- Grade: {style_rules['grade']}\n\n"
            f"TASK: Write ONE cinematic video prompt (50-70 words). Start with shot type immediately."
        )

        raw = self._generate(user_prompt, system=system_prompt, temperature=0.85)
        # strip Thai characters and smart/curly quotes using Unicode escapes
        clean = re.sub(r"[฀-๿“”‘’\"']+", "", raw).strip()
        words = clean.split()
        logger.info(f"[AI] prompt ({len(words)} words): {' '.join(words[:8])}...")
        return " ".join(words[:70])


ai_service = AIService()
