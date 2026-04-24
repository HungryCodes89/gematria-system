-- historical_games: 6-year archive of completed game results.
-- Populated by: scripts/backfill-historical.mjs (one-time, run manually)
-- Kept current by: settle route upserts each final game automatically.
-- Used by: h2h-engine.ts to compute H2H records and team form for Claude context.

CREATE TABLE IF NOT EXISTS historical_games (
  id          TEXT        PRIMARY KEY,
  league      TEXT        NOT NULL CHECK (league IN ('NBA','NHL','MLB')),
  season      TEXT        NOT NULL,
  game_date   DATE        NOT NULL,
  home_team   TEXT        NOT NULL,
  away_team   TEXT        NOT NULL,
  home_score  INT,
  away_score  INT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for H2H and team-form queries
CREATE INDEX IF NOT EXISTS idx_hg_date      ON historical_games (game_date DESC);
CREATE INDEX IF NOT EXISTS idx_hg_home      ON historical_games (league, home_team, game_date DESC);
CREATE INDEX IF NOT EXISTS idx_hg_away      ON historical_games (league, away_team, game_date DESC);
CREATE INDEX IF NOT EXISTS idx_hg_h2h_ab    ON historical_games (league, home_team, away_team, game_date DESC);
CREATE INDEX IF NOT EXISTS idx_hg_h2h_ba    ON historical_games (league, away_team, home_team, game_date DESC);
