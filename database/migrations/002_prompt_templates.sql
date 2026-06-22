-- Migration 002: create prompt_templates table
CREATE TABLE IF NOT EXISTS prompt_templates (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         VARCHAR(255) NOT NULL,
  description  TEXT,
  template_text TEXT NOT NULL,
  variables    JSONB DEFAULT '[]',
  is_active    BOOLEAN DEFAULT true,
  version      INTEGER DEFAULT 1,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prompt_templates_active ON prompt_templates(is_active);

-- Default prompts สำหรับ Pool Villa
INSERT INTO prompt_templates (name, description, template_text, variables, is_active) VALUES
(
  'Pool Villa — Script หลัก',
  'Script สำหรับวิดีโอโปรโมท Pool Villa พัทยา',
  E'คุณคือ copywriter มือโปรสำหรับที่พักพรีเมียม\n\nสินค้า: {product_name}\nรายละเอียด: {product_description}\nTone: {tone_of_voice}\nกลุ่มเป้าหมาย: {target_audience}\nCTA: {cta_style}\n\nสร้าง script วิดีโอ 30-60 วินาที ประกอบด้วย:\n- Hook (1-2 ประโยค ดึงดูดความสนใจ)\n- Body (2-3 ประโยค บอก features เด่น)\n- CTA (1 ประโยค กระตุ้นให้จอง)\n\nตอบเป็น JSON: {"hook": "...", "body": "...", "cta": "..."}',
  '["product_name", "product_description", "tone_of_voice", "target_audience", "cta_style"]',
  true
),
(
  'Pool Villa — Hook สั้น TikTok',
  'Hook เด็ดสำหรับ TikTok 3 วิแรก',
  E'สร้าง hook เปิดวิดีโอ 3-5 วินาทีสำหรับ TikTok\n\nสินค้า: {product_name}\nจุดขาย: {selling_points}\n\nHook ต้องทำให้คนหยุดดูใน 3 วิแรก ใช้ภาษาไทยธรรมชาติ\nตอบแค่ประโยค hook อย่างเดียว ไม่ต้องอธิบาย',
  '["product_name", "selling_points"]',
  true
);
