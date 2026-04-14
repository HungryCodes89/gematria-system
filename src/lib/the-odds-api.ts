// The Odds API v4 integration — live sportsbook lines for NBA/NHL/MLB

const ODDS_API_BASE = 'https://api.the-odds-api.com/v4'

const SPORT_KEYS: Record<string, string> = {
  NBA: 'basketball_nba',
  NHL: 'ice_hockey_nhl',
  MLB: 'baseball_mlb',
}

// Book keys used in the API request
const BOOK_KEYS = ['pinnacle', 'draftkings', 'fanduel', 'betmgm', 'williamhill_us']

// Human-readable labels for display
export const BOOK_LABELS: Record<string, string> = {
  pinnacle: 'Pinnacle',
  draftkings: 'DraftKings',
  fanduel: 'FanDuel',
  betmgm: 'BetMGM',
  williamhill_us: 'Caesars',
}

export interface BookOddsLine {
  moneylineHome: number | null
  moneylineAway: number | null
  overUnderLine: number | null
  overOdds: number | null
  underOdds: number | null
}

export interface OddsApiGame {
  id: string
  homeTeam: string
  awayTeam: string
  commenceTime: string
  /** Per-book lines keyed by human label (e.g. "Pinnacle", "DraftKings") */
  books: Record<string, BookOddsLine>
  /** Best (highest payout) available moneyline for home across all books */
  bestMoneylineHome: number | null
  bestMoneylineAway: number | null
  bestBookHome: string | null
  bestBookAway: string | null
  bestOverOdds: number | null
  bestUnderOdds: number | null
  bestOverLine: number | null
}

export async function fetchOddsForLeague(league: string): Promise<OddsApiGame[]> {
  const apiKey = process.env.ODDS_API_KEY
  if (!apiKey) {
    console.warn('[odds-api] ODDS_API_KEY not set — skipping')
    return []
  }

  const sportKey = SPORT_KEYS[league]
  if (!sportKey) return []

  try {
    const params = new URLSearchParams({
      apiKey,
      regions: 'us',
      markets: 'h2h,totals',
      bookmakers: BOOK_KEYS.join(','),
    })

    const res = await fetch(`${ODDS_API_BASE}/sports/${sportKey}/odds/?${params}`, {
      cache: 'no-store',
    })

    if (!res.ok) {
      console.error(`[odds-api] ${league} fetch failed: ${res.status} ${await res.text()}`)
      return []
    }

    const data = await res.json()
    if (!Array.isArray(data)) return []

    return data.map(parseOddsApiGame)
  } catch (e) {
    console.error(`[odds-api] ${league}:`, e)
    return []
  }
}

function parseOddsApiGame(g: {
  id: string
  home_team: string
  away_team: string
  commence_time: string
  bookmakers?: {
    key: string
    title: string
    markets?: {
      key: string
      outcomes?: { name: string; price: number; point?: number }[]
    }[]
  }[]
}): OddsApiGame {
  const books: Record<string, BookOddsLine> = {}

  for (const bm of g.bookmakers ?? []) {
    const label = BOOK_LABELS[bm.key] ?? bm.title ?? bm.key
    const h2h = bm.markets?.find((m) => m.key === 'h2h')
    const totals = bm.markets?.find((m) => m.key === 'totals')

    const homeOutcome = h2h?.outcomes?.find((o) => o.name === g.home_team)
    const awayOutcome = h2h?.outcomes?.find((o) => o.name === g.away_team)
    const overOutcome = totals?.outcomes?.find((o) => o.name === 'Over')
    const underOutcome = totals?.outcomes?.find((o) => o.name === 'Under')

    books[label] = {
      moneylineHome: homeOutcome?.price ?? null,
      moneylineAway: awayOutcome?.price ?? null,
      overUnderLine: overOutcome?.point ?? underOutcome?.point ?? null,
      overOdds: overOutcome?.price ?? null,
      underOdds: underOutcome?.price ?? null,
    }
  }

  // Best = highest American odds value (best payout for the bettor)
  let bestHome: number | null = null
  let bestHomeBook: string | null = null
  let bestAway: number | null = null
  let bestAwayBook: string | null = null
  let bestOverOdds: number | null = null
  let bestUnderOdds: number | null = null
  let bestOverLine: number | null = null

  for (const [name, line] of Object.entries(books)) {
    if (line.moneylineHome != null && (bestHome === null || line.moneylineHome > bestHome)) {
      bestHome = line.moneylineHome
      bestHomeBook = name
    }
    if (line.moneylineAway != null && (bestAway === null || line.moneylineAway > bestAway)) {
      bestAway = line.moneylineAway
      bestAwayBook = name
    }
    if (line.overOdds != null && (bestOverOdds === null || line.overOdds > bestOverOdds)) {
      bestOverOdds = line.overOdds
      bestOverLine = line.overUnderLine
    }
    if (line.underOdds != null && (bestUnderOdds === null || line.underOdds > bestUnderOdds)) {
      bestUnderOdds = line.underOdds
    }
  }

  return {
    id: g.id,
    homeTeam: g.home_team,
    awayTeam: g.away_team,
    commenceTime: g.commence_time,
    books,
    bestMoneylineHome: bestHome,
    bestMoneylineAway: bestAway,
    bestBookHome: bestHomeBook,
    bestBookAway: bestAwayBook,
    bestOverOdds,
    bestUnderOdds,
    bestOverLine,
  }
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function lastWord(s: string): string {
  const words = s.trim().split(/\s+/)
  return (words[words.length - 1] ?? '').toLowerCase().replace(/[^a-z]/g, '')
}

/** Fuzzy match an OddsApi game to DB home/away team names */
export function matchOddsApiGame(
  oddsGames: OddsApiGame[],
  homeTeam: string,
  awayTeam: string,
): OddsApiGame | null {
  const homeNorm = norm(homeTeam)
  const awayNorm = norm(awayTeam)
  const homeLast = lastWord(homeTeam)
  const awayLast = lastWord(awayTeam)

  for (const g of oddsGames) {
    const hNorm = norm(g.homeTeam)
    const aNorm = norm(g.awayTeam)

    // Substring match in either direction
    if (
      (hNorm.includes(homeNorm) || homeNorm.includes(hNorm)) &&
      (aNorm.includes(awayNorm) || awayNorm.includes(aNorm))
    ) {
      return g
    }

    // Mascot name (last word) match
    if (lastWord(g.homeTeam) === homeLast && lastWord(g.awayTeam) === awayLast) {
      return g
    }
  }
  return null
}
