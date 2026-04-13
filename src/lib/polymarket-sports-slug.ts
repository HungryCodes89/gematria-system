/**
 * Polymarket sports URLs use slugs like `nhl-dal-pit-2026-03-28` or `nba-sas-mil-2026-03-28`:
 * `{league}-{away_code}-{home_code}-{YYYY-MM-DD}` (away team first, then home).
 * Slugs do not contain full city/nicknames — token matching on slug/title fails without this layer.
 */

import { findTeam, NBA_TEAMS, NHL_TEAMS, MLB_TEAMS } from '@/lib/constants'

/**
 * Supabase `date` columns often serialize as `2026-03-28T00:00:00.000Z`; Polymarket slugs need `2026-03-28`.
 */
export function normalizePolymarketCalendarDate(value: unknown): string | undefined {
  if (value == null) return undefined
  const s = String(value).trim()
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return undefined
  return `${m[1]}-${m[2]}-${m[3]}`
}

function normName(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function resolvePolymarketTeamCode(league: 'NBA' | 'NHL' | 'MLB', displayName: string): string | null {
  const raw = String(displayName ?? '').trim()
  if (!raw) return null

  const direct = findTeam(raw, league)
  if (direct) return direct.abbreviation.toLowerCase()

  const n = normName(raw)
  const teams = league === 'NBA' ? NBA_TEAMS : league === 'MLB' ? MLB_TEAMS : NHL_TEAMS

  for (const t of teams) {
    if (normName(t.fullName) === n) return t.abbreviation.toLowerCase()
    if (normName(`${t.city} ${t.teamName}`) === n) return t.abbreviation.toLowerCase()
    if (t.alternateNames?.some(a => normName(String(a)) === n)) return t.abbreviation.toLowerCase()
  }

  if (league === 'NHL' && n.includes('utah') && (n.includes('mammoth') || n.includes('hockey club'))) {
    return 'uta'
  }

  return null
}

const LEAGUE_PREFIX: Record<'NBA' | 'NHL' | 'MLB', string> = { NBA: 'nba', NHL: 'nhl', MLB: 'mlb' }

/** True if slug segments contain both team codes (order-free) and optional calendar date YYYY-MM-DD. */
export function polymarketSlugMatchesTeamsAndDate(
  slug: string,
  league: 'NBA' | 'NHL' | 'MLB',
  codeHome: string,
  codeAway: string,
  gameDate?: string,
): boolean {
  const s = String(slug ?? '').toLowerCase()
  if (!s) return false
  const prefix = LEAGUE_PREFIX[league]
  const parts = s.split('-').filter(Boolean)
  const headOk = parts[0] === prefix || s.startsWith(`${prefix}-`)
  if (!headOk) return false

  const a = codeHome.toLowerCase()
  const b = codeAway.toLowerCase()
  if (a.length < 2 || b.length < 2 || a === b) return false

  const segments = new Set(parts)
  if (!segments.has(a) || !segments.has(b)) return false

  if (gameDate) {
    const d = String(gameDate).trim()
    if (d && !s.includes(d)) {
      const compact = d.replace(/-/g, '')
      if (!compact || !s.replace(/-/g, '').includes(compact)) return false
    }
  }

  return true
}
