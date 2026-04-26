-- ============================================================
-- Migration 012 — Playoff context columns on games table
-- Run in Supabase SQL Editor
-- ============================================================

ALTER TABLE games ADD COLUMN IF NOT EXISTS is_playoff         BOOLEAN DEFAULT FALSE;
ALTER TABLE games ADD COLUMN IF NOT EXISTS playoff_round      TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS series_game_number INTEGER;
ALTER TABLE games ADD COLUMN IF NOT EXISTS series_record      TEXT;

CREATE INDEX IF NOT EXISTS idx_games_is_playoff ON games(is_playoff) WHERE is_playoff = TRUE;
