import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey)

const { error } = await supabase.from('historical_games').select('id').limit(1)

if (!error) {
  console.log('Table historical_games already exists — migration already applied.')
  process.exit(0)
}

const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '')

console.log('\n──────────────────────────────────────────────────────')
console.log('MANUAL STEP REQUIRED')
console.log('Paste the SQL from supabase/migrations/007_h2h_stats.sql')
console.log('into your Supabase SQL editor:')
console.log(`https://supabase.com/dashboard/project/${projectRef}/sql/new`)
console.log('──────────────────────────────────────────────────────')
console.log(`
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

CREATE INDEX IF NOT EXISTS idx_hg_date   ON historical_games (game_date DESC);
CREATE INDEX IF NOT EXISTS idx_hg_home   ON historical_games (league, home_team, game_date DESC);
CREATE INDEX IF NOT EXISTS idx_hg_away   ON historical_games (league, away_team, game_date DESC);
CREATE INDEX IF NOT EXISTS idx_hg_h2h_ab ON historical_games (league, home_team, away_team, game_date DESC);
CREATE INDEX IF NOT EXISTS idx_hg_h2h_ba ON historical_games (league, away_team, home_team, game_date DESC);
`)
process.exit(1)
