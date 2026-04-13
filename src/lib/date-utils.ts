/**
 * Returns today's date string in YYYY-MM-DD format, adjusted for Eastern Time.
 * Prevents the UTC midnight rollover issue where 7PM+ ET shows tomorrow's date.
 */
export function getTodayET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

/**
 * Returns tomorrow's date string in YYYY-MM-DD format, adjusted for Eastern Time.
 * Uses today's ET calendar date + 1 day (handles month boundaries in ET).
 */
export function getTomorrowET(): string {
  const today = getTodayET()
  const [y, m, d] = today.split('-').map(Number)
  const utc = Date.UTC(y, m - 1, d + 1, 12, 0, 0)
  return new Date(utc).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

/** Previous calendar day in America/New_York (helps `fetch-games` persist late-finishing slates). */
export function getYesterdayET(): string {
  const today = getTodayET()
  const [y, m, d] = today.split('-').map(Number)
  const utc = Date.UTC(y, m - 1, d - 1, 12, 0, 0)
  return new Date(utc).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

/**
 * Add calendar days to an Eastern `YYYY-MM-DD` (same noon-UTC trick as getTomorrowET).
 * Negative values go backward (e.g. rolling 7d / 30d windows from today ET).
 */
export function addEtCalendarDays(etYmd: string, deltaDays: number): string {
  const [y, m, d] = etYmd.split('-').map(Number)
  const utc = Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0)
  return new Date(utc).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

const ET_TZ = 'America/New_York'

function etCalendarDayUtc(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: ET_TZ })
}

/**
 * Half-open UTC range [startIso, endIso) covering the ET calendar date `yyyy-mm-dd`
 * (for filtering `settled_at` in the database).
 */
export function utcIsoRangeForEtCalendarDay(etYmd: string): { startIso: string; endIso: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(etYmd)) return null
  const y = Number(etYmd.slice(0, 4))
  const m = Number(etYmd.slice(5, 7))
  const d = Number(etYmd.slice(8, 10))
  let lo = Date.UTC(y, m - 1, d, 0, 0, 0) - 36 * 3600000
  let hi = Date.UTC(y, m - 1, d, 0, 0, 0) + 36 * 3600000
  while (lo < hi - 1) {
    const mid = Math.floor((lo + hi) / 2)
    if (etCalendarDayUtc(mid) < etYmd) lo = mid
    else hi = mid
  }
  const startMs = hi
  if (etCalendarDayUtc(startMs) !== etYmd) return null
  let lo2 = startMs
  let hi2 = startMs + 40 * 3600000
  while (lo2 < hi2 - 1) {
    const mid = Math.floor((lo2 + hi2) / 2)
    if (etCalendarDayUtc(mid) <= etYmd) lo2 = mid
    else hi2 = mid
  }
  const endMs = hi2
  return { startIso: new Date(startMs).toISOString(), endIso: new Date(endMs).toISOString() }
}

/**
 * Half-open UTC range [startIso, endIso) from first instant of ET `fromYmd` through end of ET `toYmd` (inclusive).
 */
export function utcIsoRangeForEtCalendarRangeInclusive(
  fromYmd: string,
  toYmd: string,
): { startIso: string; endIso: string } | null {
  if (fromYmd > toYmd) return null
  const start = utcIsoRangeForEtCalendarDay(fromYmd)
  const end = utcIsoRangeForEtCalendarDay(toYmd)
  if (!start || !end) return null
  return { startIso: start.startIso, endIso: end.endIso }
}
