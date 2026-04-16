/**
 * Signal extraction from trade metadata and Claude's reasoning text.
 * Produces a canonical list of signal names that fired for a given trade.
 * These signals are used to build per-bot signal weight tables over time.
 */

export type SignalName =
  | 'triple_lock'
  | 'double_lock'
  | 'single_lock'
  | 'home_ml'
  | 'away_ml'
  | 'over_bet'
  | 'under_bet'
  | 'plus_odds'
  | 'heavy_fav'
  | 'high_confidence'
  | 'medium_confidence'
  | 'date_alignment'
  | 'full_moon'
  | 'ordinal_cipher'
  | 'reduction_cipher'
  | 'reverse_cipher'
  | 'jesuit_marker'
  | 'high_alignment'
  | 'name_match'
  | 'venue_match'
  | 'narrative_push'

export interface TradeSignalData {
  lock_type: string | null
  bet_type: string | null
  picked_side: string | null
  pick: string | null
  odds: number | null
  confidence: number | null
  reasoning: string | null
}

export function extractSignals(trade: TradeSignalData): SignalName[] {
  const signals = new Set<SignalName>()

  // ── Structural signals from trade metadata ────────────────────────────────
  if (trade.lock_type === 'triple_lock') signals.add('triple_lock')
  if (trade.lock_type === 'double_lock') signals.add('double_lock')
  if (trade.lock_type === 'single_lock') signals.add('single_lock')

  if (trade.bet_type === 'moneyline') {
    if (trade.picked_side === 'home') signals.add('home_ml')
    if (trade.picked_side === 'away') signals.add('away_ml')
  }

  if (trade.bet_type === 'over_under') {
    const pickLower = (trade.pick ?? '').toLowerCase()
    if (pickLower.startsWith('under')) signals.add('under_bet')
    else signals.add('over_bet')
  }

  if (trade.odds != null) {
    if (trade.odds > 0) signals.add('plus_odds')
    if (trade.odds < -150) signals.add('heavy_fav')
  }

  if (trade.confidence != null) {
    if (trade.confidence >= 75) signals.add('high_confidence')
    else if (trade.confidence >= 60) signals.add('medium_confidence')
  }

  // ── Text-derived signals from Claude's reasoning ──────────────────────────
  const r = (trade.reasoning ?? '').toLowerCase()
  if (!r) return [...signals]

  if (r.includes('moon') || r.includes('lunar') || r.includes('full moon')) {
    signals.add('full_moon')
  }

  if (
    r.includes('alignment') ||
    r.includes('matches date') ||
    r.includes('date match') ||
    r.includes('numerolog') ||
    r.includes('cipher match') ||
    r.includes('number match')
  ) {
    signals.add('date_alignment')
  }

  if (r.includes('ordinal')) signals.add('ordinal_cipher')
  if (r.includes('reduction') || r.includes('reduced')) signals.add('reduction_cipher')
  if (r.includes('reverse')) signals.add('reverse_cipher')

  if (
    r.includes('jesuit') ||
    r.includes('masonic') ||
    r.includes('33 ') ||
    r.includes('=33') ||
    r.includes('=42') ||
    r.includes('=47') ||
    r.includes('=84') ||
    r.includes('=113') ||
    r.includes('=201')
  ) {
    signals.add('jesuit_marker')
  }

  if (
    r.includes('multiple alignment') ||
    r.includes('strong alignment') ||
    r.includes('several alignment') ||
    r.includes('high alignment') ||
    r.includes('many alignment')
  ) {
    signals.add('high_alignment')
  }

  if (
    r.includes('name match') ||
    r.includes('city match') ||
    r.includes('team name match') ||
    r.includes('city name')
  ) {
    signals.add('name_match')
  }

  if (r.includes('venue') || r.includes('arena') || r.includes('stadium')) {
    signals.add('venue_match')
  }

  if (
    r.includes('narrative') ||
    r.includes('storyline') ||
    r.includes('media') ||
    r.includes('public') ||
    r.includes('market move') ||
    r.includes('sharp money')
  ) {
    signals.add('narrative_push')
  }

  return [...signals]
}

// Jesuit/Masonic numbers for pre-analysis detection
const JESUIT_NUMBERS = new Set([33, 42, 47, 56, 59, 72, 84, 113, 131, 144, 187, 201, 322])

/**
 * Pre-analysis signals: derived from the gematria engine output + game odds
 * BEFORE Claude runs. Used for sacrifice pattern detection.
 * No reasoning text is available yet — structural signals only.
 */
export interface PreAnalysisData {
  pickedSide: 'home' | 'away' | null
  fullMoon: boolean
  pickedOdds: number | null        // American odds for the engine-favored side
  alignmentCount: number
  alignmentCiphers: string[]       // e.g. ['Ordinal', 'Reverse Reduction', ...]
  alignmentValues: number[]        // gematria values from each alignment
  alignmentTypes: string[]         // AlignmentType enum values
}

export function extractPreAnalysisSignals(data: PreAnalysisData): SignalName[] {
  const signals = new Set<SignalName>()

  signals.add('triple_lock') // always called in triple-lock sacrifice-check context

  if (data.pickedSide === 'home') signals.add('home_ml')
  if (data.pickedSide === 'away') signals.add('away_ml')

  if (data.fullMoon) signals.add('full_moon')

  if (data.pickedOdds != null) {
    if (data.pickedOdds > 0) signals.add('plus_odds')
    if (data.pickedOdds < -150) signals.add('heavy_fav')
  }

  if (data.alignmentCount >= 4) signals.add('high_alignment')
  if (data.alignmentCount > 0) signals.add('date_alignment')

  for (const cipher of data.alignmentCiphers) {
    const c = cipher.toLowerCase()
    if (c.includes('reverse')) signals.add('reverse_cipher')
    else if (c.includes('ordinal')) signals.add('ordinal_cipher')
    if (c.includes('reduction') || c.includes('reduced')) signals.add('reduction_cipher')
  }

  for (const val of data.alignmentValues) {
    if (JESUIT_NUMBERS.has(val)) {
      signals.add('jesuit_marker')
      break
    }
  }

  const NAME_TYPES = new Set(['date_city', 'date_team', 'date_fullname', 'date_abbreviation'])
  const VENUE_TYPES = new Set(['venue', 'venue_part'])
  for (const t of data.alignmentTypes) {
    if (NAME_TYPES.has(t)) signals.add('name_match')
    if (VENUE_TYPES.has(t)) signals.add('venue_match')
  }

  return [...signals]
}

/** Human-readable labels for the UI */
export const SIGNAL_LABELS: Record<SignalName, string> = {
  triple_lock: 'Triple Lock',
  double_lock: 'Double Lock',
  single_lock: 'Single Lock',
  home_ml: 'Home ML',
  away_ml: 'Away ML',
  over_bet: 'Over Bet',
  under_bet: 'Under Bet',
  plus_odds: 'Plus Odds (Dog)',
  heavy_fav: 'Heavy Fav (<-150)',
  high_confidence: 'High Confidence (75%+)',
  medium_confidence: 'Medium Confidence (60-74%)',
  date_alignment: 'Date Alignment',
  full_moon: 'Full Moon',
  ordinal_cipher: 'Ordinal Cipher',
  reduction_cipher: 'Reduction Cipher',
  reverse_cipher: 'Reverse Cipher',
  jesuit_marker: 'Jesuit/Masonic Marker',
  high_alignment: 'High Alignment Count',
  name_match: 'Name/City Match',
  venue_match: 'Venue Match',
  narrative_push: 'Narrative Push',
}
