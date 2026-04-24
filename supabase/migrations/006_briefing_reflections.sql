-- Daily post-game reflection for each bot
-- Generated after settlement; injected into the next morning's briefing prompt
-- so bots can temper absolute language with their own track record.

CREATE TABLE IF NOT EXISTS briefing_reflections (
  id              BIGSERIAL PRIMARY KEY,
  reflection_date DATE        NOT NULL,
  bot             TEXT        NOT NULL,
  original_briefing TEXT,
  reflection_content TEXT     NOT NULL,
  trades_won      INTEGER     NOT NULL DEFAULT 0,
  trades_lost     INTEGER     NOT NULL DEFAULT 0,
  trades_pushed   INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (reflection_date, bot)
);

CREATE INDEX IF NOT EXISTS idx_briefing_reflections_bot_date
  ON briefing_reflections (bot, reflection_date DESC);
