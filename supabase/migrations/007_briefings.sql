-- ============================================================
-- Migration 007 — Daily Briefings + Bot D fixes
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Expand paper_trades bot constraint to include 'D'
ALTER TABLE paper_trades DROP CONSTRAINT IF EXISTS paper_trades_bot_check;
ALTER TABLE paper_trades ADD CONSTRAINT paper_trades_bot_check
  CHECK (bot IN ('A', 'B', 'C', 'D'));

-- 2. Add bot_d columns to gematria_settings (safe if already added)
ALTER TABLE gematria_settings ADD COLUMN IF NOT EXISTS bot_d_system_prompt TEXT NOT NULL DEFAULT '';
ALTER TABLE gematria_settings ADD COLUMN IF NOT EXISTS bot_d_bet_rules    TEXT NOT NULL DEFAULT '';
ALTER TABLE gematria_settings ADD COLUMN IF NOT EXISTS bot_d_model        TEXT NOT NULL DEFAULT 'claude-sonnet-4-6';

-- 3. Daily Briefings table
CREATE TABLE IF NOT EXISTS daily_briefings (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  briefing_date DATE NOT NULL,
  bot          TEXT NOT NULL CHECK (bot IN ('A', 'B', 'C', 'D', 'consensus')),
  content      TEXT NOT NULL DEFAULT '',
  games_count  INT  DEFAULT 0,
  bets_count   INT  DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (briefing_date, bot)
);
ALTER TABLE daily_briefings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_briefings" ON daily_briefings
  FOR ALL USING (true) WITH CHECK (true);
