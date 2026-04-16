-- ============================================================
-- Migration 009 — Sacrifice Detection
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Add sacrifice_detected flag to performance_feedback
ALTER TABLE performance_feedback
  ADD COLUMN IF NOT EXISTS sacrifice_detected BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Sacrifice patterns — tracks which signals fire on losing Triple Lock games
CREATE TABLE IF NOT EXISTS sacrifice_patterns (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bot             TEXT NOT NULL CHECK (bot IN ('A', 'B', 'C', 'D')),
  signal_name     TEXT NOT NULL,
  triple_lock_fires INT NOT NULL DEFAULT 0,    -- times signal fired on a triple_lock bet
  sacrifice_outcomes INT NOT NULL DEFAULT 0,   -- times that triple_lock bet LOST (sacrifice)
  lock_outcomes   INT NOT NULL DEFAULT 0,      -- times that triple_lock bet WON (true lock)
  sacrifice_rate  NUMERIC NOT NULL DEFAULT 0,  -- sacrifice_outcomes / (sacrifice + lock)
  last_updated    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (bot, signal_name)
);
ALTER TABLE sacrifice_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_sacrifice_patterns" ON sacrifice_patterns
  FOR ALL USING (true) WITH CHECK (true);

-- Index for fast per-bot lookups
CREATE INDEX IF NOT EXISTS sacrifice_patterns_bot_idx ON sacrifice_patterns(bot);
CREATE INDEX IF NOT EXISTS sacrifice_patterns_rate_idx ON sacrifice_patterns(bot, sacrifice_rate DESC);
