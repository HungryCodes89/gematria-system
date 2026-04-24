// Backfill script: pulls 6 years of NBA, NHL, and MLB game results from
// ESPN and NHL public APIs and stores them in the historical_games table.
//
// Run: node --env-file=.env.local scripts/backfill-historical.mjs
//
// Options (env vars):
//   BACKFILL_START=2019-01-01  (default)
//   BACKFILL_END=today         (default)
//   BACKFILL_CONCURRENCY=8     (requests per league per batch, default 8)
//   BACKFILL_DELAY_MS=150      (ms between batches, default 150)
//   BACKFILL_DRY_RUN=true      (parse but don't write to DB)

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const sb = createClient(supabaseUrl, serviceKey)
const DRY_RUN = process.env.BACKFILL_DRY_RUN === 'true'
const CONCURRENCY = parseInt(process.env.BACKFILL_CONCURRENCY ?? '8', 10)
const DELAY_MS = parseInt(process.env.BACKFILL_DELAY_MS ?? '150', 10)

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports'
const NHL_BASE = 'https://api-web.nhle.com/v1'
const UA = 'Mozilla/5.0 (compatible; GematriaSports-Backfill/1.0)'

// ── Date helpers ──

function dateRange(startStr, endStr) {
  const dates = []
  const cur = new Date(startStr + 'T12:00:00Z')
  const end = new Date(endStr + 'T12:00:00Z')
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return dates
}

function getSeason(dateStr, league) {
  const [yr, mo] = dateStr.split('-').map(Number)
  if (league === 'MLB') return String(yr)
  if (mo >= 10) return `${yr}-${String(yr + 1).slice(2)}`
  return `${yr - 1}-${String(yr).slice(2)}`
}

// ── Fetch with retry ──

async function fetchRetry(url, retries = 3, delay = 800) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } })
      if (res.ok) return res
      if (res.status === 429 || res.status >= 500) {
        await new Promise(r => setTimeout(r, delay * (i + 1) * 2))
        continue
      }
      return null // 404 etc — no data for this date
    } catch {
      if (i === retries - 1) return null
      await new Promise(r => setTimeout(r, delay * (i + 1)))
    }
  }
  return null
}

// ── ESPN parser ──

function parseEspnScore(raw) {
  if (raw == null) return null
  if (typeof raw === 'number') return raw
  if (typeof raw === 'string') return parseInt(raw, 10) || null
  if (typeof raw === 'object' && 'value' in raw) return raw.value ?? null
  return null
}

async function fetchESPN(dateStr, sport, league) {
  const d = dateStr.replace(/-/g, '')
  const res = await fetchRetry(`${ESPN_BASE}/${sport}/scoreboard?dates=${d}`)
  if (!res) return []

  let data
  try { data = await res.json() } catch { return [] }

  return (data.events ?? []).flatMap(ev => {
    const comp = ev.competitions?.[0]
    if (!comp) return []
    const state = comp.status?.type?.state
    if (state !== 'post') return [] // only final games

    const home = comp.competitors?.find(c => c.homeAway === 'home')
    const away = comp.competitors?.find(c => c.homeAway === 'away')
    if (!home || !away) return []

    const statusName = String(comp.status?.type?.name ?? '').toUpperCase()
    if (statusName === 'STATUS_POSTPONED' || statusName === 'STATUS_SUSPENDED') return []

    const homeScore = parseEspnScore(home.score)
    const awayScore = parseEspnScore(away.score)
    if (homeScore == null || awayScore == null) return []

    return [{
      id: String(ev.id),
      league,
      season: getSeason(dateStr, league),
      game_date: dateStr,
      home_team: home.team?.displayName ?? '',
      away_team: away.team?.displayName ?? '',
      home_score: homeScore,
      away_score: awayScore,
    }]
  })
}

// ── NHL parser ──

async function fetchNHL(dateStr) {
  const res = await fetchRetry(`${NHL_BASE}/schedule/${dateStr}`)
  if (!res) return []

  let data
  try { data = await res.json() } catch { return [] }

  const games = []
  for (const week of data.gameWeek ?? []) {
    if (week.date !== dateStr) continue
    for (const g of week.games ?? []) {
      const state = g.gameState ?? ''
      if (!['OFF', 'FINAL', 'OVER'].includes(state)) continue

      const home = g.homeTeam
      const away = g.awayTeam
      if (!home || !away) continue

      const homeScore = home.score
      const awayScore = away.score
      if (homeScore == null || awayScore == null) continue

      const homeName = home.placeName?.default && home.commonName?.default
        ? `${home.placeName.default} ${home.commonName.default}`.trim()
        : home.abbrev ?? ''
      const awayName = away.placeName?.default && away.commonName?.default
        ? `${away.placeName.default} ${away.commonName.default}`.trim()
        : away.abbrev ?? ''

      games.push({
        id: String(g.id),
        league: 'NHL',
        season: getSeason(dateStr, 'NHL'),
        game_date: dateStr,
        home_team: homeName,
        away_team: awayName,
        home_score: homeScore,
        away_score: awayScore,
      })
    }
  }
  return games
}

// ── Batch helper ──

async function processBatch(dates, fetchFn) {
  const results = []
  for (let i = 0; i < dates.length; i += CONCURRENCY) {
    const chunk = dates.slice(i, i + CONCURRENCY)
    const chunkResults = await Promise.all(chunk.map(d => fetchFn(d).catch(() => [])))
    results.push(...chunkResults.flat())
    if (i + CONCURRENCY < dates.length) {
      await new Promise(r => setTimeout(r, DELAY_MS))
    }
  }
  return results
}

// ── Upsert to DB ──

async function upsertGames(rows) {
  if (rows.length === 0) return 0
  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would upsert ${rows.length} rows`)
    return rows.length
  }

  // Batch upserts in chunks of 500
  let total = 0
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const { error } = await sb
      .from('historical_games')
      .upsert(chunk, { onConflict: 'id', ignoreDuplicates: true })
    if (error) {
      console.error(`  DB error: ${error.message}`)
    } else {
      total += chunk.length
    }
  }
  return total
}

// ── Main ──

async function main() {
  const start = process.env.BACKFILL_START ?? '2019-01-01'
  const end = process.env.BACKFILL_END ?? new Date().toISOString().slice(0, 10)

  console.log(`Backfill: ${start} → ${end}`)
  console.log(`Concurrency: ${CONCURRENCY} | Delay: ${DELAY_MS}ms | DryRun: ${DRY_RUN}`)

  const { count } = await sb
    .from('historical_games')
    .select('*', { count: 'exact', head: true })
  console.log(`Current rows in historical_games: ${count ?? 0}`)

  const dates = dateRange(start, end)
  console.log(`Total dates to process: ${dates.length}`)

  let totalInserted = 0
  const startTime = Date.now()

  // ── NBA ──
  console.log('\n[NBA] Fetching...')
  const nbaGames = await processBatch(dates, d => fetchESPN(d, 'basketball/nba', 'NBA'))
  console.log(`[NBA] Found ${nbaGames.length} games`)
  const nbaDone = await upsertGames(nbaGames)
  totalInserted += nbaDone
  console.log(`[NBA] Upserted ${nbaDone}`)

  // ── MLB ──
  console.log('\n[MLB] Fetching...')
  const mlbGames = await processBatch(dates, d => fetchESPN(d, 'baseball/mlb', 'MLB'))
  console.log(`[MLB] Found ${mlbGames.length} games`)
  const mlbDone = await upsertGames(mlbGames)
  totalInserted += mlbDone
  console.log(`[MLB] Upserted ${mlbDone}`)

  // ── NHL ──
  console.log('\n[NHL] Fetching...')
  const nhlGames = await processBatch(dates, d => fetchNHL(d))
  console.log(`[NHL] Found ${nhlGames.length} games`)
  const nhlDone = await upsertGames(nhlGames)
  totalInserted += nhlDone
  console.log(`[NHL] Upserted ${nhlDone}`)

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\nDone. ${totalInserted} total rows upserted in ${elapsed}s`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
