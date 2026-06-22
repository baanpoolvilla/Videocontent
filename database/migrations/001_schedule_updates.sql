-- Migration 001: make manual_posts.render_id nullable + add scheduled_at
-- Run once: psql -U $POSTGRES_USER -d $POSTGRES_DB -f migrations/001_schedule_updates.sql

ALTER TABLE manual_posts ALTER COLUMN render_id DROP NOT NULL;
ALTER TABLE manual_posts ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_manual_posts_job ON manual_posts(content_job_id);
CREATE INDEX IF NOT EXISTS idx_manual_posts_scheduled ON manual_posts(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_manual_posts_status ON manual_posts(status);
