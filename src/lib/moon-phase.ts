const SYNODIC_MONTH = 29.53058770576
const KNOWN_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14, 0)

const MONTHLY_MOON_NAMES: Record<number, string> = {
  1: 'Wolf Moon',
  2: 'Snow Moon',
  3: 'Worm Moon',
  4: 'Pink Moon',
  5: 'Flower Moon',
  6: 'Strawberry Moon',
  7: 'Buck Moon',
  8: 'Sturgeon Moon',
  9: 'Harvest Moon',
  10: "Hunter's Moon",
  11: 'Beaver Moon',
  12: 'Cold Moon',
}

/**
 * Approximate moon illumination fraction (0 = new, 1 = full)
 * using the synodic month cycle from a known new-moon epoch.
 * Accurate to within ~1 day — sufficient for tagging game dates.
 */
export function getMoonIllumination(date: Date): number {
  const daysSinceEpoch = (date.getTime() - KNOWN_NEW_MOON_MS) / 86_400_000
  const phase = ((daysSinceEpoch % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH
  return (1 - Math.cos((2 * Math.PI * phase) / SYNODIC_MONTH)) / 2
}

/**
 * Returns true when the date falls on or very near a full moon
 * (illumination >= 98%, which covers the peak day +/- ~1 day).
 */
export function isFullMoon(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return false
  const noon = new Date(Date.UTC(y, m - 1, d, 17, 0, 0))
  return getMoonIllumination(noon) >= 0.98
}

/**
 * Returns the traditional name of the full moon for a given date,
 * or null if the date is not a full moon.
 * Names follow the Farmer's Almanac tradition (Wolf, Snow, Worm, etc.).
 */
export function getFullMoonName(dateStr: string): string | null {
  if (!isFullMoon(dateStr)) return null
  const month = Number(dateStr.split('-')[1])
  return MONTHLY_MOON_NAMES[month] || null
}
