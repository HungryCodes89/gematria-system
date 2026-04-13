// Analysis Engine — Finds gematria alignments, classifies locks, scores confidence
// Replicates the exact methodology from our March 26, 2026 analysis

import { calculateGematria, calculateDateNumerology, findMatchingValues, type GematriaResult, type DateNumerology } from './gematria'
import { findTeam, type TeamInfo } from './constants'

export type AlignmentType =
  | 'date_city'
  | 'date_team'
  | 'date_fullname'
  | 'date_abbreviation'
  | 'win_target'
  | 'star_player'
  | 'venue'
  | 'venue_part'
  | 'goalie'
  | 'cipher_mirror'
  | 'goalie_team'
  | 'market_date'
  | 'loss_count_match'
  | 'coach'
  | 'area_code'
  | 'jersey_date'
  | 'jersey_opponent'
export type LockType = 'triple' | 'double' | 'single' | 'skip'

/** Parse losses from "W-L" (NBA) or "W-L-OTL" (NHL) record strings. */
export function parseRecordLosses(record: string | null | undefined): number | null {
  if (record == null || typeof record !== 'string') return null
  const parts = record
    .trim()
    .split('-')
    .map(s => parseInt(s, 10))
  if (parts.length < 2 || !Number.isFinite(parts[1]!)) return null
  return parts[1]!
}

export interface Alignment {
  type: AlignmentType
  rank: 1 | 2 | 3 | 4
  element: string
  cipher: string
  value: number
  dateMethod: string
  dateValue: number
  favors: 'home' | 'away'
  description: string
}

export interface TeamGematria {
  city: GematriaResult
  teamName: GematriaResult
  fullName: GematriaResult
  abbreviation: GematriaResult
  alternates: GematriaResult[]
  starPlayers: GematriaResult[]
  goalie?: GematriaResult
  coach?: GematriaResult
  jerseyNumbers: number[]
  areaCodes: number[]
}

export interface GameAnalysis {
  gameId: string
  league: 'NBA' | 'NHL' | 'MLB'
  date: string
  /** Arena / ballpark name from schedule (park factors, weather, display) */
  venue: string
  dateNumerology: DateNumerology
  homeTeamInfo: TeamInfo | null
  awayTeamInfo: TeamInfo | null
  homeGematria: TeamGematria
  awayGematria: TeamGematria
  venueGematria: GematriaResult
  venuePartGematria: GematriaResult[]
  homeAlignments: Alignment[]
  awayAlignments: Alignment[]
  lockType: LockType
  gematriaConfidence: number
  pickedSide: 'home' | 'away' | 'skip'
  pickedTeam: string
  homeWinTarget: number
  awayWinTarget: number
  winTargetAlignments: Alignment[]
  grading: {
    homeScore: number
    awayScore: number
    conflictPenalty: number
    homeNet: number
    awayNet: number
    netDiff: number
    homeLockCount: number
    awayLockCount: number
    totalAlignmentsForLock: number
    skippedByTightWeightedGap: boolean
    weightedGap: number
    lockRule: string
  }
}

const ALIGNMENT_WEIGHTS: Record<AlignmentType, number> = {
  date_city: 30,
  date_team: 25,
  date_fullname: 30,
  date_abbreviation: 15,
  win_target: 25,
  star_player: 20,
  cipher_mirror: 28,
  goalie_team: 18,
  goalie: 15,
  venue: 10,
  venue_part: 8,
  market_date: 0,
  loss_count_match: 22,
  coach: 22,
  area_code: 18,
  jersey_date: 15,
  jersey_opponent: 12,
}

const ALIGNMENT_RANKS: Record<AlignmentType, 1 | 2 | 3 | 4> = {
  date_city: 1,
  date_fullname: 1,
  date_team: 1,
  cipher_mirror: 1,
  date_abbreviation: 2,
  win_target: 2,
  coach: 2,
  area_code: 2,
  star_player: 3,
  goalie: 3,
  goalie_team: 3,
  jersey_date: 3,
  jersey_opponent: 3,
  venue: 4,
  venue_part: 4,
  market_date: 4,
  loss_count_match: 3,
}

const CIPHER_LABELS = ['Ordinal', 'Reduction', 'Reverse Ordinal', 'Reverse Reduction'] as const

function cipherValues(g: GematriaResult): number[] {
  return [g.ordinal, g.reduction, g.reverseOrdinal, g.reverseReduction]
}

function dedupeAlignmentsByKey(as: Alignment[], key: (a: Alignment) => string): Alignment[] {
  const seen = new Set<string>()
  return as.filter(a => {
    const k = key(a)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** Opponent "short" identity (nickname, abbrev, alternates) matches home club "big" identity (full name or city). */
function findCipherMirrorAlignments(home: TeamGematria, away: TeamGematria): Alignment[] {
  const out: Alignment[] = []

  const pushMirrors = (big: GematriaResult, small: GematriaResult, favors: 'home' | 'away') => {
    if (!big.text || !small.text) return
    const bv = cipherValues(big)
    const sv = cipherValues(small)
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        if (bv[i] === sv[j] && bv[i] > 0) {
          out.push({
            type: 'cipher_mirror',
            rank: ALIGNMENT_RANKS.cipher_mirror,
            element: `${small.text}|${big.text}`,
            cipher: CIPHER_LABELS[j],
            value: sv[j],
            dateMethod: `${CIPHER_LABELS[i]} (${big.text})`,
            dateValue: bv[i],
            favors,
            description: `"${small.text}" ${CIPHER_LABELS[j]} (${sv[j]}) = "${big.text}" ${CIPHER_LABELS[i]} (${bv[i]}) — opponent brand locks to ${favors === 'home' ? 'home' : 'away'} club identity`,
          })
        }
      }
    }
  }

  for (const big of [home.fullName, home.city]) {
    pushMirrors(big, away.teamName, 'home')
    pushMirrors(big, away.abbreviation, 'home')
    for (const alt of away.alternates) pushMirrors(big, alt, 'home')
  }

  for (const big of [away.fullName, away.city]) {
    pushMirrors(big, home.teamName, 'away')
    pushMirrors(big, home.abbreviation, 'away')
    for (const alt of home.alternates) pushMirrors(big, alt, 'away')
  }

  return dedupeAlignmentsByKey(out, a => `${a.favors}-${a.value}-${a.element}-${a.cipher}-${a.dateMethod}`)
}

function collectIdentityParts(team: TeamGematria): GematriaResult[] {
  return [team.city, team.teamName, team.fullName, team.abbreviation, ...team.alternates].filter(g => g.text.length > 0)
}

function findGoalieTeamLocks(goalie: GematriaResult | undefined, team: TeamGematria, side: 'home' | 'away'): Alignment[] {
  if (!goalie?.text) return []
  const out: Alignment[] = []
  const gv = cipherValues(goalie)
  for (const part of collectIdentityParts(team)) {
    const pv = cipherValues(part)
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        if (gv[i] === pv[j] && gv[i] > 0) {
          out.push({
            type: 'goalie_team',
            rank: ALIGNMENT_RANKS.goalie_team,
            element: `${goalie.text}|${part.text}`,
            cipher: CIPHER_LABELS[i],
            value: gv[i],
            dateMethod: `${CIPHER_LABELS[j]} (${part.text})`,
            dateValue: pv[j],
            favors: side,
            description: `Goalie "${goalie.text}" ${CIPHER_LABELS[i]} (${gv[i]}) = "${part.text}" ${CIPHER_LABELS[j]} (${pv[j]}) — netminder locked to ${side} club`,
          })
        }
      }
    }
  }
  return dedupeAlignmentsByKey(out, a => `${a.favors}-${a.value}-${a.element}`)
}

function findMarketDateAlignments(dateNums: DateNumerology): Alignment[] {
  const out: Alignment[] = []
  for (const label of ['Over', 'Under', 'Push'] as const) {
    const g = calculateGematria(label)
    const matches = findMatchingValues(g, dateNums)
    for (const m of matches) {
      out.push({
        type: 'market_date',
        rank: ALIGNMENT_RANKS.market_date,
        element: label,
        cipher: m.cipher,
        value: m.value,
        dateMethod: m.dateMethod,
        dateValue: m.dateValue,
        favors: 'home',
        description: `"${label}" ${m.cipher} (${m.value}) = Date ${m.dateMethod} (${m.dateValue}) — totals narrative`,
      })
    }
  }
  return dedupeAlignmentsByKey(out, a => `${a.element}-${a.cipher}-${a.dateMethod}`)
}

function computeTeamGematria(
  team: TeamInfo,
  starPlayers: string[] = [],
  goalie?: string,
  coach?: string,
  jerseyNumbers: number[] = [],
): TeamGematria {
  return {
    city: calculateGematria(team.city),
    teamName: calculateGematria(team.teamName),
    fullName: calculateGematria(team.fullName),
    abbreviation: calculateGematria(team.abbreviation),
    alternates: (team.alternateNames || []).map(n => calculateGematria(n)),
    starPlayers: starPlayers.map(n => calculateGematria(n)),
    goalie: goalie ? calculateGematria(goalie) : undefined,
    coach: coach ? calculateGematria(coach) : undefined,
    jerseyNumbers,
    areaCodes: team.areaCodes || [],
  }
}

function findAlignmentsForTeam(
  gematria: TeamGematria,
  dateNums: DateNumerology,
  side: 'home' | 'away'
): Alignment[] {
  const alignments: Alignment[] = []

  const checkGematria = (g: GematriaResult, type: AlignmentType) => {
    const matches = findMatchingValues(g, dateNums)
    for (const m of matches) {
      alignments.push({
        type,
        rank: ALIGNMENT_RANKS[type],
        element: g.text,
        cipher: m.cipher,
        value: m.value,
        dateMethod: m.dateMethod,
        dateValue: m.dateValue,
        favors: side,
        description: `"${g.text}" ${m.cipher} (${m.value}) = Date ${m.dateMethod} (${m.dateValue})`,
      })
    }
  }

  checkGematria(gematria.city, 'date_city')
  checkGematria(gematria.teamName, 'date_team')
  checkGematria(gematria.fullName, 'date_fullname')
  checkGematria(gematria.abbreviation, 'date_abbreviation')
  gematria.alternates.forEach(g => checkGematria(g, 'date_city'))
  gematria.starPlayers.forEach(g => checkGematria(g, 'star_player'))
  if (gematria.goalie) checkGematria(gematria.goalie, 'goalie')
  if (gematria.coach) checkGematria(gematria.coach, 'coach')

  for (const code of gematria.areaCodes) {
    const dateKeys = [
      { method: 'Full', value: dateNums.full },
      { method: 'Reduced', value: dateNums.reducedYear },
      { method: 'Short', value: dateNums.shortYear },
      { method: 'M+D', value: dateNums.monthDay },
      { method: 'Single Digits', value: dateNums.singleDigits },
      { method: 'Day of Year', value: dateNums.dayOfYear },
      { method: 'Days Remaining', value: dateNums.daysRemaining },
    ]
    for (const dk of dateKeys) {
      if (code === dk.value && code > 0) {
        alignments.push({
          type: 'area_code',
          rank: ALIGNMENT_RANKS.area_code,
          element: `Area code ${code}`,
          cipher: 'Exact match',
          value: code,
          dateMethod: dk.method,
          dateValue: dk.value,
          favors: side,
          description: `Area code ${code} = Date ${dk.method} (${dk.value})`,
        })
      }
    }
  }

  for (const jersey of gematria.jerseyNumbers) {
    const dateKeys = [
      { method: 'Full', value: dateNums.full },
      { method: 'Reduced', value: dateNums.reducedYear },
      { method: 'Short', value: dateNums.shortYear },
      { method: 'M+D', value: dateNums.monthDay },
      { method: 'Single Digits', value: dateNums.singleDigits },
      { method: 'Root Number', value: dateNums.rootNumber },
      { method: 'Day of Year', value: dateNums.dayOfYear },
      { method: 'Days Remaining', value: dateNums.daysRemaining },
    ]
    for (const dk of dateKeys) {
      if (jersey === dk.value && jersey > 0) {
        alignments.push({
          type: 'jersey_date',
          rank: ALIGNMENT_RANKS.jersey_date,
          element: `Jersey #${jersey}`,
          cipher: 'Exact match',
          value: jersey,
          dateMethod: dk.method,
          dateValue: dk.value,
          favors: side,
          description: `Jersey #${jersey} = Date ${dk.method} (${dk.value})`,
        })
      }
    }
  }

  return alignments
}

function findWinTargetAlignments(
  winTarget: number,
  opponentGematria: TeamGematria,
  side: 'home' | 'away'
): Alignment[] {
  const alignments: Alignment[] = []

  const checkTarget = (g: GematriaResult, label: string) => {
    const values = [
      { cipher: 'Ordinal', val: g.ordinal },
      { cipher: 'Reduction', val: g.reduction },
      { cipher: 'Reverse Ordinal', val: g.reverseOrdinal },
      { cipher: 'Reverse Reduction', val: g.reverseReduction },
    ]
    for (const { cipher, val } of values) {
      if (val === winTarget && val > 0) {
        alignments.push({
          type: 'win_target',
          rank: 2,
          element: g.text,
          cipher,
          value: val,
          dateMethod: 'Win Target',
          dateValue: winTarget,
          favors: side,
          description: `Win #${winTarget} = "${g.text}" ${cipher} (${val})`,
        })
      }
    }
  }

  checkTarget(opponentGematria.city, 'city')
  checkTarget(opponentGematria.teamName, 'team')
  checkTarget(opponentGematria.fullName, 'fullName')
  checkTarget(opponentGematria.abbreviation, 'abbreviation')
  opponentGematria.alternates.forEach(g => checkTarget(g, 'alternate'))
  opponentGematria.starPlayers.forEach(g => checkTarget(g, 'star'))
  if (opponentGematria.goalie) checkTarget(opponentGematria.goalie, 'goalie')

  return alignments
}

/** Star or goalie on `team` has a cipher equal to opponent's loss count — favors `side`. */
function findLossCountAlignments(
  teamGem: TeamGematria,
  opponentLosses: number | null | undefined,
  side: 'home' | 'away',
): Alignment[] {
  if (opponentLosses == null || opponentLosses < 0 || !Number.isFinite(opponentLosses)) return []
  const out: Alignment[] = []
  const checkLoss = (g: GematriaResult, role: string) => {
    if (!g.text) return
    const values = [
      { cipher: 'Ordinal' as const, val: g.ordinal },
      { cipher: 'Reduction' as const, val: g.reduction },
      { cipher: 'Reverse Ordinal' as const, val: g.reverseOrdinal },
      { cipher: 'Reverse Reduction' as const, val: g.reverseReduction },
    ]
    for (const { cipher, val } of values) {
      if (val === opponentLosses && val > 0) {
        out.push({
          type: 'loss_count_match',
          rank: ALIGNMENT_RANKS.loss_count_match,
          element: g.text,
          cipher,
          value: val,
          dateMethod: 'Opponent losses',
          dateValue: opponentLosses,
          favors: side,
          description: `"${g.text}" ${cipher} (${val}) = opponent losses (${opponentLosses}) — ${role} carries loss count`,
        })
      }
    }
  }
  teamGem.starPlayers.forEach(g => checkLoss(g, 'Star'))
  if (teamGem.goalie) checkLoss(teamGem.goalie, 'Goalie')
  return dedupeAlignmentsByKey(out, a => `${a.favors}-${a.element}-${a.cipher}-${a.dateValue}`)
}

function findJerseyOpponentAlignments(
  jerseyNumbers: number[],
  opponentGematria: TeamGematria,
  side: 'home' | 'away',
): Alignment[] {
  const out: Alignment[] = []
  const oppParts = [opponentGematria.city, opponentGematria.teamName, opponentGematria.fullName, opponentGematria.abbreviation]
  for (const jersey of jerseyNumbers) {
    if (jersey <= 0) continue
    for (const g of oppParts) {
      const vals = cipherValues(g)
      for (let ci = 0; ci < 4; ci++) {
        if (vals[ci] === jersey && jersey > 0) {
          out.push({
            type: 'jersey_opponent',
            rank: ALIGNMENT_RANKS.jersey_opponent,
            element: `Jersey #${jersey}`,
            cipher: CIPHER_LABELS[ci],
            value: jersey,
            dateMethod: `${CIPHER_LABELS[ci]} (${g.text})`,
            dateValue: vals[ci],
            favors: side,
            description: `Jersey #${jersey} = "${g.text}" ${CIPHER_LABELS[ci]} (${vals[ci]}) — opponent cipher match`,
          })
        }
      }
    }
  }
  return dedupeAlignmentsByKey(out, a => `${a.favors}-${a.value}-${a.cipher}-${a.dateMethod}`)
}

function findVenueAlignments(
  venueGematria: GematriaResult,
  venuePartGematria: GematriaResult[],
  dateNums: DateNumerology,
  _homeGematria: TeamGematria,
  _awayGematria: TeamGematria,
): Alignment[] {
  const alignments: Alignment[] = []

  const venueMatches = findMatchingValues(venueGematria, dateNums)
  for (const m of venueMatches) {
    alignments.push({
      type: 'venue',
      rank: 4,
      element: venueGematria.text,
      cipher: m.cipher,
      value: m.value,
      dateMethod: m.dateMethod,
      dateValue: m.dateValue,
      favors: 'home',
      description: `"${venueGematria.text}" ${m.cipher} (${m.value}) = Date ${m.dateMethod} (${m.dateValue})`,
    })
  }

  for (const part of venuePartGematria) {
    const partMatches = findMatchingValues(part, dateNums)
    for (const m of partMatches) {
      alignments.push({
        type: 'venue_part',
        rank: 4,
        element: part.text,
        cipher: m.cipher,
        value: m.value,
        dateMethod: m.dateMethod,
        dateValue: m.dateValue,
        favors: 'home',
        description: `"${part.text}" ${m.cipher} (${m.value}) = Date ${m.dateMethod} (${m.dateValue})`,
      })
    }
  }

  return alignments
}

export function analyzeGame(params: {
  gameId: string
  league: 'NBA' | 'NHL' | 'MLB'
  date: Date
  homeTeamName: string
  awayTeamName: string
  venueName: string
  homeWins: number
  awayWins: number
  homeStarPlayers?: string[]
  awayStarPlayers?: string[]
  homeGoalie?: string
  awayGoalie?: string
  homeCoach?: string
  awayCoach?: string
  homeJerseyNumbers?: number[]
  awayJerseyNumbers?: number[]
  homeLosses?: number | null
  awayLosses?: number | null
}): GameAnalysis {
  const {
    gameId, league, date, homeTeamName, awayTeamName, venueName,
    homeWins, awayWins, homeStarPlayers = [], awayStarPlayers = [],
    homeGoalie, awayGoalie, homeCoach, awayCoach,
    homeJerseyNumbers = [], awayJerseyNumbers = [],
    homeLosses, awayLosses,
  } = params

  const dateNums = calculateDateNumerology(date)
  const homeInfo = findTeam(homeTeamName, league)
  const awayInfo = findTeam(awayTeamName, league)

  const homeGematria = homeInfo
    ? computeTeamGematria(
        homeInfo,
        [...(homeInfo.starPlayers ?? []), ...homeStarPlayers],
        homeGoalie,
        homeCoach ?? homeInfo.coach,
        homeJerseyNumbers,
      )
    : {
        city: calculateGematria(homeTeamName),
        teamName: calculateGematria(homeTeamName),
        fullName: calculateGematria(homeTeamName),
        abbreviation: calculateGematria(''),
        alternates: [],
        starPlayers: homeStarPlayers.map(n => calculateGematria(n)),
        goalie: homeGoalie ? calculateGematria(homeGoalie) : undefined,
        coach: homeCoach ? calculateGematria(homeCoach) : undefined,
        jerseyNumbers: homeJerseyNumbers,
        areaCodes: [],
      }

  const awayGematria = awayInfo
    ? computeTeamGematria(
        awayInfo,
        [...(awayInfo.starPlayers ?? []), ...awayStarPlayers],
        awayGoalie,
        awayCoach ?? awayInfo.coach,
        awayJerseyNumbers,
      )
    : {
        city: calculateGematria(awayTeamName),
        teamName: calculateGematria(awayTeamName),
        fullName: calculateGematria(awayTeamName),
        abbreviation: calculateGematria(''),
        alternates: [],
        starPlayers: awayStarPlayers.map(n => calculateGematria(n)),
        goalie: awayGoalie ? calculateGematria(awayGoalie) : undefined,
        coach: awayCoach ? calculateGematria(awayCoach) : undefined,
        jerseyNumbers: awayJerseyNumbers,
        areaCodes: [],
      }

  const venueGematria = calculateGematria(venueName)
  const venueParts = venueName.split(' ').filter(p => p.length > 2)
  const venuePartGematria = venueParts.map(p => calculateGematria(p))

  const homeAlignments = findAlignmentsForTeam(homeGematria, dateNums, 'home')
  const awayAlignments = findAlignmentsForTeam(awayGematria, dateNums, 'away')

  const homeWinTarget = homeWins + 1
  const awayWinTarget = awayWins + 1

  const homeWinTargetAligns = findWinTargetAlignments(homeWinTarget, awayGematria, 'home')
  const awayWinTargetAligns = findWinTargetAlignments(awayWinTarget, homeGematria, 'away')

  const venueAligns = findVenueAlignments(venueGematria, venuePartGematria, dateNums, homeGematria, awayGematria)

  const cipherMirrors = findCipherMirrorAlignments(homeGematria, awayGematria)
  const homeGoalieTeamLocks = findGoalieTeamLocks(homeGematria.goalie, homeGematria, 'home')
  const awayGoalieTeamLocks = findGoalieTeamLocks(awayGematria.goalie, awayGematria, 'away')
  const homeLossAligns = findLossCountAlignments(homeGematria, awayLosses, 'home')
  const awayLossAligns = findLossCountAlignments(awayGematria, homeLosses, 'away')
  const homeJerseyOppAligns = findJerseyOpponentAlignments(homeGematria.jerseyNumbers, awayGematria, 'home')
  const awayJerseyOppAligns = findJerseyOpponentAlignments(awayGematria.jerseyNumbers, homeGematria, 'away')
  const marketDateAligns = findMarketDateAlignments(dateNums)
  const marketForHome = marketDateAligns.map(m => ({ ...m, favors: 'home' as const }))
  const marketForAway = marketDateAligns.map(m => ({ ...m, favors: 'away' as const }))

  const allHomeAlignments = [
    ...homeAlignments,
    ...homeWinTargetAligns,
    ...homeLossAligns,
    ...venueAligns.filter(a => a.favors === 'home'),
    ...cipherMirrors.filter(a => a.favors === 'home'),
    ...homeGoalieTeamLocks,
    ...homeJerseyOppAligns,
    ...marketForHome,
  ]
  const allAwayAlignments = [
    ...awayAlignments,
    ...awayWinTargetAligns,
    ...awayLossAligns,
    ...cipherMirrors.filter(a => a.favors === 'away'),
    ...awayGoalieTeamLocks,
    ...awayJerseyOppAligns,
    ...marketForAway,
  ]
  const allWinTargetAlignments = [...homeWinTargetAligns, ...awayWinTargetAligns]

  const homeScore = allHomeAlignments.reduce((s, a) => s + ALIGNMENT_WEIGHTS[a.type], 0)
  const awayScore = allAwayAlignments.reduce((s, a) => s + ALIGNMENT_WEIGHTS[a.type], 0)

  const conflict = Math.min(homeScore, awayScore) > 0 ? Math.min(homeScore, awayScore) * 0.5 : 0

  const homeNet = homeScore - conflict
  const awayNet = awayScore - conflict

  const countTowardLock = (arr: Alignment[]) => arr.filter(a => a.type !== 'market_date').length
  const homeLockCount = countTowardLock(allHomeAlignments)
  const awayLockCount = countTowardLock(allAwayAlignments)
  const totalAlignments = Math.max(homeLockCount, awayLockCount)
  let lockType: LockType = 'skip'
  if (totalAlignments >= 3) lockType = 'triple'
  else if (totalAlignments >= 2) lockType = 'double'
  else if (totalAlignments >= 1) lockType = 'single'

  const weightedGap = Math.abs(homeScore - awayScore)
  const skippedByTightWeightedGap = homeScore > 0 && awayScore > 0 && weightedGap < 25
  if (skippedByTightWeightedGap) {
    lockType = 'skip'
  }

  const netDiff = Math.abs(homeNet - awayNet)
  const baseConfidence = lockType === 'triple' ? 70 : lockType === 'double' ? 58 : lockType === 'single' ? 52 : 0
  const bonusFromStrength = Math.min(15, netDiff * 0.2)
  const gematriaConfidence = lockType === 'skip' ? 0 : Math.min(85, Math.round(baseConfidence + bonusFromStrength))

  let pickedSide: 'home' | 'away' | 'skip' = 'skip'
  let pickedTeam = ''
  if (lockType !== 'skip') {
    pickedSide = homeNet >= awayNet ? 'home' : 'away'
    pickedTeam = pickedSide === 'home' ? homeTeamName : awayTeamName
  }

  return {
    gameId,
    league,
    date: dateNums.date,
    venue: venueName,
    dateNumerology: dateNums,
    homeTeamInfo: homeInfo || null,
    awayTeamInfo: awayInfo || null,
    homeGematria,
    awayGematria,
    venueGematria,
    venuePartGematria,
    homeAlignments: allHomeAlignments,
    awayAlignments: allAwayAlignments,
    lockType,
    gematriaConfidence,
    pickedSide,
    pickedTeam,
    homeWinTarget,
    awayWinTarget,
    winTargetAlignments: allWinTargetAlignments,
    grading: {
      homeScore,
      awayScore,
      conflictPenalty: conflict,
      homeNet,
      awayNet,
      netDiff,
      homeLockCount,
      awayLockCount,
      totalAlignmentsForLock: totalAlignments,
      skippedByTightWeightedGap,
      weightedGap,
      lockRule: skippedByTightWeightedGap
        ? 'skip override: both sides scored and weighted gap < 15'
        : 'max(non-market alignments): 3+=triple, 2=double, 1=single',
    },
  }
}
