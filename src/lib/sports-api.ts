// Sports Data Fetcher — ESPN (NBA/MLB) + NHL public APIs with retry/backoff

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports'
const NHL_BASE = 'https://api-web.nhle.com/v1'

const FETCH_UA = 'Mozilla/5.0 (compatible; GematriaSports/1.0)'

const NHL_STANDINGS_TTL_MS = 10 * 60 * 1000
let nhlStandingsCache: { map: NhlStandingsByAbbrev; at: number } | null = null

// ── Retry helper ──

export async function fetchWithRetry(url: string, retries = 3, delayMs = 1000): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': FETCH_UA },
        next: { revalidate: 300 },
      })
      if (res.ok) return res
      if (res.status === 429 || res.status >= 500) {
        await new Promise(r => setTimeout(r, delayMs * (i + 1)))
        continue
      }
      throw new Error(`HTTP ${res.status}: ${res.statusText}`)
    } catch (err) {
      if (i === retries - 1) throw err
      await new Promise(r => setTimeout(r, delayMs * (i + 1)))
    }
  }
  throw new Error(`Failed after ${retries} retries: ${url}`)
}

// ── ESPN score parsing ──

/** ESPN team schedule often returns `score: { value, displayValue }`; scoreboard may use a string or number. */
export function parseEspnCompetitorScore(raw: unknown): number {
  if (raw == null) return 0
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string') return parseInt(raw, 10) || 0
  if (typeof raw === 'object' && raw !== null && 'value' in raw) {
    const v = (raw as { value?: unknown }).value
    if (typeof v === 'number' && Number.isFinite(v)) return v
    return parseInt(String(v ?? ''), 10) || 0
  }
  return 0
}

// ── ESPN NBA ──

export interface ESPNGame {
  id: string
  date: string
  startTime: string
  status: 'pre' | 'in' | 'post'
  period: number
  clock: string
  homeTeam: { id: string; name: string; abbreviation: string; score: number; record: string; wins: number; losses: number }
  awayTeam: { id: string; name: string; abbreviation: string; score: number; record: string; wins: number; losses: number }
  venue: { name: string; city: string; state: string }
  periodScores?: [number, number][]
  isOvertime?: boolean
}

export async function fetchNBAGames(dateStr: string): Promise<ESPNGame[]> {
  const formatted = dateStr.replace(/-/g, '')
  const res = await fetchWithRetry(`${ESPN_BASE}/basketball/nba/scoreboard?dates=${formatted}`)
  const data = await res.json()

  return (data.events || []).map((ev: any) => {
    const comp = ev.competitions?.[0]
    const home = comp?.competitors?.find((c: any) => c.homeAway === 'home')
    const away = comp?.competitors?.find((c: any) => c.homeAway === 'away')
    const status = comp?.status
    const venue = comp?.venue

    const parseRecord = (team: any) => {
      const rec = team?.records?.[0]?.summary || '0-0'
      const [w, l] = rec.split('-').map(Number)
      return { record: rec, wins: w || 0, losses: l || 0 }
    }

    const homeRec = parseRecord(home)
    const awayRec = parseRecord(away)

    return {
      id: ev.id,
      date: dateStr,
      startTime: ev.date,
      status: status?.type?.state === 'pre' ? 'pre' : status?.type?.state === 'in' ? 'in' : 'post',
      period: status?.period || 0,
      clock: status?.displayClock || '',
      homeTeam: {
        id: home?.team?.id || '',
        name: home?.team?.displayName || '',
        abbreviation: home?.team?.abbreviation || '',
        score: parseEspnCompetitorScore(home?.score),
        ...homeRec,
      },
      awayTeam: {
        id: away?.team?.id || '',
        name: away?.team?.displayName || '',
        abbreviation: away?.team?.abbreviation || '',
        score: parseEspnCompetitorScore(away?.score),
        ...awayRec,
      },
      venue: {
        name: venue?.fullName || '',
        city: venue?.address?.city || '',
        state: venue?.address?.state || '',
      },
      ...(() => {
        const homeLS = home?.linescores as Array<{ value?: number }> | undefined
        const awayLS = away?.linescores as Array<{ value?: number }> | undefined
        if (!homeLS?.length || !awayLS?.length) return {}
        const maxP = Math.max(homeLS.length, awayLS.length)
        const periodScores: [number, number][] = []
        for (let i = 0; i < maxP; i++) {
          periodScores.push([homeLS[i]?.value ?? 0, awayLS[i]?.value ?? 0])
        }
        return { periodScores, isOvertime: (status?.period || 0) > 4 }
      })(),
    }
  })
}

// ── ESPN MLB ──

export async function fetchMLBGames(dateStr: string): Promise<ESPNGame[]> {
  const formatted = dateStr.replace(/-/g, '')
  const res = await fetchWithRetry(`${ESPN_BASE}/baseball/mlb/scoreboard?dates=${formatted}`)
  const data = await res.json()

  return (data.events || []).map((ev: any) => {
    const comp = ev.competitions?.[0]
    const home = comp?.competitors?.find((c: any) => c.homeAway === 'home')
    const away = comp?.competitors?.find((c: any) => c.homeAway === 'away')
    const status = comp?.status
    const venue = comp?.venue

    const statusName = String(status?.type?.name ?? '').toUpperCase()
    if (statusName === 'STATUS_POSTPONED' || statusName === 'STATUS_SUSPENDED') {
      return null
    }

    const parseRecord = (team: any) => {
      const rec = team?.records?.[0]?.summary || '0-0'
      const [w, l] = rec.split('-').map(Number)
      return { record: rec, wins: w || 0, losses: l || 0 }
    }

    const homeRec = parseRecord(home)
    const awayRec = parseRecord(away)
    const inning = status?.period || 0

    return {
      id: ev.id,
      date: dateStr,
      startTime: ev.date,
      status: status?.type?.state === 'pre' ? 'pre' : status?.type?.state === 'in' ? 'in' : 'post',
      period: inning,
      clock: status?.type?.state === 'in'
        ? `${status?.type?.detail || ''}`.trim()
        : status?.displayClock || '',
      homeTeam: {
        id: home?.team?.id || '',
        name: home?.team?.displayName || '',
        abbreviation: home?.team?.abbreviation || '',
        score: parseEspnCompetitorScore(home?.score),
        ...homeRec,
      },
      awayTeam: {
        id: away?.team?.id || '',
        name: away?.team?.displayName || '',
        abbreviation: away?.team?.abbreviation || '',
        score: parseEspnCompetitorScore(away?.score),
        ...awayRec,
      },
      venue: {
        name: venue?.fullName || '',
        city: venue?.address?.city || '',
        state: venue?.address?.state || '',
      },
      ...(() => {
        const homeLS = home?.linescores as Array<{ value?: number }> | undefined
        const awayLS = away?.linescores as Array<{ value?: number }> | undefined
        if (!homeLS?.length || !awayLS?.length) return {}
        const maxP = Math.max(homeLS.length, awayLS.length)
        const periodScores: [number, number][] = []
        for (let i = 0; i < maxP; i++) {
          periodScores.push([homeLS[i]?.value ?? 0, awayLS[i]?.value ?? 0])
        }
        return { periodScores, isOvertime: inning > 9 }
      })(),
    }
  }).filter(Boolean) as ESPNGame[]
}

// ── NHL API ──

export interface NHLGame {
  id: string
  date: string
  startTime: string
  status: 'pre' | 'in' | 'post'
  period: number
  clock: string
  homeTeam: { id: string; name: string; abbreviation: string; score: number; record: string; wins: number; losses: number; otLosses: number }
  awayTeam: { id: string; name: string; abbreviation: string; score: number; record: string; wins: number; losses: number; otLosses: number }
  venue: { name: string; city: string }
  periodScores?: [number, number][]
  isOvertime?: boolean
}

/** W-L-OTL row from NHL /standings/now, keyed by uppercase team abbrev */
export type NhlStandingsByAbbrev = Map<string, { wins: number; losses: number; otLosses: number }>

export function buildNhlStandingsByAbbrev(data: { standings?: unknown[] }): NhlStandingsByAbbrev {
  const map: NhlStandingsByAbbrev = new Map()
  for (const row of data.standings || []) {
    const r = row as { teamAbbrev?: { default?: string }; wins?: number; losses?: number; otLosses?: number }
    const abbr = String(r.teamAbbrev?.default ?? '').toUpperCase()
    if (!abbr) continue
    map.set(abbr, {
      wins: r.wins ?? 0,
      losses: r.losses ?? 0,
      otLosses: r.otLosses ?? 0,
    })
  }
  return map
}

/** Standings map for NHL records (schedule endpoint no longer includes W-L-OTL). Cached with TTL unless forceFresh. */
export async function fetchNhlStandingsMap(forceFresh = false): Promise<NhlStandingsByAbbrev> {
  const now = Date.now()
  if (!forceFresh && nhlStandingsCache && now - nhlStandingsCache.at < NHL_STANDINGS_TTL_MS) {
    return nhlStandingsCache.map
  }
  const res = await fetchWithRetry(`${NHL_BASE}/standings/now`)
  const map = buildNhlStandingsByAbbrev(await res.json())
  nhlStandingsCache = { map, at: now }
  return map
}

function nhlTeamFromSchedule(
  t: { id?: number; placeName?: { default?: string }; commonName?: { default?: string }; abbrev?: string; score?: number; wins?: number; losses?: number; otLosses?: number } | undefined,
  standings: NhlStandingsByAbbrev,
): NHLGame['homeTeam'] {
  const abbr = String(t?.abbrev || '').toUpperCase()
  const st = abbr ? standings.get(abbr) : undefined
  const wins = st?.wins ?? t?.wins ?? 0
  const losses = st?.losses ?? t?.losses ?? 0
  const otLosses = st?.otLosses ?? t?.otLosses ?? 0
  return {
    id: String(t?.id ?? ''),
    name: t?.placeName?.default ? `${t.placeName.default} ${t.commonName?.default || ''}`.trim() : '',
    abbreviation: t?.abbrev || '',
    score: t?.score ?? 0,
    record: `${wins}-${losses}-${otLosses}`,
    wins,
    losses,
    otLosses,
  }
}

export async function fetchNHLGames(dateStr: string, standingsMap?: NhlStandingsByAbbrev): Promise<NHLGame[]> {
  const res = await fetchWithRetry(`${NHL_BASE}/schedule/${dateStr}`)
  const data = await res.json()
  const standings = standingsMap ?? await fetchNhlStandingsMap(false)

  const games: NHLGame[] = []
  for (const week of data.gameWeek || []) {
    if (week.date !== dateStr) continue
    for (const g of week.games || []) {
      games.push({
        id: String(g.id),
        date: dateStr,
        startTime: g.startTimeUTC,
        status: g.gameState === 'FUT' || g.gameState === 'PRE' ? 'pre' :
                g.gameState === 'LIVE' || g.gameState === 'CRIT' ? 'in' : 'post',
        period: g.periodDescriptor?.number || 0,
        clock: g.clock?.timeRemaining || '',
        homeTeam: nhlTeamFromSchedule(g.homeTeam, standings),
        awayTeam: nhlTeamFromSchedule(g.awayTeam, standings),
        venue: {
          name: g.venue?.default || '',
          city: g.homeTeam?.placeName?.default || '',
        },
      })
    }
  }
  return games
}

// ── Per-game fallback lookups ────────────────────────────────────────────────
// ESPN's scoreboard endpoint sometimes omits games (pagination / date edge
// cases). When a game_id isn't found in the scoreboard result, call these
// to fetch a single event directly.

function parseEspnSummaryEvent(data: any, sportPath: string): ESPNGame | null {
  const ev = data?.gamepackageJSON?.header?.competitions?.[0] ?? data?.header?.competitions?.[0]
  if (!ev) return null
  const home = ev.competitors?.find((c: any) => c.homeAway === 'home')
  const away = ev.competitors?.find((c: any) => c.homeAway === 'away')
  const status = ev.status
  return {
    id: String(ev.id ?? ''),
    date: '',
    startTime: ev.startDate ?? '',
    status: status?.type?.state === 'pre' ? 'pre' : status?.type?.state === 'in' ? 'in' : 'post',
    period: status?.period || 0,
    clock: status?.displayClock || '',
    homeTeam: {
      id: home?.team?.id || '',
      name: home?.team?.displayName || '',
      abbreviation: home?.team?.abbreviation || '',
      score: parseEspnCompetitorScore(home?.score),
      record: '',
      wins: 0,
      losses: 0,
    },
    awayTeam: {
      id: away?.team?.id || '',
      name: away?.team?.displayName || '',
      abbreviation: away?.team?.abbreviation || '',
      score: parseEspnCompetitorScore(away?.score),
      record: '',
      wins: 0,
      losses: 0,
    },
    venue: { name: '', city: '', state: '' },
  }
}

export async function fetchNBAGameById(eventId: string): Promise<ESPNGame | null> {
  try {
    const res = await fetchWithRetry(`${ESPN_BASE}/basketball/nba/summary?event=${eventId}`)
    return parseEspnSummaryEvent(await res.json(), 'nba')
  } catch { return null }
}

export async function fetchMLBGameById(eventId: string): Promise<ESPNGame | null> {
  try {
    const res = await fetchWithRetry(`${ESPN_BASE}/baseball/mlb/summary?event=${eventId}`)
    return parseEspnSummaryEvent(await res.json(), 'mlb')
  } catch { return null }
}

export async function fetchNHLGameById(gameId: string): Promise<NHLGame | null> {
  try {
    const res = await fetchWithRetry(`${NHL_BASE}/gamecenter/${gameId}/boxscore`)
    const g = await res.json()
    const state = g.gameState ?? ''
    const status: NHLGame['status'] =
      state === 'FUT' || state === 'PRE' ? 'pre' :
      state === 'LIVE' || state === 'CRIT' ? 'in' : 'post'
    const home = g.homeTeam
    const away = g.awayTeam
    return {
      id: String(g.id ?? gameId),
      date: '',
      startTime: g.startTimeUTC ?? '',
      status,
      period: g.periodDescriptor?.number || 0,
      clock: g.clock?.timeRemaining || '',
      homeTeam: {
        id: String(home?.id ?? ''),
        name: home?.name?.default ?? '',
        abbreviation: home?.abbrev ?? '',
        score: home?.score ?? 0,
        record: '',
        wins: 0,
        losses: 0,
        otLosses: 0,
      },
      awayTeam: {
        id: String(away?.id ?? ''),
        name: away?.name?.default ?? '',
        abbreviation: away?.abbrev ?? '',
        score: away?.score ?? 0,
        record: '',
        wins: 0,
        losses: 0,
        otLosses: 0,
      },
      venue: { name: g.venue?.default ?? '', city: '' },
    }
  } catch { return null }
}
