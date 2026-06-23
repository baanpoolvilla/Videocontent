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
        style_desc = {
            "luxury":  "luxury cinematic, slow elegant camera movement, golden hour warm lighting, premium upscale atmosphere",
            "party":   "energetic dynamic movement, vibrant colorful lighting, festive party atmosphere, fast cuts",
            "minimal": "clean minimal aesthetic, smooth slow pan, soft natural lighting, modern sleek",
            "playful": "playful bright colors, fun animated energy, vibrant tropical, cheerful atmosphere",
        }.get(style, "cinematic")

        prompt = f"""You are an AI video director. Write a Seedance 2.0 image-to-video generation prompt.

Product: {product_name}
Style: {style_desc}
Script (excerpt): {script[:250]}

Write ONE concise prompt in English (40-70 words) for a 9:16 pool villa short video.
Describe: camera movement, lighting mood, key visual elements, atmosphere.
Output ONLY the prompt text. No labels, no explanations."""

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=150,
            temperature=0.8,
        )
        return response.choices[0].message.content.strip()


ai_service = AIService()
