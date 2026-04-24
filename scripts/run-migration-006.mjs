import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey)

// Check if table already exists
const { error: checkErr } = await supabase
  .from('briefing_reflections')
  .select('id')
  .limit(1)

if (!checkErr) {
  console.log('Table briefing_reflections already exists — nothing to do.')
  process.exit(0)
}

// Table does not exist — use Supabase's SQL endpoint (service role bypasses RLS)
const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '')

const sql = `
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
`

const res = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ query: sql }),
  }
)

if (res.ok) {
  console.log('Migration 006 applied via Supabase management API.')
  process.exit(0)
}

// Fallback: print SQL for manual execution
console.log('\n──────────────────────────────────────────────────────')
console.log('MANUAL STEP REQUIRED')
console.log('Paste the following SQL into your Supabase SQL editor:')
console.log(`https://supabase.com/dashboard/project/${projectRef}/sql/new`)
console.log('──────────────────────────────────────────────────────')
console.log(sql)
process.exit(1)
