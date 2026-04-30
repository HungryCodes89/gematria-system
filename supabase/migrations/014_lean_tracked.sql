-- ============================================================
-- Migration 014 — Add lean_tracked bet_type
-- Run in Supabase SQL Editor
-- ============================================================

-- Allow lean_tracked as a valid bet_type.
-- lean_tracked rows are directional signals with no stake (units=0, stake=0).
-- Added after lean tier was introduced in code but constraint was never updated.
ALTER TABLE paper_trades
  DROP CONSTRAINT IF EXISTS paper_trades_bet_type_check;
ALTER TABLE paper_trades
  ADD CONSTRAINT paper_trades_bet_type_check
  CHECK (bet_type IN ('moneyline', 'over_under', 'analysis', 'lean_tracked'));
