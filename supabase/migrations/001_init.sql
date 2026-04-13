-- ============================================================
-- Gematria Betting App — Complete Database Schema
-- Run this entire file in Supabase SQL Editor (one time)
-- ============================================================

-- 1. GAMES TABLE
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  league TEXT NOT NULL CHECK (league IN ('NBA', 'NHL', 'MLB')),
  game_date DATE NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  home_score INT,
  away_score INT,
  status TEXT DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'pre', 'in_progress', 'final')),
  venue TEXT,
  start_time TIMESTAMPTZ,
  home_record TEXT,
  away_record TEXT,
  home_wins INT DEFAULT 0,
  away_wins INT DEFAULT 0,
  home_losses INT,
  away_losses INT,
  polymarket_odds JSONB,
  is_full_moon BOOLEAN DEFAULT FALSE,
  analyzed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_games_date ON games(game_date);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_league ON games(league);

-- 2. PAPER TRADES TABLE
CREATE TABLE IF NOT EXISTS paper_trades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  bet_type TEXT NOT NULL
    CHECK (bet_type IN ('moneyline', 'over_under')),
  pick TEXT NOT NULL,
  picked_side TEXT
    CHECK (picked_side IS NULL OR picked_side IN ('home', 'away')),
  odds INT,
  implied_probability NUMERIC,
  model_probability NUMERIC,
  ev NUMERIC,
  units NUMERIC NOT NULL,
  stake NUMERIC NOT NULL,
  potential_profit NUMERIC,
  result TEXT DEFAULT 'pending'
    CHECK (result IN ('pending', 'win', 'loss', 'push', 'void')),
  profit_loss NUMERIC DEFAULT 0,
  confidence NUMERIC,
  lock_type TEXT,
  reasoning TEXT,
  placed_at TIMESTAMPTZ DEFAULT NOW(),
  settled_at TIMESTAMPTZ,
  UNIQUE(game_id, bet_type)
);

CREATE INDEX IF NOT EXISTS idx_trades_result ON paper_trades(result);
CREATE INDEX IF NOT EXISTS idx_trades_placed ON paper_trades(placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_game ON paper_trades(game_id);

ALTER TABLE paper_trades ADD CONSTRAINT chk_pl_zero_pending
  CHECK (result NOT IN ('pending', 'push', 'void') OR profit_loss = 0) NOT VALID;
ALTER TABLE paper_trades ADD CONSTRAINT chk_positive_sizing
  CHECK (stake >= 0 AND units >= 0) NOT VALID;

-- 3. BANKROLL LEDGER TABLE
CREATE TABLE IF NOT EXISTS bankroll_ledger (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  balance NUMERIC NOT NULL DEFAULT 10000,
  daily_pl NUMERIC DEFAULT 0,
  wins INT DEFAULT 0,
  losses INT DEFAULT 0,
  bets_placed INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_date ON bankroll_ledger(date DESC);

INSERT INTO bankroll_ledger (date, balance, daily_pl)
VALUES (CURRENT_DATE, 10000, 0)
ON CONFLICT (date) DO NOTHING;

-- 4. GEMATRIA SETTINGS TABLE
CREATE TABLE IF NOT EXISTS gematria_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  system_prompt TEXT NOT NULL DEFAULT '',
  bet_rules TEXT NOT NULL DEFAULT '',
  model TEXT DEFAULT 'claude-sonnet-4-20250514',
  max_units_per_bet INT DEFAULT 5,
  max_daily_units INT DEFAULT 20,
  unit_size NUMERIC DEFAULT 100,
  min_confidence NUMERIC DEFAULT 55,
  auto_bet_triple_locks BOOLEAN DEFAULT TRUE,
  auto_bet_double_locks BOOLEAN DEFAULT FALSE,
  auto_bet_single_locks BOOLEAN DEFAULT FALSE,
  starting_bankroll NUMERIC DEFAULT 10000,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO gematria_settings (
  id,
  system_prompt,
  bet_rules
) VALUES (
  1,
  E'You are a gematria numerology specialist for sports betting.\n\nYou analyze the numerical alignments between team names, player names, venue names, and the game date using four ciphers (Ordinal, Reduction, Reverse Ordinal, Reverse Reduction) and five date numerology methods.\n\nWhen cipher values match date values, these are called "alignments." More alignments = stronger signal.\n\nYour job is to evaluate each game''s gematria profile and decide whether to bet, and if so, which side and how many units.\n\nBase your confidence on the number and quality of alignments, paying special attention to:\n- Triple Locks (3+ alignments) = strongest signal\n- Full name + city alignments carry more weight\n- Date reduction matches are most common but least powerful\n- Multiple cipher types matching the same date method is very strong\n- Moon phase can amplify or dampen signals',
  E'BETTING RULES:\n- Triple Lock (3+ alignments): Bet 3-5 units, confidence 70-95%\n- Double Lock (2 alignments): Bet 1-3 units, confidence 55-75%\n- Single Lock (1 alignment): Usually skip, or bet 1 unit at 50-60% confidence\n- No Lock (0 alignments): Skip\n\nAlways provide your reasoning explaining which alignments drove the decision.'
) ON CONFLICT (id) DO NOTHING;

-- 5. HELPER: updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_games_updated
  BEFORE UPDATE ON games
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_settings_updated
  BEFORE UPDATE ON gematria_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. ROW LEVEL SECURITY
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE bankroll_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE gematria_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read games" ON games FOR SELECT USING (true);
CREATE POLICY "Allow anon read trades" ON paper_trades FOR SELECT USING (true);
CREATE POLICY "Allow anon read ledger" ON bankroll_ledger FOR SELECT USING (true);
CREATE POLICY "Allow anon read settings" ON gematria_settings FOR SELECT USING (true);
