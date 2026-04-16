-- ============================================================
-- Migration 008 — Signal Weights + Performance Feedback
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Performance feedback — one row per settled bet
CREATE TABLE IF NOT EXISTS performance_feedback (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trade_id      UUID NOT NULL,
  game_id       TEXT NOT NULL,
  game_date     DATE NOT NULL,
  bot           TEXT NOT NULL CHECK (bot IN ('A', 'B', 'C', 'D')),
  signals       TEXT[] NOT NULL DEFAULT '{}',
  result        TEXT NOT NULL CHECK (result IN ('win', 'loss', 'push')),
  clv_percent   NUMERIC,
  other_bot_picks JSONB DEFAULT '{}',
  consensus_result TEXT CHECK (consensus_result IN ('hit', 'miss', 'mixed', 'solo', 'push')),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS perf_feedback_bot_idx  ON performance_feedback(bot);
CREATE INDEX IF NOT EXISTS perf_feedback_date_idx ON performance_feedback(game_date);
ALTER TABLE performance_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_perf_feedback" ON performance_feedback
  FOR ALL USING (true) WITH CHECK (true);

-- 2. Signal weights — one row per (bot, signal_name)
CREATE TABLE IF NOT EXISTS signal_weights (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bot          TEXT NOT NULL CHECK (bot IN ('A', 'B', 'C', 'D')),
  signal_name  TEXT NOT NULL,
  times_fired  INT NOT NULL DEFAULT 0,
  wins         INT NOT NULL DEFAULT 0,
  losses       INT NOT NULL DEFAULT 0,
  pushes       INT NOT NULL DEFAULT 0,
  total_clv    NUMERIC NOT NULL DEFAULT 0,
  win_rate     NUMERIC NOT NULL DEFAULT 0,
  avg_clv      NUMERIC NOT NULL DEFAULT 0,
  weight_score NUMERIC NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (bot, signal_name)
);
ALTER TABLE signal_weights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_signal_weights" ON signal_weights
  FOR ALL USING (true) WITH CHECK (true);

-- 3. Weekly summaries
CREATE TABLE IF NOT EXISTS weekly_summaries (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  week_start   DATE NOT NULL UNIQUE,
  content      TEXT NOT NULL DEFAULT '',
  bets_analyzed INT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE weekly_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_weekly_summaries" ON weekly_summaries
  FOR ALL USING (true) WITH CHECK (true);
