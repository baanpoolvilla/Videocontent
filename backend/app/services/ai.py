import json
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
    ) -> str:
        style_guide = {
            "luxury": {
                "camera": "ultra-slow cinematic dolly push-in, smooth crane reveal, aerial drift, slow-motion 120fps",
                "light":  "golden hour warm amber backlight, lens flare, god rays through palm trees, deep shadow contrast",
                "mood":   "opulent, serene, aspirational luxury",
                "action": "pool water shimmers in slow-motion, silk curtains sway, candles flicker, champagne condensation drips",
                "grade":  "cinematic LOG color grade, teal-orange grade, 4K ultra-sharp",
            },
            "party": {
                "camera": "handheld energetic walkthrough, fast whip pan, spinning drone orbit, Dutch angle push",
                "light":  "neon RGB pool lighting, strobe flashes, bokeh string lights, vibrant color pops",
                "mood":   "euphoric, electric, high-energy celebration",
                "action": "water splashes in slow-mo, people laugh and dance, DJ light beams cut through mist",
                "grade":  "vivid saturated color, high contrast, punchy edit",
            },
            "minimal": {
                "camera": "locked-off symmetrical shot, ultra-slow gentle pan, top-down birds-eye, single long take",
                "light":  "soft overcast diffused light, clean white balance, subtle rim light, minimal shadow",
                "mood":   "calm, architectural, premium minimal",
                "action": "water surface ripples subtly, leaves sway barely, reflections shift slowly",
                "grade":  "desaturated clean grade, cool tones, film-like subtlety",
            },
            "playful": {
                "camera": "dynamic tracking shot, playful tilt, wide-angle fun perspective, quick zoom burst",
                "light":  "bright tropical midday sun, vivid turquoise water, colorful accents, cheerful warmth",
                "mood":   "fun, vibrant, inviting, resort holiday",
                "action": "water sparkles and splashes, tropical flowers sway, bright umbrellas pop with color",
                "grade":  "warm vivid grade, boosted saturation, cheerful bright tones",
            },
        }.get(style, {
            "camera": "smooth cinematic dolly", "light": "golden hour warm", "mood": "premium",
            "action": "water shimmers", "grade": "4K cinematic",
        })

        prompt = f"""You are a world-class AI video director writing prompts for Kling v3 / Seedance image-to-video AI.

TASK: Write ONE cinematic video prompt. English ONLY. Max 70 words. No Thai text.

Visual subject: private pool villa, tropical luxury, Pattaya-Jomtien Thailand
Style target: {style_guide['mood']}

Use these cinematography techniques:
- Camera: {style_guide['camera']}
- Lighting: {style_guide['light']}
- Action details: {style_guide['action']}
- Color grade: {style_guide['grade']}

Script context (for mood reference only, do NOT translate): {script[:80]}

OUTPUT FORMAT: Write ONLY the prompt text. No labels, no quotes, no explanation.
The prompt must start with a VISUAL description (what the camera sees first).
Make it feel CINEMATIC and REAL — like a $10M hotel commercial."""

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200,
            temperature=0.9,
        )
        raw = response.choices[0].message.content.strip()
        # Strip any Thai characters that sneak in
        import re
        clean = re.sub(r'[฀-๿]+', '', raw).strip()
        # Truncate to 70 words
        words = clean.split()
        return " ".join(words[:70])


ai_service = AIService()
