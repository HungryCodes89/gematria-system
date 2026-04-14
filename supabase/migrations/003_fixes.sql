-- ============================================================
-- Migration 003 — Bug fixes
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Fix bot constraint — allow Bot C (was restricted to 'A' and 'B' only)
ALTER TABLE paper_trades DROP CONSTRAINT IF EXISTS paper_trades_bot_check;
ALTER TABLE paper_trades ADD CONSTRAINT paper_trades_bot_check
  CHECK (bot IN ('A', 'B', 'C'));

-- 2. Add lock_type and gematria_confidence to games table
ALTER TABLE games ADD COLUMN IF NOT EXISTS lock_type TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS gematria_confidence INT;

-- 3. Add is_primetime to games table
ALTER TABLE games ADD COLUMN IF NOT EXISTS is_primetime BOOLEAN DEFAULT FALSE;

-- 4. Create decode_notes table
CREATE TABLE IF NOT EXISTS decode_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_date DATE NOT NULL UNIQUE,
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE decode_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_decode_notes" ON decode_notes
  FOR ALL USING (true) WITH CHECK (true);

-- 5. Create validated_patterns table
CREATE TABLE IF NOT EXISTS validated_patterns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern_type TEXT NOT NULL,
  cipher_values JSONB DEFAULT '[]',
  date_numerology JSONB DEFAULT '[]',
  sport TEXT,
  teams_involved TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('hit', 'miss')),
  notes TEXT,
  confidence_score INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE validated_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_patterns" ON validated_patterns
  FOR ALL USING (true) WITH CHECK (true);

-- 6. Fix model name + enable double/single lock auto-bet
--    (old seed used claude-sonnet-4-20250514 which is invalid)
UPDATE gematria_settings SET
  model = 'claude-sonnet-4-6',
  bot_b_model = 'claude-sonnet-4-6',
  auto_bet_double_locks = TRUE,
  auto_bet_single_locks = FALSE
WHERE id = 1;

-- Also fix bot_c_model if column exists (added in a previous session)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gematria_settings' AND column_name = 'bot_c_model'
  ) THEN
    UPDATE gematria_settings SET bot_c_model = 'claude-sonnet-4-6' WHERE id = 1;
  END IF;
END $$;

-- 7. Add bot C columns to gematria_settings if not present
ALTER TABLE gematria_settings ADD COLUMN IF NOT EXISTS bot_c_system_prompt TEXT NOT NULL DEFAULT '';
ALTER TABLE gematria_settings ADD COLUMN IF NOT EXISTS bot_c_bet_rules TEXT NOT NULL DEFAULT '';
ALTER TABLE gematria_settings ADD COLUMN IF NOT EXISTS bot_c_model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6';
