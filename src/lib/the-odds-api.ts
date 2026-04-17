// theoddsapi.com integration — live sportsbook lines for NBA/NHL/MLB
//
// Base URL:  https://api.theoddsapi.com
// Auth:      x-api-key header
// Endpoint:  GET /odds/?sport_key={key}
// Response:  { success, data: [{ event_id, home_team, away_team, start_time,
//              books: [{ book, market, outcomes: [{name, price, point?}] }] }] }

const ODDS_API_BASE = 'https://api.theoddsapi.com'

const SPORT_KEYS: Record<string, string> = {
  NBA: 'basketball_nba',
  NHL: 'icehockey_nhl',
  MLB: 'baseball_mlb',
}

// Human-readable labels for the books this API returns
export const BOOK_LABELS: Record<string, string> = {
  draftkings:    'DraftKings',
  fanduel:       'FanDuel',
  betmgm:        'BetMGM',
  williamhill_us:'Caesars',
  lowvig:        'LowVig',
  betonlineag:   'BetOnline',
  bovada:        'Bovada',
  betrivers:     'BetRivers',
  fanatics:      'Fanatics',
  mybookieag:    'MyBookie',
  betus:         'BetUS',
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
  /** Per-book lines keyed by human label (e.g. "LowVig", "DraftKings") */
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
    const params = new URLSearchParams({ sport_key: sportKey })

    const res = await fetch(`${ODDS_API_BASE}/odds/?${params}`, {
      cache: 'no-store',
      headers: { 'x-api-key': apiKey },
    })

    if (!res.ok) {
      console.error(`[odds-api] ${league} fetch failed: ${res.status} ${await res.text()}`)
      return []
    }

    const json = await res.json()

    // Response shape: { success: boolean, data: [...] }
    const data: unknown[] = Array.isArray(json) ? json : (json?.data ?? [])
    if (!Array.isArray(data)) return []

    return (data as unknown[]).map((g) => parseOddsApiGame(g as Parameters<typeof parseOddsApiGame>[0]))
  } catch (e) {
    console.error(`[odds-api] ${league}:`, e)
    return []
  }
}

// ---------------------------------------------------------------------------
// Response parser — new theoddsapi.com format
// ---------------------------------------------------------------------------

function parseOddsApiGame(g: {
  event_id: string
  home_team: string
  away_team: string
  start_time: string
  books?: {
    book: string
    market: string
    outcomes?: { name: string; price: number; point?: number }[]
  }[]
}): OddsApiGame {
  // Each element in books[] covers one market (h2h or totals) for one bookmaker.
  // Group by book key so we can merge h2h + totals into a single BookOddsLine.
  const bookMap: Record<string, BookOddsLine> = {}

  for (const entry of g.books ?? []) {
    const label = BOOK_LABELS[entry.book] ?? entry.book
    if (!bookMap[label]) {
      bookMap[label] = {
        moneylineHome: null,
        moneylineAway: null,
        overUnderLine: null,
        overOdds: null,
        underOdds: null,
      }
    }

    if (entry.market === 'h2h') {
      bookMap[label]!.moneylineHome =
        entry.outcomes?.find((o) => o.name === g.home_team)?.price ?? null
      bookMap[label]!.moneylineAway =
        entry.outcomes?.find((o) => o.name === g.away_team)?.price ?? null
    } else if (entry.market === 'totals' || entry.market === 'spreads') {
      const over = entry.outcomes?.find((o) => o.name === 'Over')
      const under = entry.outcomes?.find((o) => o.name === 'Under')
      bookMap[label]!.overUnderLine = over?.point ?? under?.point ?? null
      bookMap[label]!.overOdds = over?.price ?? null
      bookMap[label]!.underOdds = under?.price ?? null
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

  for (const [name, line] of Object.entries(bookMap)) {
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
    id: g.event_id,
    homeTeam: g.home_team,
    awayTeam: g.away_team,
    commenceTime: g.start_time,
    books: bookMap,
    bestMoneylineHome: bestHome,
    bestMoneylineAway: bestAway,
    bestBookHome: bestHomeBook,
    bestBookAway: bestAwayBook,
    bestOverOdds,
    bestUnderOdds,
    bestOverLine,
  }
}

// ---------------------------------------------------------------------------
// Fuzzy game matching
// ---------------------------------------------------------------------------

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
 * Lower vig = sharper book. LowVig is typically ~1%, recreational books ~7-10%.
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
 * Ranks all books by vig (lowest = sharpest, highest = softest).
 * LowVig is the primary sharp reference when Pinnacle isn't available.
 * A 3%+ implied-probability gap or 0.5+ O/U point gap triggers SHARP.
 */
export function calculateSharpData(
  books: Record<string, BookOddsLine> | null | undefined,
): SharpData | null {
  if (!books || Object.keys(books).length < 2) return null

  const ranked: Array<{ name: string; line: BookOddsLine; vig: number }> = []
  for (const [name, line] of Object.entries(books)) {
    const v = bookVig(line)
    if (v != null) ranked.push({ name, line, vig: v })
  }
  if (ranked.length < 2) return null
  ranked.sort((a, b) => a.vig - b.vig) // ascending = sharpest first

  // Prefer Pinnacle if present, otherwise lowest-vig book (typically LowVig)
  const sharpEntry = ranked.find((r) => r.name === 'Pinnacle') ?? ranked[0]!
  // Soft reference: highest-vig book that isn't the sharp reference
  const softEntry =
    ranked[ranked.length - 1]!.name === sharpEntry.name
      ? ranked[ranked.length - 2]!
      : ranked[ranked.length - 1]!

  if (!sharpEntry || !softEntry) return null

  const sharpLine = sharpEntry.line
  const softLine = softEntry.line

  const sharpH = sharpLine.moneylineHome != null ? americanToImplied(sharpLine.moneylineHome) : null
  const sharpA = sharpLine.moneylineAway != null ? americanToImplied(sharpLine.moneylineAway) : null
  const softH = softLine.moneylineHome != null ? americanToImplied(softLine.moneylineHome) : null
  const softA = softLine.moneylineAway != null ? americanToImplied(softLine.moneylineAway) : null

  const mlGapHome = sharpH != null && softH != null ? sharpH - softH : null
  const mlGapAway = sharpA != null && softA != null ? sharpA - softA : null

  const ouGap =
    sharpLine.overUnderLine != null && softLine.overUnderLine != null
      ? sharpLine.overUnderLine - softLine.overUnderLine
      : null
  const sharpOU: 'over' | 'under' | null =
    ouGap != null ? (ouGap > 0.5 ? 'over' : ouGap < -0.5 ? 'under' : null) : null

  const r3 = (n: number | null) => (n != null ? Math.round(n * 1000) / 1000 : null)
  const r1 = (n: number | null) => (n != null ? Math.round(n * 10) / 10 : null)

  return {
    sharpHome: mlGapHome != null && mlGapHome > SHARP_ML_THRESHOLD,
    sharpAway: mlGapAway != null && mlGapAway > SHARP_ML_THRESHOLD,
    sharpOU,
    sharpBook: sharpEntry.name,
    softBook: softEntry.name,
    pinnacleImpliedHome: r3(sharpH),
    pinnacleImpliedAway: r3(sharpA),
    dkImpliedHome: r3(softH),
    dkImpliedAway: r3(softA),
    mlGapHome: r3(mlGapHome),
    mlGapAway: r3(mlGapAway),
    ouGap: r1(ouGap),
  }
}
