-- ============================================================
-- Migration 010 — Bot Reconciliation Layer
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. skipped_picks — log for games where bots disagreed on side
CREATE TABLE IF NOT EXISTS skipped_picks (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id      TEXT NOT NULL REFERENCES games(id),
  reason       TEXT NOT NULL,          -- 'bot_disagreement' | future reasons
  bot_decisions JSONB,                 -- snapshot of each bot's decision at skip time
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skipped_picks_game    ON skipped_picks(game_id);
CREATE INDEX IF NOT EXISTS idx_skipped_picks_created ON skipped_picks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_skipped_picks_date    ON skipped_picks(DATE(created_at));

ALTER TABLE skipped_picks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_skipped_picks" ON skipped_picks
  FOR ALL USING (true) WITH CHECK (true);

-- 2. Add reconciliation columns to paper_trades
ALTER TABLE paper_trades
  ADD COLUMN IF NOT EXISTS convergence_count INTEGER;

ALTER TABLE paper_trades
  ADD COLUMN IF NOT EXISTS convergent_bots TEXT[];

ALTER TABLE paper_trades
  ADD COLUMN IF NOT EXISTS sizing_note TEXT;

-- was_reconciled = true whenever the reconciliation layer produced this trade
-- (false / NULL = legacy single-bot placement before this migration)
ALTER TABLE paper_trades
  ADD COLUMN IF NOT EXISTS was_reconciled BOOLEAN DEFAULT FALSE;
