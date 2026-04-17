/**
 * Diagnose The Odds API response and sharp money gaps.
 * Usage:  node scripts/test-odds-api.mjs [API_KEY] [LEAGUE]
 *   API_KEY defaults to THE_ODDS_API_KEY env var
 *   LEAGUE  defaults to NBA  (NBA | NHL | MLB)
 *
 * Example:
 *   node scripts/test-odds-api.mjs toa_live_abc123... NBA
 */

const apiKey = process.argv[2] || process.env.THE_ODDS_API_KEY
const league = (process.argv[3] || 'NBA').toUpperCase()

if (!apiKey) {
  console.error('No API key. Usage: node scripts/test-odds-api.mjs <KEY> [LEAGUE]')
  process.exit(1)
}

const SPORT_KEYS = { NBA: 'basketball_nba', NHL: 'icehockey_nhl', MLB: 'baseball_mlb' }
const BOOK_KEYS = ['pinnacle', 'draftkings', 'fanduel', 'betmgm', 'williamhill_us']
const API_BASE = 'https://api.the-odds-api.com/v4'

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

  console.log(`\n=== The Odds API Diagnostic ===`)
  console.log(`Key:    ${apiKey.slice(0, 8)}${'*'.repeat(Math.max(0, apiKey.length - 8))} (${apiKey.length} chars)`)
  console.log(`League: ${league}  |  Sport: ${sportKey}\n`)

  // NOTE: The Odds API gateway drops x-api-key headers — key must be a query param
  const params = new URLSearchParams({
    apiKey,
    regions: 'us',
    markets: 'h2h,totals',
    bookmakers: BOOK_KEYS.join(','),
  })
  const url = `${API_BASE}/sports/${sportKey}/odds/?${params}`
  console.log(`GET ${url.replace(apiKey, '[KEY]')}\n`)

  let res
  try {
    res = await fetch(url)
  } catch (e) {
    console.error('Network error:', e.message)
    process.exit(1)
  }

  console.log(`Status:  ${res.status} ${res.statusText}`)
  console.log(`Quota:   ${res.headers.get('x-requests-used') ?? '?'} used / ${res.headers.get('x-requests-remaining') ?? '?'} remaining`)
  console.log(`Limit:   ${res.headers.get('x-requests-last') ?? '?'} last call\n`)

  const data = await res.json()

  if (!res.ok) {
    console.error('API Error:')
    console.error(JSON.stringify(data, null, 2))
    console.error('\n→ Likely causes:')
    console.error('  • Key is truncated (check .env.local — key should be 32+ chars)')
    console.error('  • Pinnacle not available on your tier — upgrade or adjust book list')
    console.error('  • Free tier quota exhausted for today')
    return
  }

  if (!Array.isArray(data) || data.length === 0) {
    console.log('No games returned for today.')
    return
  }

  // Collect all bookmakers that appear across all games
  const booksSeen = new Set()
  for (const g of data) {
    for (const bm of g.bookmakers ?? []) booksSeen.add(bm.title)
  }
  console.log(`Books in response: ${[...booksSeen].join(', ')}\n`)
  console.log(`Requested: ${BOOK_KEYS.join(', ')}`)
  const missing = BOOK_KEYS.filter(k => {
    const label = { pinnacle: 'Pinnacle', draftkings: 'DraftKings', fanduel: 'FanDuel', betmgm: 'BetMGM', williamhill_us: 'Caesars' }[k]
    return !booksSeen.has(label)
  })
  if (missing.length) {
    console.log(`\n⚠ NOT returned: ${missing.join(', ')}`)
    if (missing.includes('pinnacle')) {
      console.log('  → Pinnacle requires a paid tier. Sharp calc will fall back to FanDuel vs BetMGM.')
    }
  }

  console.log(`\nGames: ${data.length}\n${'─'.repeat(70)}`)

  for (const game of data.slice(0, 5)) {
    console.log(`\n${game.away_team} @ ${game.home_team}`)
    console.log(`Start: ${new Date(game.commence_time).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`)

    const books = {}
    for (const bm of game.bookmakers ?? []) {
      const h2h = bm.markets?.find(m => m.key === 'h2h')
      const totals = bm.markets?.find(m => m.key === 'totals')
      books[bm.title] = {
        home: h2h?.outcomes?.find(o => o.name === game.home_team)?.price ?? null,
        away: h2h?.outcomes?.find(o => o.name === game.away_team)?.price ?? null,
        ou: totals?.outcomes?.find(o => o.name === 'Over')?.point ?? null,
      }
    }

    console.log('\n  Book              Away        Home        O/U   Vig')
    console.log('  ' + '─'.repeat(56))
    for (const [name, line] of Object.entries(books)) {
      const v = vig(line.home, line.away)
      console.log(
        `  ${name.padEnd(16)}  ${fmt(line.away).padStart(6)} (${pct(line.away)})  ${fmt(line.home).padStart(6)} (${pct(line.home)})  ${String(line.ou ?? '—').padStart(5)}  ${v ?? 'N/A'}`
      )
    }

    // Compute gaps: find sharpest (lowest vig) vs softest (highest vig)
    const vigByBook = Object.entries(books)
      .map(([name, line]) => {
        const h = americanToImplied(line.home)
        const a = americanToImplied(line.away)
        if (h == null || a == null) return null
        return { name, v: h + a - 1, home: line.home, away: line.away, ou: line.ou }
      })
      .filter(Boolean)
      .sort((a, b) => a.v - b.v)  // ascending = sharpest first

    if (vigByBook.length >= 2) {
      const sharp = vigByBook[0]
      const soft = vigByBook[vigByBook.length - 1]
      const gapH = ((americanToImplied(sharp.home) - americanToImplied(soft.home)) * 100)
      const gapA = ((americanToImplied(sharp.away) - americanToImplied(soft.away)) * 100)
      const gapOU = sharp.ou != null && soft.ou != null ? sharp.ou - soft.ou : null
      console.log(`\n  Sharp ref: ${sharp.name} (vig ${(sharp.v * 100).toFixed(2)}%) vs soft: ${soft.name} (vig ${(soft.v * 100).toFixed(2)}%)`)
      console.log(`  ML gap → Home ${gapH >= 0 ? '+' : ''}${gapH.toFixed(2)}%  Away ${gapA >= 0 ? '+' : ''}${gapA.toFixed(2)}%  O/U ${gapOU != null ? (gapOU >= 0 ? '+' : '') + gapOU.toFixed(1) : 'N/A'}`)
      const sharpSide = Math.abs(gapH) >= 3 ? `HOME (${game.home_team.split(' ').pop()})` : Math.abs(gapA) >= 3 ? `AWAY (${game.away_team.split(' ').pop()})` : 'none'
      const sharpOU = gapOU != null ? (gapOU >= 0.5 ? 'OVER' : gapOU <= -0.5 ? 'UNDER' : 'none') : 'N/A'
      console.log(`  ⚡ SHARP flag → ML: ${sharpSide}  |  O/U: ${sharpOU}`)
    }
  }
  console.log(`\n${'─'.repeat(70)}`)
  console.log('Done. Fix your API key in .env.local if the key was invalid.\n')
}

run().catch(console.error)
