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

## Container
- Docker Compose
- Portainer
- Traefik

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

products
analysis
templates
template_versions
brand_profiles
assets
content_jobs
scripts
voices
render_versions
compliance_checks
approvals
manual_posts
schedule
post_results
platform_accounts
api_costs
notifications
users

---

# Development Roadmap

Phase 1
- Docker
- PostgreSQL
- MinIO
- n8n
- Authentication

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
