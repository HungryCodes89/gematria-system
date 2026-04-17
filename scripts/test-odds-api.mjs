/**
 * Diagnose theoddsapi.com response and sharp money gaps.
 * Usage:  node scripts/test-odds-api.mjs [API_KEY] [LEAGUE]
 *   API_KEY defaults to THE_ODDS_API_KEY env var
 *   LEAGUE  defaults to NBA  (NBA | NHL | MLB)
 *
 * Example:
 *   node scripts/test-odds-api.mjs toa_live_8whkqeqr NBA
 */

const apiKey = process.argv[2] || process.env.THE_ODDS_API_KEY
const league = (process.argv[3] || 'NBA').toUpperCase()

if (!apiKey) {
  console.error('No API key. Usage: node scripts/test-odds-api.mjs <KEY> [LEAGUE]')
  process.exit(1)
}

const SPORT_KEYS = { NBA: 'basketball_nba', NHL: 'icehockey_nhl', MLB: 'baseball_mlb' }
const BOOK_LABELS = {
  draftkings: 'DraftKings', fanduel: 'FanDuel', betmgm: 'BetMGM',
  williamhill_us: 'Caesars', lowvig: 'LowVig', betonlineag: 'BetOnline',
  bovada: 'Bovada', betrivers: 'BetRivers', fanatics: 'Fanatics',
  mybookieag: 'MyBookie', betus: 'BetUS',
}

function americanToImplied(odds) {
  if (odds == null) return null
  return odds > 0 ? 100 / (odds + 100) : (-odds) / (-odds + 100)
}

function pct(odds) {
  const impl = americanToImplied(odds)
  return impl != null ? `${(impl * 100).toFixed(1)}%` : ' N/A '
}

function fmt(odds) {
  if (odds == null) return '  N/A'
  return odds > 0 ? `+${odds}` : String(odds)
}

function vig(homeOdds, awayOdds) {
  const h = americanToImplied(homeOdds)
  const a = americanToImplied(awayOdds)
  if (h == null || a == null) return null
  return ((h + a - 1) * 100).toFixed(2) + '%'
}

async function run() {
  const sportKey = SPORT_KEYS[league]
  if (!sportKey) { console.error(`Unknown league: ${league}`); process.exit(1) }

  console.log(`\n=== theoddsapi.com Diagnostic ===`)
  console.log(`Key:    ${apiKey.slice(0, 8)}${'*'.repeat(Math.max(0, apiKey.length - 8))} (${apiKey.length} chars)`)
  console.log(`League: ${league}  |  Sport: ${sportKey}\n`)

  const url = `https://api.theoddsapi.com/odds/?sport_key=${sportKey}`
  console.log(`GET ${url}\n`)

  let res
  try {
    res = await fetch(url, { headers: { 'x-api-key': apiKey } })
  } catch (e) {
    console.error('Network error:', e.message)
    process.exit(1)
  }

  console.log(`Status:  ${res.status} ${res.statusText}`)

  const json = await res.json()

  if (!res.ok) {
    console.error('API Error:')
    console.error(JSON.stringify(json, null, 2))
    return
  }

  const data = Array.isArray(json) ? json : (json?.data ?? [])

  if (!Array.isArray(data) || data.length === 0) {
    console.log('No games returned for today.')
    return
  }

  // Collect all book keys seen
  const booksSeen = new Set()
  for (const g of data) {
    for (const b of g.books ?? []) booksSeen.add(b.book)
  }
  console.log(`\nBooks in response: ${[...booksSeen].map(k => BOOK_LABELS[k] ?? k).join(', ')}`)
  console.log(`Games returned: ${data.length}\n${'─'.repeat(72)}`)

  for (const game of data.slice(0, 5)) {
    console.log(`\n${game.away_team} @ ${game.home_team}`)
    console.log(`Start: ${new Date(game.start_time).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`)

    // Group outcomes by book
    const books = {}
    for (const entry of game.books ?? []) {
      const label = BOOK_LABELS[entry.book] ?? entry.book
      if (!books[label]) books[label] = { home: null, away: null, ou: null }
      if (entry.market === 'h2h') {
        books[label].home = entry.outcomes?.find(o => o.name === game.home_team)?.price ?? null
        books[label].away = entry.outcomes?.find(o => o.name === game.away_team)?.price ?? null
      } else if (entry.market === 'totals') {
        books[label].ou = entry.outcomes?.find(o => o.name === 'Over')?.point ?? null
      }
    }

    console.log('\n  Book              Away        Home        O/U   Vig')
    console.log('  ' + '─'.repeat(58))

    // Sort by vig ascending for display
    const sorted = Object.entries(books)
      .map(([name, line]) => {
        const v = (() => {
          const h = americanToImplied(line.home)
          const a = americanToImplied(line.away)
          if (h == null || a == null) return Infinity
          return h + a - 1
        })()
        return { name, line, v }
      })
      .sort((a, b) => a.v - b.v)

    for (const { name, line, v } of sorted) {
      const vigStr = isFinite(v) ? `${(v * 100).toFixed(2)}%` : 'N/A'
      console.log(
        `  ${name.padEnd(16)}  ${fmt(line.away).padStart(6)} (${pct(line.away)})  ${fmt(line.home).padStart(6)} (${pct(line.home)})  ${String(line.ou ?? '—').padStart(5)}  ${vigStr}`
      )
    }

    if (sorted.length >= 2) {
      const sharp = sorted[0]
      const soft = sorted[sorted.length - 1]
      if (isFinite(sharp.v) && isFinite(soft.v)) {
        const gapH = ((americanToImplied(sharp.line.home) - americanToImplied(soft.line.home)) * 100)
        const gapA = ((americanToImplied(sharp.line.away) - americanToImplied(soft.line.away)) * 100)
        console.log(`\n  Sharp ref: ${sharp.name} (vig ${(sharp.v*100).toFixed(2)}%) vs soft: ${soft.name} (vig ${(soft.v*100).toFixed(2)}%)`)
        console.log(`  ML gap  → Home ${gapH>=0?'+':''}${gapH.toFixed(2)}%  Away ${gapA>=0?'+':''}${gapA.toFixed(2)}%`)
        const sharpSide = Math.abs(gapH) >= 3 ? `HOME (${game.home_team.split(' ').pop()})` : Math.abs(gapA) >= 3 ? `AWAY (${game.away_team.split(' ').pop()})` : 'none'
        console.log(`  ⚡ SHARP flag → ${sharpSide}`)
      }
    }
  }

  console.log(`\n${'─'.repeat(72)}\nDone.\n`)
}

run().catch(console.error)
