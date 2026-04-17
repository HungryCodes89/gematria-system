// The Odds API v4 integration — live sportsbook lines for NBA/NHL/MLB

const ODDS_API_BASE = 'https://api.the-odds-api.com/v4'

const SPORT_KEYS: Record<string, string> = {
  NBA: 'basketball_nba',
  NHL: 'icehockey_nhl',
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
  const apiKey = process.env.THE_ODDS_API_KEY
  if (!apiKey) {
    console.warn('[odds-api] THE_ODDS_API_KEY not set — skipping')
    return []
  }

  const sportKey = SPORT_KEYS[league]
  if (!sportKey) return []

  try {
    // NOTE: api.the-odds-api.com AWS gateway strips x-api-key headers.
    // Key must be sent as ?apiKey= query param — confirmed via curl testing.
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

// ---------------------------------------------------------------------------
// Sharp money detection
// ---------------------------------------------------------------------------

export interface SharpData {
  sharpHome: boolean
  sharpAway: boolean
  sharpOU: 'over' | 'under' | null
  /** Which book was used as the sharp reference (lowest vig) */
  sharpBook: string
  /** Which book was used as the soft reference (highest vig) */
  softBook: string
  pinnacleImpliedHome: number | null
  pinnacleImpliedAway: number | null
  dkImpliedHome: number | null
  dkImpliedAway: number | null
  /** sharp implied prob minus soft implied prob; positive = sharp on that side */
  mlGapHome: number | null
  mlGapAway: number | null
  /** sharp O/U minus soft O/U; positive = sharp over */
  ouGap: number | null
}

function americanToImplied(odds: number): number {
  if (odds > 0) return 100 / (odds + 100)
  return (-odds) / (-odds + 100)
}

/**
 * Vig = (impliedHome + impliedAway) - 1.
 * Lower vig = sharper book (Pinnacle is typically ~1-2%, recreational is 5-10%).
 */
function bookVig(line: BookOddsLine): number | null {
  if (line.moneylineHome == null || line.moneylineAway == null) return null
  return americanToImplied(line.moneylineHome) + americanToImplied(line.moneylineAway) - 1
}

/** 3% implied probability gap triggers the SHARP flag */
const SHARP_ML_THRESHOLD = 0.03

/**
 * Detect sharp money action from the full books map.
 *
 * Strategy:
 *  1. If Pinnacle is present, use it as the sharp reference (best market maker).
 *  2. Otherwise, rank all books by vig and pick the lowest-vig as sharp reference
 *     and the highest-vig as the soft reference.
 *  3. A 3%+ implied probability gap (or 0.5+ O/U gap) triggers SHARP.
 *
 * Logs which book pair was used so the UI/prompt can name them correctly.
 */
export function calculateSharpData(
  books: Record<string, BookOddsLine> | null | undefined,
): SharpData | null {
  if (!books || Object.keys(books).length < 2) return null

  // Build a ranked list: [bookName, line, vig] sorted by vig ascending (sharpest first)
  const ranked: Array<{ name: string; line: BookOddsLine; vig: number }> = []
  for (const [name, line] of Object.entries(books)) {
    const v = bookVig(line)
    if (v != null) ranked.push({ name, line, vig: v })
  }
  if (ranked.length < 2) return null
  ranked.sort((a, b) => a.vig - b.vig)

  // Prefer Pinnacle as sharp reference if it's present and has lines
  const pinnacleEntry = ranked.find((r) => r.name === 'Pinnacle')
  const sharpEntry = pinnacleEntry ?? ranked[0]!
  // Soft reference: highest vig book, must not be the same as sharp
  const softEntry = ranked[ranked.length - 1]!.name === sharpEntry.name
    ? ranked[ranked.length - 2]!
    : ranked[ranked.length - 1]!

  if (!sharpEntry || !softEntry) return null

  const sharpLine = sharpEntry.line
  const softLine = softEntry.line

  const sharpHome = sharpLine.moneylineHome != null ? americanToImplied(sharpLine.moneylineHome) : null
  const sharpAway = sharpLine.moneylineAway != null ? americanToImplied(sharpLine.moneylineAway) : null
  const softHome = softLine.moneylineHome != null ? americanToImplied(softLine.moneylineHome) : null
  const softAway = softLine.moneylineAway != null ? americanToImplied(softLine.moneylineAway) : null

  const mlGapHome = sharpHome != null && softHome != null ? sharpHome - softHome : null
  const mlGapAway = sharpAway != null && softAway != null ? sharpAway - softAway : null

  const isSharpHome = mlGapHome != null && mlGapHome > SHARP_ML_THRESHOLD
  const isSharpAway = mlGapAway != null && mlGapAway > SHARP_ML_THRESHOLD

  const ouGap =
    sharpLine.overUnderLine != null && softLine.overUnderLine != null
      ? sharpLine.overUnderLine - softLine.overUnderLine
      : null
  const sharpOU: 'over' | 'under' | null =
    ouGap != null ? (ouGap > 0.5 ? 'over' : ouGap < -0.5 ? 'under' : null) : null

  const r3 = (n: number | null) => (n != null ? Math.round(n * 1000) / 1000 : null)
  const r1 = (n: number | null) => (n != null ? Math.round(n * 10) / 10 : null)

  return {
    sharpHome: isSharpHome,
    sharpAway: isSharpAway,
    sharpOU,
    sharpBook: sharpEntry.name,
    softBook: softEntry.name,
    // Keep field names stable for existing consumers — "pinnacle" slot = sharp ref
    pinnacleImpliedHome: r3(sharpHome),
    pinnacleImpliedAway: r3(sharpAway),
    dkImpliedHome: r3(softHome),
    dkImpliedAway: r3(softAway),
    mlGapHome: r3(mlGapHome),
    mlGapAway: r3(mlGapAway),
    ouGap: r1(ouGap),
  }
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
