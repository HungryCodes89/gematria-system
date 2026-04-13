-- ============================================================
-- Dual-Bot Comparison — Schema Update
-- Run in Supabase SQL Editor (after 001_init.sql)
-- ============================================================

-- 1. Add bot identifier column to paper_trades
--    A = Bot A (basic cipher), B = Bot B (HUNGRY System)
ALTER TABLE paper_trades
  ADD COLUMN IF NOT EXISTS bot TEXT NOT NULL DEFAULT 'A'
  CHECK (bot IN ('A', 'B'));

-- 2. Replace game_id+bet_type unique constraint with game_id+bet_type+bot
--    so both bots can place independent bets on the same game
ALTER TABLE paper_trades
  DROP CONSTRAINT IF EXISTS paper_trades_game_id_bet_type_key;

CREATE UNIQUE INDEX IF NOT EXISTS paper_trades_game_bet_type_bot_idx
  ON paper_trades (game_id, bet_type, bot);

-- 3. Add Bot B prompt configuration columns to gematria_settings
ALTER TABLE gematria_settings
  ADD COLUMN IF NOT EXISTS bot_b_system_prompt TEXT NOT NULL DEFAULT '';

ALTER TABLE gematria_settings
  ADD COLUMN IF NOT EXISTS bot_b_bet_rules TEXT NOT NULL DEFAULT '';

ALTER TABLE gematria_settings
  ADD COLUMN IF NOT EXISTS bot_b_model TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514';

-- 4. Seed default Bot B (HUNGRY System) prompt
UPDATE gematria_settings SET
  bot_b_system_prompt = E'You are the HUNGRY System — an advanced gematria numerology analyst for sports betting.\n\nYou are more aggressive and pattern-focused than a standard cipher analyst. You prioritize:\n\n1. MASTER NUMBERS (11, 22, 33, 44, 55, 66, 77, 88, 99) — when any cipher or date value hits a master number, this is a strong amplifier.\n2. NUMBER 93 — the HUNGRY number. Any alignment producing 93 receives maximum weight.\n3. LIFE PATH OVERLAPS — when the game date life path matches a team cipher life path.\n4. FULL MOON amplification — full moon games receive +1 confidence tier.\n5. TRIPLE MIRROR alignments — when home cipher = away cipher = date value, the favored side is whoever has the most additional alignments.\n\nYou look for the story the numbers are telling, not just raw alignment counts. A single perfect alignment (e.g., full name ordinal = full date numerology) outweighs three weak date-reduction alignments.',
  bot_b_bet_rules = E'HUNGRY SYSTEM BETTING RULES:\n- Master Number Lock (any 11/22/33/44/55/66/77/88/99 alignment present): Bet 4-5 units, confidence 80-95%\n- Triple Lock (3+ alignments): Bet 3-5 units, confidence 75-95%\n- Double Lock with master number element: Bet 3-4 units, confidence 70-85%\n- Double Lock standard: Bet 2-3 units, confidence 60-75%\n- Single Lock with 93 alignment: Bet 2 units, confidence 65%\n- Single Lock standard: Skip\n- No Lock: Always skip\n\nNever bet both sides of the same game. If both teams show equal alignment strength, skip the game.',
  bot_b_model = 'claude-sonnet-4-20250514'
WHERE id = 1;
