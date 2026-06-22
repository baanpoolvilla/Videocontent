# AI Content Production Pipeline — Production Specification v1.1

> ระบบผลิตวิดีโอสั้นด้วย AI สำหรับใช้งานภายในองค์กร
> ออกแบบสำหรับทีมพัฒนา 1 คน และรองรับการขยายในอนาคต

---

# เป้าหมายระบบ

อัปโหลดรูปหรือคลิปสินค้า 1 ครั้ง → AI วิเคราะห์ → สร้าง Script → สร้างเสียง → สร้างวิดีโอ → ตรวจสอบมาตรฐาน → อนุมัติ → ตั้งเวลาโพสต์ → เก็บ Analytics → วิเคราะห์ผลลัพธ์ → แนะนำคอนเซ็ปต์รอบถัดไป

---

# Tech Stack

## Frontend
- Next.js
- Tailwind CSS
- shadcn/ui

## Backend
- FastAPI
- n8n (Workflow Orchestration)

## Database
- PostgreSQL

## Storage
- MinIO

## Video Processing
- Kling API
- FFmpeg

## AI
- Claude Haiku 4.5
- ElevenLabs / Azure TTS

## Monitoring
- Grafana
- Prometheus

## Reporting (No-Code)
- Metabase — ให้ทีมดู Dashboard, Cost Report, Analytics ได้โดยไม่ต้องเขียนโค้ด
  - เชื่อมตรงกับ PostgreSQL
  - ใช้ภายในองค์กรเท่านั้น ไม่ expose สู่สาธารณะ

## Container
- Docker Compose
- Portainer
- Traefik

---

# Upload Flow (สำคัญมาก — อย่าให้ผ่าน Vercel)

```
Browser → FastAPI (บน server เดิม) → MinIO (บน server เดิม)
```

**ข้อกำหนดเด็ดขาด:** ไฟล์อัปโหลดจาก browser ตรงไปยัง FastAPI/MinIO บน server เดิม **ไม่ผ่าน Vercel function**

เหตุผล:
- Vercel Serverless Function มี limit **4.5 MB** ต่อ request — วิดีโอสินค้าและรูปขนาดเต็มจะชน limit นี้ทันที
- Next.js App Router ฝั่ง Vercel **ห้าม** รับไฟล์แล้วส่งต่อ (proxy upload)
- Frontend เรียก `NEXT_PUBLIC_API_URL` (ชี้ตรงไปยัง FastAPI) สำหรับ `/api/v1/files/upload` ทุกครั้ง

Implementation:
- Frontend: `axios.post(API_URL + '/api/v1/files/upload', formData)` — ไม่ใช้ Next.js API Route
- FastAPI: รับ `UploadFile`, stream ตรงไป MinIO
- ห้ามเขียน Next.js API Route (`app/api/...`) รับไฟล์ไม่ว่ากรณีใด

---

# Pipeline

Upload Product
→ AI Analysis
→ Template Selection
→ Script Generation
→ Human Review
→ Caption + Hashtag
→ TTS
→ Video Generation
→ FFmpeg Editing
→ Compliance Check
→ Preview A-E
→ Approval
→ Schedule
→ Auto Publish
→ Analytics Collection
→ AI Feedback Engine

---

# Core Screens

1. Home
2. Dashboard
3. Product Upload
4. AI Analysis
5. Template Management
6. Script Editor
7. Caption / Hashtag / Voice
8. Render Queue
9. Compliance Check
10. Preview
11. Approval
12. Manual Upload
13. Schedule
14. Analytics
15. Platform Accounts

## Additional Recommended Screens

16. Asset Library
17. Brand Profile
18. Prompt Management
19. Failed Jobs
20. Notification Center

---

# Additional Features

## Asset Library

จัดเก็บ

- รูปภาพ
- วิดีโอ
- เสียง
- โลโก้
- Overlay
- Intro
- Outro

ช่วยลดการอัปโหลดซ้ำ

---

## Brand Profile

เก็บข้อมูลแบรนด์

- Tone of Voice
- Audience
- CTA Style
- Forbidden Words
- Brand Description

AI ใช้ข้อมูลนี้ทุกครั้ง

---

## Prompt Versioning

รองรับ

- Prompt V1
- Prompt V2
- Prompt V3

วัดผลว่าพรอมต์ใดให้ผลลัพธ์ดีที่สุด

---

## A/B Testing

เปรียบเทียบ

- Hook
- CTA
- Caption
- Voice

วิเคราะห์ผู้ชนะจาก

- CTR
- Watch Time
- Completion Rate

---

## AI Feedback Engine

Analytics
→ AI Analysis
→ Recommendation

ตัวอย่าง

- Hook แบบไหนดูจบสูง
- Caption แบบไหน CTR ดี
- Voice แบบไหน Engagement สูง

---

## Cost Tracking

ติดตามต้นทุน

- Claude
- Kling
- TTS

แสดง

- Cost per Clip
- Cost per Product
- Cost per Platform

---

## Human Review Queue

สถานะ

- Draft
- Review Needed
- Approved
- Rejected

รองรับ Comment และ Feedback

---

## Notification Center

แจ้งเตือนผ่าน

- Telegram
- LINE
- Discord

เมื่อ

- Render สำเร็จ
- Render ล้มเหลว
- Post สำเร็จ
- Token หมดอายุ

---

## Platform Video Specifications (Reference สำหรับ Compliance Check)

| Platform | Max Duration | Ratio | Resolution | Format | Max Size |
|---|---|---|---|---|---|
| TikTok | 60s (standard) / 10 min (verified) | 9:16 | 1080×1920 | MP4 / MOV | 500 MB |
| Instagram Reels | 90s | 9:16 | 1080×1920 | MP4 | 1 GB |
| Facebook Reels | 90s | 9:16 | 1080×1920 | MP4 | 1 GB |
| YouTube Shorts | 60s | 9:16 (vertical) | 1080×1920 | MP4 | 256 GB |

กฎเพิ่มเติม:
- **TikTok:** min 3s, audio required, frame rate ≤60fps, no letterbox
- **Instagram Reels:** safe zone 14% top/bottom (UI overlay), ห้ามมีข้อความในโซนนี้
- **Facebook:** ต้องการ audio track (muted video อาจ reach ต่ำ)
- **YouTube Shorts:** vertical ratio สำคัญที่สุด — 1:1 หรือ 16:9 จะไม่แสดงใน Shorts feed

Compliance Check ต้องตรวจ: duration, resolution, aspect ratio, file size, audio presence

---

## Dead Letter Queue

รองรับ

- Failed
- Retrying
- Dead Letter

สามารถ Retry งานได้

---

## Monitoring

Grafana + Prometheus

ตรวจสอบ

- CPU
- RAM
- Storage
- Queue
- Render Time
- API Error

---

# Database Tables

| ตาราง | คำอธิบาย | หมายเหตุ |
|---|---|---|
| `users` | บัญชีผู้ใช้, role, refresh_token | |
| `products` | สินค้าที่อัปโหลด | |
| `analysis` | ผล AI วิเคราะห์สินค้า | |
| `templates` | เทมเพลตวิดีโอ | |
| `template_versions` | เวอร์ชัน template | |
| `brand_profiles` | Tone / Audience / CTA / Forbidden Words | is_default flag |
| `assets` | Asset Library (รูป/วิดีโอ/เสียง/โลโก้) | |
| `content_jobs` | งานผลิตคอนเทนต์แต่ละชิ้น | status, pipeline state |
| `scripts` | Script ที่ AI สร้าง | |
| `voices` | ไฟล์เสียง TTS | |
| `render_versions` | แต่ละเวอร์ชันที่ render (A–E) | **has_audio** BOOLEAN, **audio_status** ENUM('present','missing','error') |
| `compliance_checks` | ผลตรวจ platform spec | duration, resolution, ratio, size |
| `approvals` | การอนุมัติ/ปฏิเสธ | comment, reviewer |
| `manual_posts` | โพสต์ที่ทำมือ | |
| `schedule` | ตารางโพสต์อัตโนมัติ | |
| `post_results` | ผลหลังโพสต์ | likes, views, CTR |
| `platform_accounts` | Token บัญชี Social Media | expires_at, refresh_token |
| `api_costs` | ต้นทุน API ต่อ job | provider, tokens, cost_usd |
| `notifications` | การแจ้งเตือน | channel (telegram/line/discord) |
| `prompt_versions` | เวอร์ชัน Prompt ที่ใช้สร้าง Script | version_name, template_text, active |
| `ab_tests` | A/B Test configuration และผล | variant_a_id, variant_b_id, winner, metric |

### render_versions — audio fields
```sql
has_audio     BOOLEAN NOT NULL DEFAULT FALSE,
audio_status  VARCHAR(10) NOT NULL DEFAULT 'missing'
              -- CHECK (audio_status IN ('present', 'missing', 'error'))
```
ใช้สำหรับ Compliance Check (บาง platform บังคับมีเสียง) และ UI แสดง badge เสียง/ไม่มีเสียง

---

# Development Roadmap

Phase 1
- Docker
- PostgreSQL
- MinIO
- n8n
- Authentication (JWT — email/password สำหรับ internal team)
  - **Option A (ใช้แล้ว):** JWT login ธรรมดา — email + password → `access_token` อายุ 30 นาที + `refresh_token` อายุ 7 วัน เก็บใน localStorage/httpOnly cookie
  - **Option B (แนะนำถ้ามี Google Workspace):** Google OAuth 2.0 — redirect ไป Google → รับ `id_token` → verify กับ Google API → ออก JWT ของระบบ
  - ระบบปัจจุบันใช้ Option A, สามารถเพิ่ม Option B ในภายหลังโดยไม่กระทบ schema

Phase 2
- Upload Product
- AI Analysis
- Script Generation

Phase 3
- Voice Generation
- Kling Integration
- FFmpeg Pipeline

Phase 4
- Preview
- Approval
- Schedule

Phase 5
- Auto Publishing
- Analytics

Phase 6
- AI Feedback Engine
- Dashboard
- Monitoring

---

# Production Readiness Checklist

- Asset Library
- Brand Profile
- Prompt Versioning
- Cost Tracking
- Monitoring
- Notification Center
- Failed Job Recovery
- Token Refresh
- Analytics Feedback Loop

---

# Final Architecture

Next.js
↓
FastAPI
↓
n8n
├─ Claude
├─ Kling
├─ TTS
├─ FFmpeg
├─ Platform APIs
└─ Scheduler
↓
PostgreSQL
↓
MinIO
↓
Metabase

Production Score: 9.5/10
Suitable for Solo Fullstack Developer
