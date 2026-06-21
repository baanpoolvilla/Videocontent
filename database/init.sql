-- AI Content Production Pipeline — Database Schema
-- Version: 1.1

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── ENUMs ────────────────────────────────────────────────────────────────────

CREATE TYPE job_status AS ENUM (
  'pending', 'processing', 'completed', 'failed', 'dead_letter', 'retrying'
);

CREATE TYPE review_status AS ENUM (
  'draft', 'review_needed', 'approved', 'rejected'
);

CREATE TYPE post_status AS ENUM (
  'scheduled', 'publishing', 'published', 'failed'
);

CREATE TYPE platform_type AS ENUM (
  'tiktok', 'instagram', 'youtube_shorts', 'facebook', 'twitter'
);

CREATE TYPE asset_type AS ENUM (
  'image', 'video', 'audio', 'logo', 'overlay', 'intro', 'outro'
);

CREATE TYPE notification_channel AS ENUM (
  'telegram', 'line', 'discord'
);

CREATE TYPE notification_event AS ENUM (
  'render_success', 'render_failed', 'post_success', 'token_expired', 'review_needed'
);

-- ─── USERS ────────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  hashed_password TEXT NOT NULL,
  full_name     VARCHAR(255),
  is_active     BOOLEAN DEFAULT true,
  is_superuser  BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── BRAND PROFILES ───────────────────────────────────────────────────────────

CREATE TABLE brand_profiles (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  tone_of_voice   TEXT,
  target_audience TEXT,
  cta_style       TEXT,
  forbidden_words TEXT[],
  is_default      BOOLEAN DEFAULT false,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PRODUCTS ─────────────────────────────────────────────────────────────────

CREATE TABLE products (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(500) NOT NULL,
  description     TEXT,
  category        VARCHAR(255),
  price           DECIMAL(12, 2),
  brand_profile_id UUID REFERENCES brand_profiles(id),
  media_urls      JSONB DEFAULT '[]',
  metadata        JSONB DEFAULT '{}',
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── AI ANALYSIS ──────────────────────────────────────────────────────────────

CREATE TABLE analysis (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  model_used      VARCHAR(100) DEFAULT 'claude-haiku-4-5',
  raw_response    JSONB,
  key_features    TEXT[],
  selling_points  TEXT[],
  target_audience TEXT,
  mood            VARCHAR(100),
  suggested_hooks TEXT[],
  tokens_used     INTEGER,
  cost_usd        DECIMAL(10, 6),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── TEMPLATES ────────────────────────────────────────────────────────────────

CREATE TABLE templates (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  category    VARCHAR(100),
  platform    platform_type,
  is_active   BOOLEAN DEFAULT true,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE template_versions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id     UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  version         INTEGER NOT NULL DEFAULT 1,
  prompt_template TEXT NOT NULL,
  variables       JSONB DEFAULT '{}',
  performance     JSONB DEFAULT '{}',
  is_current      BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (template_id, version)
);

-- ─── ASSET LIBRARY ────────────────────────────────────────────────────────────

CREATE TABLE assets (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(500) NOT NULL,
  asset_type  asset_type NOT NULL,
  url         TEXT NOT NULL,
  bucket      VARCHAR(255),
  size_bytes  BIGINT,
  mime_type   VARCHAR(100),
  tags        TEXT[],
  metadata    JSONB DEFAULT '{}',
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CONTENT JOBS ─────────────────────────────────────────────────────────────

CREATE TABLE content_jobs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id          UUID NOT NULL REFERENCES products(id),
  template_version_id UUID REFERENCES template_versions(id),
  brand_profile_id    UUID REFERENCES brand_profiles(id),
  status              job_status DEFAULT 'pending',
  review_status       review_status DEFAULT 'draft',
  platform            platform_type,
  error_message       TEXT,
  retry_count         INTEGER DEFAULT 0,
  max_retries         INTEGER DEFAULT 3,
  n8n_execution_id    VARCHAR(255),
  created_by          UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── SCRIPTS ──────────────────────────────────────────────────────────────────

CREATE TABLE scripts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_job_id  UUID NOT NULL REFERENCES content_jobs(id) ON DELETE CASCADE,
  hook            TEXT,
  body            TEXT,
  cta             TEXT,
  full_script     TEXT,
  version         INTEGER DEFAULT 1,
  model_used      VARCHAR(100),
  prompt_version  INTEGER DEFAULT 1,
  tokens_used     INTEGER,
  cost_usd        DECIMAL(10, 6),
  reviewer_notes  TEXT,
  is_approved     BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── VOICES ───────────────────────────────────────────────────────────────────

CREATE TABLE voices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_job_id  UUID NOT NULL REFERENCES content_jobs(id) ON DELETE CASCADE,
  script_id       UUID REFERENCES scripts(id),
  provider        VARCHAR(50),
  voice_id        VARCHAR(255),
  language        VARCHAR(20) DEFAULT 'th',
  speed           DECIMAL(3, 2) DEFAULT 1.0,
  audio_url       TEXT,
  duration_sec    DECIMAL(8, 2),
  cost_usd        DECIMAL(10, 6),
  status          job_status DEFAULT 'pending',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── RENDER VERSIONS ─────────────────────────────────────────────────────────

CREATE TABLE render_versions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_job_id  UUID NOT NULL REFERENCES content_jobs(id) ON DELETE CASCADE,
  version_label   VARCHAR(10),
  voice_id        UUID REFERENCES voices(id),
  intro_asset_id  UUID REFERENCES assets(id),
  outro_asset_id  UUID REFERENCES assets(id),
  overlay_asset_id UUID REFERENCES assets(id),
  kling_task_id   VARCHAR(255),
  kling_status    VARCHAR(50),
  raw_video_url   TEXT,
  final_video_url TEXT,
  thumbnail_url   TEXT,
  duration_sec    DECIMAL(8, 2),
  resolution      VARCHAR(20),
  status          job_status DEFAULT 'pending',
  cost_usd        DECIMAL(10, 6),
  ffmpeg_config   JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── COMPLIANCE CHECKS ────────────────────────────────────────────────────────

CREATE TABLE compliance_checks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  render_id       UUID NOT NULL REFERENCES render_versions(id) ON DELETE CASCADE,
  check_type      VARCHAR(100),
  passed          BOOLEAN,
  issues          TEXT[],
  details         JSONB DEFAULT '{}',
  checked_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── APPROVALS ────────────────────────────────────────────────────────────────

CREATE TABLE approvals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_job_id  UUID NOT NULL REFERENCES content_jobs(id) ON DELETE CASCADE,
  render_id       UUID REFERENCES render_versions(id),
  approved_by     UUID REFERENCES users(id),
  status          review_status DEFAULT 'review_needed',
  comment         TEXT,
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── MANUAL POSTS ─────────────────────────────────────────────────────────────

CREATE TABLE manual_posts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_job_id  UUID NOT NULL REFERENCES content_jobs(id) ON DELETE CASCADE,
  render_id       UUID REFERENCES render_versions(id),
  platform        platform_type NOT NULL,
  caption         TEXT,
  hashtags        TEXT[],
  posted_by       UUID REFERENCES users(id),
  posted_at       TIMESTAMPTZ,
  external_post_id VARCHAR(500),
  status          post_status DEFAULT 'scheduled',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── SCHEDULE ─────────────────────────────────────────────────────────────────

CREATE TABLE schedule (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_job_id  UUID NOT NULL REFERENCES content_jobs(id) ON DELETE CASCADE,
  render_id       UUID NOT NULL REFERENCES render_versions(id),
  platform        platform_type NOT NULL,
  account_id      UUID,
  caption         TEXT,
  hashtags        TEXT[],
  scheduled_at    TIMESTAMPTZ NOT NULL,
  published_at    TIMESTAMPTZ,
  status          post_status DEFAULT 'scheduled',
  n8n_workflow_id VARCHAR(255),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── POST RESULTS / ANALYTICS ─────────────────────────────────────────────────

CREATE TABLE post_results (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id       UUID REFERENCES schedule(id),
  manual_post_id    UUID REFERENCES manual_posts(id),
  platform          platform_type NOT NULL,
  external_post_id  VARCHAR(500),
  views             BIGINT DEFAULT 0,
  likes             BIGINT DEFAULT 0,
  comments          BIGINT DEFAULT 0,
  shares            BIGINT DEFAULT 0,
  saves             BIGINT DEFAULT 0,
  watch_time_avg    DECIMAL(8, 2),
  completion_rate   DECIMAL(5, 2),
  ctr               DECIMAL(5, 4),
  reach             BIGINT DEFAULT 0,
  impressions       BIGINT DEFAULT 0,
  fetched_at        TIMESTAMPTZ DEFAULT NOW(),
  raw_data          JSONB DEFAULT '{}'
);

-- ─── PLATFORM ACCOUNTS ────────────────────────────────────────────────────────

CREATE TABLE platform_accounts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform        platform_type NOT NULL,
  account_name    VARCHAR(255) NOT NULL,
  account_id      VARCHAR(500),
  access_token    TEXT,
  refresh_token   TEXT,
  token_expires_at TIMESTAMPTZ,
  is_active       BOOLEAN DEFAULT true,
  metadata        JSONB DEFAULT '{}',
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── API COSTS ────────────────────────────────────────────────────────────────

CREATE TABLE api_costs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_job_id  UUID REFERENCES content_jobs(id),
  service         VARCHAR(50) NOT NULL,
  operation       VARCHAR(100),
  tokens_input    INTEGER,
  tokens_output   INTEGER,
  units           DECIMAL(10, 4),
  cost_usd        DECIMAL(10, 6) NOT NULL,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES users(id),
  channel         notification_channel NOT NULL,
  event           notification_event NOT NULL,
  title           VARCHAR(500),
  body            TEXT,
  payload         JSONB DEFAULT '{}',
  sent_at         TIMESTAMPTZ,
  status          VARCHAR(20) DEFAULT 'pending',
  error           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── INDEXES ─────────────────────────────────────────────────────────────────

CREATE INDEX idx_products_brand ON products(brand_profile_id);
CREATE INDEX idx_content_jobs_product ON content_jobs(product_id);
CREATE INDEX idx_content_jobs_status ON content_jobs(status);
CREATE INDEX idx_content_jobs_review ON content_jobs(review_status);
CREATE INDEX idx_scripts_job ON scripts(content_job_id);
CREATE INDEX idx_voices_job ON voices(content_job_id);
CREATE INDEX idx_render_versions_job ON render_versions(content_job_id);
CREATE INDEX idx_render_versions_status ON render_versions(status);
CREATE INDEX idx_schedule_scheduled_at ON schedule(scheduled_at);
CREATE INDEX idx_schedule_status ON schedule(status);
CREATE INDEX idx_post_results_platform ON post_results(platform);
CREATE INDEX idx_api_costs_service ON api_costs(service);
CREATE INDEX idx_api_costs_job ON api_costs(content_job_id);
CREATE INDEX idx_notifications_user ON notifications(user_id);

-- ─── DEFAULT DATA ─────────────────────────────────────────────────────────────

INSERT INTO brand_profiles (name, description, tone_of_voice, target_audience, cta_style, is_default)
VALUES (
  'Default Brand',
  'Brand profile เริ่มต้น',
  'เป็นมิตร น่าเชื่อถือ มีความเป็นมืออาชีพ',
  'กลุ่มผู้บริโภคทั่วไป อายุ 18-45 ปี',
  'กระตุ้นการซื้อด้วยส่วนลดและความเร่งด่วน',
  true
);
