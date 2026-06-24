import json
import re
from groq import Groq
from app.core.config import settings


class AIService:
    def __init__(self):
        self.client = Groq(api_key=settings.GROQ_API_KEY)
        self.model = "llama-3.3-70b-versatile"

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

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1024,
            temperature=0.7,
        )

        content = response.choices[0].message.content
        try:
            start = content.find("{")
            end = content.rfind("}") + 1
            result = json.loads(content[start:end])
        except (json.JSONDecodeError, ValueError):
            result = {"raw": content}

        return {
            "analysis": result,
            "tokens_used": response.usage.total_tokens,
            "model_used": self.model,
        }

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

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1024,
            temperature=0.95,
        )

        content = response.choices[0].message.content
        try:
            start = content.find("{")
            end = content.rfind("}") + 1
            result = json.loads(content[start:end])
        except (json.JSONDecodeError, ValueError):
            result = {"full_script": content}

        return {
            "script": result,
            "tokens_used": response.usage.total_tokens,
            "model_used": self.model,
        }

    async def suggest_video_prompt(
        self,
        script: str,
        product_name: str,
        style: str = "playful",
        concept: str = "",
    ) -> str:
        """Generate a cinematic video prompt from the script content."""
        style_rules = {
            "luxury": {
                "shot":    "ultra-slow crane descend or dolly push-in, 120fps slow-motion",
                "light":   "golden hour 6pm amber backlight, anamorphic lens flare, god rays",
                "subject": "infinity pool edge, silk draped daybed, champagne on marble, candles",
                "grade":   "teal-orange cinematic LUT, deep blacks, 4K LOG",
                "feel":    "opulent, serene, aspirational — like a $10M Four Seasons campaign",
            },
            "party": {
                "shot":    "spinning drone orbit or handheld tracking shot, whip pans",
                "light":   "neon RGB pool uplighting, bokeh string lights, vibrant color pops",
                "subject": "pool party crowd, DJ setup, water splashes, colorful floaties",
                "grade":   "vivid punchy saturation, high contrast, energetic",
                "feel":    "euphoric, electric, FOMO-inducing — like a W Hotel pool party reel",
            },
            "minimal": {
                "shot":    "locked-off symmetrical frame, birds-eye top-down, ultra-slow pan",
                "light":   "soft overcast diffused, clean white balance, subtle rim light",
                "subject": "still pool surface reflections, architectural lines, single leaf floating",
                "grade":   "desaturated cool tones, film-like subtlety, clean negative space",
                "feel":    "calm, architectural, premium — like a Muji or Aesop campaign",
            },
            "playful": {
                "shot":    "wide-angle fun perspective, dynamic tracking, quick zoom burst",
                "light":   "bright tropical midday sun, vivid turquoise water, cheerful warmth",
                "subject": "turquoise infinity pool, tropical palms, colorful towels, sun loungers",
                "grade":   "warm vivid grade, boosted saturation, holiday postcard colors",
                "feel":    "fun, inviting, vacation-ready — like a Booking.com hero shot",
            },
        }.get(style, {
            "shot": "smooth cinematic dolly", "light": "golden hour",
            "subject": "private pool villa", "grade": "4K cinematic", "feel": "premium luxury",
        })

        system_prompt = """You are the creative director of award-winning luxury resort commercials.
Your job: read a Thai voiceover script and write ONE ultra-cinematic AI video prompt in English for Kling v3.

STRICT RULES:
1. English ONLY — zero Thai characters.
2. 50-70 words exactly — count carefully.
3. Start with SHOT TYPE (e.g. "Low-angle crane shot", "Aerial drone orbit", "Extreme close-up").
4. Include: shot type -> subject in frame -> what moves -> lighting -> color grade -> emotional tone.
5. Reference SPECIFIC visual elements from the script's mood/selling-point (not generic "pool").
6. Use Kling v3 power-words: "cinematic", "ultra-realistic", "slow-motion", "photorealistic", "4K".
7. NO explanations, NO labels, NO quotes — raw prompt text only."""

        concept_block = f"\nUSER'S SPECIFIC VISUAL REQUEST (highest priority): {concept}" if concept.strip() else ""

        user_prompt = f"""SCRIPT (Thai — read for mood and selling points, do not translate literally):
\"\"\"{script[:300]}\"\"\"{concept_block}

PRODUCT: {product_name} — private pool villa, Pattaya-Jomtien, Thailand

VISUAL STYLE TARGET: {style_rules['feel']}

CINEMATOGRAPHY TOOLKIT TO USE:
- Shot style: {style_rules['shot']}
- Lighting: {style_rules['light']}
- In-frame subjects: {style_rules['subject']}
- Color grade: {style_rules['grade']}

TASK: {"Prioritize the USER'S SPECIFIC VISUAL REQUEST above all else." if concept.strip() else "Extract the STRONGEST visual selling point from this script."} Write ONE cinematic video prompt (50-70 words) that would make a viewer stop scrolling. Start with the shot type immediately."""

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_prompt},
            ],
            max_tokens=250,
            temperature=0.85,
        )
        raw = response.choices[0].message.content.strip()
        clean = re.sub(r'[฀-๿“”‘’\'"]+', '', raw).strip()
        words = clean.split()
        return " ".join(words[:70])


ai_service = AIService()
