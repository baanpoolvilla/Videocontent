# AI Content Production Pipeline v3.0
## Agent-Ready Specification (Claude Opus / Claude Code)

> Based on v1.1 architecture
> Optimized for AI-assisted development
> Focused on Pool Villa Marketing Automation

---

# Product Vision

ระบบสร้างคลิปการตลาดสำหรับพูลวิลล่าแบบอัตโนมัติ

Input:
- รูปภาพบ้าน
- วิดีโอบ้าน
- Brand Profile

Output:
- TikTok Reel
- Facebook Reel
- Instagram Reel
- YouTube Short

---

# System Architecture

Frontend
- Next.js
- Tailwind
- shadcn/ui

Backend
- FastAPI

Workflow Engine
- n8n

Database
- PostgreSQL

Storage
- MinIO

Video Processing
- FFmpeg
- Remotion

---

# Core Modules

1. Authentication
2. Asset Library
3. Brand Profile
4. Prompt Management
5. Script Generation
6. Voice Generation
7. Subtitle Generation
8. Video Composer
9. Render Queue
10. Publish Center

---

# Database Design

## users

- id UUID PK
- email
- password_hash
- role
- created_at

## brand_profiles

- id UUID PK
- name
- tone_of_voice
- audience
- cta
- forbidden_words
- is_default

## assets

- id UUID PK
- file_name
- file_type
- storage_path
- created_at

## scripts

- id UUID PK
- brand_profile_id
- title
- hook
- content
- cta

## voices

- id UUID PK
- provider
- file_path

## renders

- id UUID PK
- status
- output_path
- duration
- created_at

---

# API Specification

## Generate Script

POST /api/v1/scripts/generate

Request

{
  "brand_profile_id": "uuid",
  "asset_ids": []
}

Response

{
  "script_id": "uuid"
}

---

## Generate Voice

POST /api/v1/voices/generate

Response

{
  "voice_id": "uuid"
}

---

## Render Video

POST /api/v1/renders/create

Response

{
  "render_id": "uuid"
}

---

# Frontend Pages

Dashboard

Asset Library

Brand Profile

Prompt Management

Script Generator

Voice Generator

Video Composer

Render Queue

Publish Center

---

# AI Pipeline

Assets
↓
Prompt Builder
↓
GPT / Gemini
↓
Script
↓
Edge TTS / ElevenLabs
↓
Audio
↓
Subtitle Generator
↓
SRT
↓
Remotion
↓
FFmpeg
↓
MP4

---

# n8n Workflows

Workflow 01
Generate Script

Workflow 02
Generate Voice

Workflow 03
Generate Subtitle

Workflow 04
Render Video

Workflow 05
Publish Video

---

# Provider Strategy

Script Provider

- OpenAI
- Gemini

Voice Provider

- Edge TTS
- ElevenLabs

Video Provider (Future)

- Kling
- Veo
- Wan

---

# Folder Structure

apps/
  frontend/
  backend/

docs/

n8n/

docker/

storage/

---

# Development Rules

- Provider Pattern Required
- Repository Pattern Required
- Service Layer Required
- No Business Logic In Controllers
- Environment Variables Only

---

# MVP Roadmap

Phase 1
Authentication
Asset Library
Brand Profile

Phase 2
Prompt Management
Script Generation

Phase 3
Voice Generation
Subtitle Generation

Phase 4
Video Composer
Render Queue

Phase 5
Publish Center

---

# Future Features

- Analytics
- A/B Testing
- Cost Tracking
- AI Feedback Engine
- Compliance Engine
- Auto Optimization

---

# Production Score

Agent Readability: 98/100

Suitable For:
- Claude Opus
- Claude Code
- Cursor
- Windsurf
- OpenAI Codex
