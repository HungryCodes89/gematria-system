// Odds Fetcher — Polymarket Gamma API (simplified)

import {
  normalizePolymarketCalendarDate,
  polymarketSlugMatchesTeamsAndDate,
  resolvePolymarketTeamCode,
} from '@/lib/polymarket-sports-slug'

const POLYMARKET_BASE = 'https://gamma-api.polymarket.com'

export interface OddsSnapshot {
  gameId: string
  /** Gamma event title — used with slug for team matching */
  eventTitle?: string
  source: 'polymarket'
  moneylineHome: number | null
  moneylineAway: number | null
  spreadLine: number | null
  spreadHomeOdds: number | null
  spreadAwayOdds: number | null
  overUnderLine: number | null
  overOdds: number | null
  underOdds: number | null
  impliedProbHome: number | null
  impliedProbAway: number | null
  fetchedAt: string
}

export interface ConsolidatedOdds {
  gameId: string
  moneyline: { home: number; away: number; source: string } | null
  spread: { line: number; homeOdds: number; awayOdds: number; source: string } | null
  overUnder: { line: number; overOdds: number; underOdds: number; source: string } | null
  impliedProbability: { home: number; away: number } | null
  trueImpliedProbability: { home: number; away: number } | null
  polymarketProbability: { home: number; away: number } | null
  /** Raw implied win probability from Polymarket prices on the main total (when O/U came from Gamma). */
  polymarketTotalImplied: { over: number; under: number } | null
  mispricingPct: number | null
  snapshots: OddsSnapshot[]
  /** Multi-book consensus (devigged) from The Odds API — the "true market" */
  consensusImplied?: { home: number; away: number } | null
  /** Pinnacle moneyline — sharpest single book */
  pinnacleOdds?: { home: number; away: number } | null
  /** Number of bookmakers in the consensus calculation */
  bookCount?: number
  /** Polymarket vs consensus edge: positive = PM overvalues home */
  consensusMispricingPct?: number | null
}

// ── Math Utilities ──

export function devig(homeImplied: number, awayImplied: number): { home: number; away: number } {
  if (!Number.isFinite(homeImplied) || !Number.isFinite(awayImplied)) return { home: 0.5, away: 0.5 }
  const total = homeImplied + awayImplied
  if (total <= 0) return { home: 0.5, away: 0.5 }
  return { home: homeImplied / total, away: awayImplied / total }
}

export function moneylineToImpliedProb(ml: number): number {
  if (!Number.isFinite(ml)) return 0.5
  if (ml < 0) return Math.abs(ml) / (Math.abs(ml) + 100)
  if (ml === 0) return 0.5
  return 100 / (ml + 100)
}

export function impliedProbToMoneyline(prob: number): number {
  if (!Number.isFinite(prob)) return 0
  if (prob <= 0.01) return 10000
  if (prob >= 0.99) return -10000
  if (prob >= 0.5) return Math.round(-100 * prob / (1 - prob))
  return Math.round(100 * (1 - prob) / prob)
}

function moneylineToDecimalOdds(ml: number): number {
  if (!Number.isFinite(ml) || ml === 0) return 2.0
  if (ml > 0) return (ml / 100) + 1
  return (100 / Math.abs(ml)) + 1
}

export function calculatePayout(stake: number, ml: unknown): number {
  const s = Number(stake)
  const m = Number(ml)
  if (!Number.isFinite(s) || s <= 0) return 0
  if (m === 0 || !Number.isFinite(m)) return 0
  if (m > 0) return s * (m / 100)
  return s * (100 / Math.abs(m))
}

export function calculateEV(ourProb: number, odds: number, stake: number): number {
  const payout = calculatePayout(stake, odds)
  return (ourProb * payout) - ((1 - ourProb) * stake)
}

export function calculateKellyFraction(ourProb: number, odds: number, multiplier = 0.5): number {
  if (odds === 0 || !Number.isFinite(odds)) return 0
  const decimalOdds = moneylineToDecimalOdds(odds)
  const b = decimalOdds - 1
  if (b <= 0) return 0
  const p = ourProb
  const q = 1 - p
  const kelly = (b * p - q) / b
  return Math.max(0, kelly * multiplier)
}

// ── Gamma Parsing Helpers ──

/** Gamma often returns `outcomePrices` as a JSON string like `["0.54","0.46"]`; sometimes a real array. */
function parseGammaOutcomePricePair(prices: unknown): [number, number] | null {
  let raw: unknown[] | null = null
  if (Array.isArray(prices)) raw = prices
  else if (typeof prices === 'string') {
    try {
      const j = JSON.parse(prices)
      if (Array.isArray(j)) raw = j
    } catch {
      return null
    }
  }
  if (!raw || raw.length < 2) return null
  const a = parseFloat(String(raw[0]))
  const b = parseFloat(String(raw[1]))
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return [a, b]
}

function pickGammaMoneylineMarket(event: any): any | null {
  const markets = event?.markets
  if (!Array.isArray(markets) || markets.length === 0) return null
  for (const m of markets) {
    if (m?.sportsMarketType === 'moneyline' && parseGammaOutcomePricePair(m.outcomePrices)) return m
  }
  for (const m of markets) {
    if (parseGammaOutcomePricePair(m.outcomePrices)) return m
  }
  return null
}

function parseGammaOutcomesArray(m: any): string[] {
  const o = m?.outcomes
  if (Array.isArray(o)) return o.map((x: any) => String(x))
  if (typeof o === 'string') {
    try {
      const j = JSON.parse(o)
      return Array.isArray(j) ? j.map((x: any) => String(x)) : []
    } catch {
      return []
    }
  }
  return []
}

function inferAwayHomeFromEventTitle(title: string): { awayName: string; homeName: string } | null {
  const m = String(title || '').match(/^(.+?)\s+vs\.?\s+(.+)$/i)
  if (!m) return null
  return { awayName: m[1].trim(), homeName: m[2].trim() }
}

function normTok(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function teamLabelMatchesDbTeam(label: string, dbTeam: string): boolean {
  const L = String(label).toLowerCase()
  const parts = String(dbTeam ?? '')
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.replace(/[^a-z0-9]/g, ''))
    .filter(w => w.length >= 3)
  for (const p of parts) {
    if (p && L.includes(p)) return true
  }
  return normTok(label) === normTok(dbTeam) || L.includes(normTok(dbTeam))
}

function gammaMarketUsable(m: any): boolean {
  if (m?.active === false) return false
  if (m?.closed === true) return false
  return true
}

function marketBalanceScore(pair: [number, number]): number {
  return Math.abs(pair[0] - 0.5) + Math.abs(pair[1] - 0.5)
}

function resolveSpreadTeamIndices(
  outcomes: string[],
  homeTeam: string,
  awayTeam: string,
  titleSides: { awayName: string; homeName: string } | null,
): { idxHome: number; idxAway: number } | null {
  let idxHome = outcomes.findIndex(o => teamLabelMatchesDbTeam(o, homeTeam))
  let idxAway = outcomes.findIndex(o => teamLabelMatchesDbTeam(o, awayTeam))
  if (idxHome >= 0 && idxAway >= 0 && idxHome !== idxAway) {
    return { idxHome, idxAway }
  }
  if (titleSides && outcomes.length >= 2) {
    const o0Away =
      teamLabelMatchesDbTeam(outcomes[0], titleSides.awayName) || teamLabelMatchesDbTeam(outcomes[0], awayTeam)
    const o1Home =
      teamLabelMatchesDbTeam(outcomes[1], titleSides.homeName) || teamLabelMatchesDbTeam(outcomes[1], homeTeam)
    if (o0Away && o1Home) return { idxAway: 0, idxHome: 1 }
  }
  return null
}

function pickBestGammaSpreadMarket(event: any): { m: any; pair: [number, number] } | null {
  const markets = (event?.markets || []).filter(
    (m: any) => m?.sportsMarketType === 'spreads' && gammaMarketUsable(m),
  )
  let best: { m: any; pair: [number, number]; score: number } | null = null
  for (const m of markets) {
    const pair = parseGammaOutcomePricePair(m.outcomePrices)
    if (!pair) continue
    const score = marketBalanceScore(pair)
    if (!best || score < best.score) best = { m, pair, score }
  }
  return best ? { m: best.m, pair: best.pair } : null
}

function pickBestGammaTotalsMarket(event: any): { m: any; pair: [number, number] } | null {
  const markets = (event?.markets || []).filter(
    (m: any) => m?.sportsMarketType === 'totals' && gammaMarketUsable(m),
  )
  let best: { m: any; pair: [number, number]; score: number } | null = null
  for (const m of markets) {
    const pair = parseGammaOutcomePricePair(m.outcomePrices)
    if (!pair) continue
    const score = marketBalanceScore(pair)
    if (!best || score < best.score) best = { m, pair, score }
  }
  return best ? { m: best.m, pair: best.pair } : null
}

function extractGammaSpreadForSnapshot(
  event: any,
  homeTeam: string,
  awayTeam: string,
): Pick<OddsSnapshot, 'spreadLine' | 'spreadHomeOdds' | 'spreadAwayOdds'> | null {
  const picked = pickBestGammaSpreadMarket(event)
  if (!picked) return null
  const { m, pair } = picked
  const outcomes = parseGammaOutcomesArray(m)
  if (outcomes.length < 2) return null
  const lineRaw = m.line
  const line = typeof lineRaw === 'number' ? lineRaw : parseFloat(String(lineRaw))
  if (!Number.isFinite(line)) return null

  const titleSides = inferAwayHomeFromEventTitle(String(event?.title || ''))
  const idx = resolveSpreadTeamIndices(outcomes, homeTeam, awayTeam, titleSides)
  if (!idx) return null

  const lineForOut0 = line
  const homeSpreadLine = idx.idxHome === 0 ? lineForOut0 : -lineForOut0
  return {
    spreadLine: homeSpreadLine,
    spreadHomeOdds: impliedProbToMoneyline(pair[idx.idxHome]),
    spreadAwayOdds: impliedProbToMoneyline(pair[idx.idxAway]),
  }
}

function extractGammaTotalsForSnapshot(event: any): Pick<
  OddsSnapshot,
  'overUnderLine' | 'overOdds' | 'underOdds'
> | null {
  const picked = pickBestGammaTotalsMarket(event)
  if (!picked) return null
  const { m, pair } = picked
  const outcomes = parseGammaOutcomesArray(m)
  const idxOver = outcomes.findIndex(o => /^over$/i.test(String(o).trim()))
  const idxUnder = outcomes.findIndex(o => /^under$/i.test(String(o).trim()))
  if (idxOver < 0 || idxUnder < 0) return null

  const lineRaw = m.line
  const line = typeof lineRaw === 'number' ? lineRaw : parseFloat(String(lineRaw))
  if (!Number.isFinite(line)) return null

  return {
    overUnderLine: line,
    overOdds: impliedProbToMoneyline(pair[idxOver]),
    underOdds: impliedProbToMoneyline(pair[idxUnder]),
  }
}

const SPORTS_SLUG_MONEYLINE = /^(nba|nhl|mlb)-[a-z0-9]{2,4}-[a-z0-9]{2,4}-\d{4}-\d{2}-\d{2}$/i

export type GammaEventTeamContext = { homeTeam: string; awayTeam: string }

/**
 * Build one snapshot from a Gamma event: moneyline plus best main `spreads` / `totals` when team context is known.
 * Sports slugs list the away outcome first in `outcomePrices` (same as away-home slug order).
 */
export function gammaEventToOddsSnapshot(event: any, teamCtx?: GammaEventTeamContext | null): OddsSnapshot | null {
  const market = pickGammaMoneylineMarket(event)
  if (!market) return null
  const pair = parseGammaOutcomePricePair(market.outcomePrices)
  if (!pair) return null
  const slug = String(event.slug || '')
  const swapAwayHome =
    SPORTS_SLUG_MONEYLINE.test(slug) || market.sportsMarketType === 'moneyline'
  const [p0, p1] = pair
  const homeProb = swapAwayHome ? p1 : p0
  const awayProb = swapAwayHome ? p0 : p1

  const titleSides = inferAwayHomeFromEventTitle(String(event?.title || ''))
  const homeGuess = teamCtx?.homeTeam ?? titleSides?.homeName ?? ''
  const awayGuess = teamCtx?.awayTeam ?? titleSides?.awayName ?? ''

  let spreadLine: number | null = null
  let spreadHomeOdds: number | null = null
  let spreadAwayOdds: number | null = null
  let overUnderLine: number | null = null
  let overOdds: number | null = null
  let underOdds: number | null = null

  if (homeGuess && awayGuess) {
    const sp = extractGammaSpreadForSnapshot(event, homeGuess, awayGuess)
    if (sp) {
      spreadLine = sp.spreadLine
      spreadHomeOdds = sp.spreadHomeOdds
      spreadAwayOdds = sp.spreadAwayOdds
    }
    const ou = extractGammaTotalsForSnapshot(event)
    if (ou) {
      overUnderLine = ou.overUnderLine
      overOdds = ou.overOdds
      underOdds = ou.underOdds
    }
  }

  return {
    gameId: String(event.slug || event.id || ''),
    eventTitle: typeof event.title === 'string' ? event.title : undefined,
    source: 'polymarket',
    moneylineHome: impliedProbToMoneyline(homeProb),
    moneylineAway: impliedProbToMoneyline(awayProb),
    spreadLine,
    spreadHomeOdds,
    spreadAwayOdds,
    overUnderLine,
    overOdds,
    underOdds,
    impliedProbHome: homeProb,
    impliedProbAway: awayProb,
    fetchedAt: new Date().toISOString(),
  }
}

// ── Polymarket Fetch ──

async function fetchPolymarketEventsForTag(tag: string): Promise<any[]> {
  const res = await fetch(
    `${POLYMARKET_BASE}/events?active=true&closed=false&limit=200&tag=${encodeURIComponent(tag)}`,
    { cache: 'no-store' },
  )
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

export async function fetchPolymarketOdds(league: string): Promise<OddsSnapshot[]> {
  try {
    const slug = league === 'NBA' ? 'basketball' : league === 'MLB' ? 'baseball' : 'hockey'
    const data = await fetchPolymarketEventsForTag(slug)
    const out: OddsSnapshot[] = []
    for (const event of data || []) {
      const snap = gammaEventToOddsSnapshot(event)
      if (snap) out.push(snap)
    }
    return out
  } catch {
    console.error('Polymarket fetch failed, returning empty')
    return []
  }
}

// ── Filter snapshots for a specific game by team name matching ──

const STOPWORDS = new Set(['the', 'of', 'st', 'city', 'new', 'los', 'de', 'la', 'san', 'golden', 'big'])

function normalizeMatch(s: string): string {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function teamMatchTokens(teamName: string): string[] {
  const words = teamName
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.replace(/[^a-z0-9]/g, ''))
    .filter(w => w.length >= 3 && !STOPWORDS.has(w))
  return [...new Set(words)]
}

function haystackForSnapshot(snap: OddsSnapshot): string {
  return normalizeMatch(snap.gameId + (snap.eventTitle || ''))
}

function snapshotMatchesBothTeams(snap: OddsSnapshot, homeTeam: string, awayTeam: string): { ok: boolean; score: number } {
  const hay = haystackForSnapshot(snap)
  const ht = teamMatchTokens(homeTeam)
  const at = teamMatchTokens(awayTeam)
  let score = 0
  let homeHit = false
  let awayHit = false
  for (const t of ht) {
    const n = normalizeMatch(t)
    if (n.length >= 3 && hay.includes(n)) {
      homeHit = true
      score += 2
    }
  }
  for (const t of at) {
    const n = normalizeMatch(t)
    if (n.length >= 3 && hay.includes(n)) {
      awayHit = true
      score += 2
    }
  }
  return { ok: homeHit && awayHit, score }
}

function snapshotLooseLegacy(snap: OddsSnapshot, homeTeam: string, awayTeam: string): boolean {
  const id = normalizeMatch(snap.gameId)
  const homeParts = homeTeam.toLowerCase().split(/\s+/).filter(w => w.length > 2)
  const awayParts = awayTeam.toLowerCase().split(/\s+/).filter(w => w.length > 2)
  if (id.includes(normalizeMatch(homeTeam)) || id.includes(normalizeMatch(awayTeam))) return true
  return homeParts.some(p => id.includes(p)) && awayParts.some(p => id.includes(p))
}

export type FilterPolymarketSnapshotsOpts = {
  league?: string
  gameDate?: string
}

export function filterSnapshotsForGame(
  snapshots: OddsSnapshot[],
  homeTeam: string,
  awayTeam: string,
  opts?: FilterPolymarketSnapshotsOpts,
): OddsSnapshot[] {
  const ht = String(homeTeam ?? '').trim()
  const at = String(awayTeam ?? '').trim()
  if (!ht || !at || !snapshots.length) return []

  const league = opts?.league === 'NBA' || opts?.league === 'NHL' || opts?.league === 'MLB' ? opts.league : undefined
  const gameDate = normalizePolymarketCalendarDate(opts?.gameDate)

  if (league) {
    const hCode = resolvePolymarketTeamCode(league, ht)
    const aCode = resolvePolymarketTeamCode(league, at)
    if (hCode && aCode) {
      const slugHits = snapshots
        .filter(s => polymarketSlugMatchesTeamsAndDate(s.gameId, league, hCode, aCode, gameDate))
        .map(snap => {
          let score = 40
          if (gameDate && snap.gameId.includes(gameDate)) score += 20
          const m = snapshotMatchesBothTeams(snap, ht, at)
          if (m.ok) score += m.score
          return { snap, score }
        })
        .sort((a, b) => b.score - a.score)
      if (slugHits.length > 0) {
        return [slugHits[0].snap]
      }
    }
  }

  const scored = snapshots
    .map(snap => {
      const m = snapshotMatchesBothTeams(snap, ht, at)
      return { snap, ...m }
    })
    .filter(x => x.ok)
    .sort((a, b) => b.score - a.score)

  if (scored.length > 0) {
    return [scored[0].snap]
  }

  const loose = snapshots.filter(s => snapshotLooseLegacy(s, ht, at))
  return loose.length ? [loose[0]] : []
}

// ── Consolidate best odds ──

export function consolidateOdds(snapshots: OddsSnapshot[]): ConsolidatedOdds {
  const gameId = snapshots[0]?.gameId || ''

  const bestML = snapshots.find(s => s.moneylineHome != null && s.moneylineAway != null)
  const bestSpread = snapshots.find(s => s.spreadLine != null && s.spreadHomeOdds != null && s.spreadAwayOdds != null)
  const bestOU = snapshots.find(s => s.overUnderLine != null && s.overOdds != null && s.underOdds != null)

  let polymarketTotalImplied: { over: number; under: number } | null = null
  if (bestOU && bestOU.source === 'polymarket') {
    polymarketTotalImplied = {
      over: moneylineToImpliedProb(bestOU.overOdds!),
      under: moneylineToImpliedProb(bestOU.underOdds!),
    }
  }

  return {
    gameId,
    moneyline: bestML ? {
      home: bestML.moneylineHome!,
      away: bestML.moneylineAway!,
      source: bestML.source,
    } : null,
    spread: bestSpread ? {
      line: bestSpread.spreadLine!,
      homeOdds: bestSpread.spreadHomeOdds!,
      awayOdds: bestSpread.spreadAwayOdds!,
      source: bestSpread.source,
    } : null,
    overUnder: bestOU ? {
      line: bestOU.overUnderLine!,
      overOdds: bestOU.overOdds!,
      underOdds: bestOU.underOdds!,
      source: bestOU.source,
    } : null,
    impliedProbability: bestML?.impliedProbHome != null && bestML?.impliedProbAway != null ? {
      home: bestML.impliedProbHome!,
      away: bestML.impliedProbAway!,
    } : null,
    trueImpliedProbability: bestML?.impliedProbHome != null && bestML?.impliedProbAway != null
      ? devig(bestML.impliedProbHome!, bestML.impliedProbAway!) : null,
    polymarketProbability: null,
    polymarketTotalImplied,
    mispricingPct: null,
    snapshots,
  }
}

export function emptyConsolidatedOdds(gameId: string): ConsolidatedOdds {
  return {
    gameId,
    moneyline: null,
    spread: null,
    overUnder: null,
    impliedProbability: null,
    trueImpliedProbability: null,
    polymarketProbability: null,
    polymarketTotalImplied: null,
    mispricingPct: null,
    snapshots: [],
  }
}
