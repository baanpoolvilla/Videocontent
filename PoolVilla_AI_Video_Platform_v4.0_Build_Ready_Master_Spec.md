# PoolVilla AI Video Platform v4.0 Build-Ready Master Spec

## Technology Stack

Frontend:
- Next.js 15
- TypeScript
- TailwindCSS
- shadcn/ui

Backend:
- FastAPI
- SQLAlchemy
- Alembic

Database:
- PostgreSQL 16

Queue:
- Redis
- Celery

Storage:
- MinIO

Video Engine:
- FFmpeg
- Remotion

AI:
- OpenAI
- Gemini

Voice:
- Edge TTS
- ElevenLabs

Deployment:
- Docker Compose

---

# System Flow

Upload Assets
-> AI Analysis
-> Scene Planning
-> Script Generation
-> Voice Generation
-> Subtitle Generation
-> Video Composition
-> Render Queue
-> Export MP4
-> Publish

---

# Database Schema

## users
id UUID PK
email VARCHAR(255) UNIQUE
password_hash TEXT
role VARCHAR(50)
created_at TIMESTAMP

## brand_profiles
id UUID PK
name VARCHAR(255)
tone_of_voice TEXT
audience TEXT
cta TEXT
line_oa TEXT
website TEXT
is_default BOOLEAN

## assets
id UUID PK
file_name VARCHAR(255)
file_type VARCHAR(50)
storage_path TEXT
thumbnail_path TEXT
created_at TIMESTAMP

## scene_plans
id UUID PK
asset_set_id UUID
scene_json JSONB

## scripts
id UUID PK
scene_plan_id UUID
script_text TEXT

## voices
id UUID PK
provider VARCHAR(50)
file_path TEXT

## subtitles
id UUID PK
file_path TEXT

## render_jobs
id UUID PK
status VARCHAR(50)
progress INT
output_path TEXT

---

# API

POST /api/auth/login
POST /api/assets/upload
GET /api/assets
POST /api/analysis/run
POST /api/scenes/generate
POST /api/scripts/generate
POST /api/voices/generate
POST /api/subtitles/generate
POST /api/render/create
GET /api/render/{id}

---

# AI Analysis

Input:
- Images
- Videos

Output:
{
 property_type,
 bedrooms,
 pool,
 highlights,
 audience
}

---

# Scene Planner

Scene 1 Hook
Scene 2 Exterior
Scene 3 Pool
Scene 4 Bedroom
Scene 5 Living Room
Scene 6 CTA

---

# Prompt Templates

Property Analysis Prompt

Script Writing Prompt

Voice Prompt

Subtitle Prompt

---

# Video Composer

Effects

- Zoom In
- Zoom Out
- Pan
- Fade
- Slide
- Blur

Doodle

- Arrow
- Circle
- Highlight
- Star

---

# Remotion Templates

LuxuryVilla.tsx
FamilyVilla.tsx
PartyVilla.tsx
Promotion.tsx

---

# Celery Tasks

asset_analysis_task
scene_generation_task
script_generation_task
voice_generation_task
subtitle_generation_task
video_render_task

---

# Docker Compose Services

frontend
backend
postgres
redis
minio
worker

---

# Folder Structure

apps/frontend
apps/backend

backend/app/api
backend/app/models
backend/app/services
backend/app/tasks

storage/assets
storage/audio
storage/subtitles
storage/renders

docs

---

# MVP Acceptance

Upload 10 Photos
Generate Script
Generate Voice
Generate Subtitle
Render MP4

No Manual Editing Required

---

# Claude Code Instructions

1. Build backend first
2. Create PostgreSQL models
3. Create FastAPI endpoints
4. Create Celery workers
5. Create Asset Library UI
6. Create Brand Profile UI
7. Create Video Composer
8. Create Render Queue
9. Create Docker deployment
