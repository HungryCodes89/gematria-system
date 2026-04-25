// H2H Engine — queries historical_games to compute head-to-head records
// and team form context for Claude analysis prompts.
// Requires: historical_games table (migration 007) populated by backfill script.

import type { SupabaseClient } from '@supabase/supabase-js'

interface HistoricalGame {
  id: string
  game_date: string
  home_team: string
  away_team: string
  home_score: number | null
  away_score: number | null
  league: string
}

interface TeamFormResult {
  wins: number
  losses: number
  homeWins: number
  homeLosses: number
  awayWins: number
  awayLosses: number
  last10: string[]
  streak: number
  ppgFor: number
  ppgAgainst: number
  restDays: number | null
  gamesPlayed: number
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
}

function formatStreak(n: number): string {
  if (n === 0) return 'Even'
  return n > 0 ? `W${n}` : `L${Math.abs(n)}`
}

function computeTeamForm(
  games: HistoricalGame[],
  teamName: string,
  beforeDate: string,
): TeamFormResult {
  // Sort descending by date, filter before game day
  const sorted = games
    .filter(g => g.game_date < beforeDate)
    .sort((a, b) => b.game_date.localeCompare(a.game_date))

  let wins = 0, losses = 0, homeWins = 0, homeLosses = 0, awayWins = 0, awayLosses = 0
  let totalFor = 0, totalAgainst = 0, gamesPlayed = 0
  const last10: string[] = []
  let streakCount = 0, streakBroken = false

  for (const g of sorted) {
    const isHome = g.home_team === teamName
    const scored = isHome ? (g.home_score ?? 0) : (g.away_score ?? 0)
    const allowed = isHome ? (g.away_score ?? 0) : (g.home_score ?? 0)

    if (g.home_score == null || g.away_score == null) continue

    const won = scored > allowed
    gamesPlayed++
    totalFor += scored
    totalAgainst += allowed

    if (won) {
      wins++
      if (isHome) homeWins++; else awayWins++
      if (last10.length < 10) last10.push('W')
      if (!streakBroken) streakCount > 0 ? streakCount++ : (streakCount = 1)
    } else {
      losses++
      if (isHome) homeLosses++; else awayLosses++
      if (last10.length < 10) last10.push('L')
      if (!streakBroken) streakCount < 0 ? streakCount-- : (streakCount = -1)
    }

    if (last10.length === 1) streakBroken = false
    if (last10.length > 1 && last10[last10.length - 1] !== last10[last10.length - 2]) {
      streakBroken = true
    }
  }

  const mostRecent = sorted[0]?.game_date ?? null
  const restDays = mostRecent ? daysBetween(mostRecent, beforeDate) : null

  // Recompute streak correctly
  let streak = 0
  for (const r of last10) {
    if (streak === 0) { streak = r === 'W' ? 1 : -1; continue }
    if ((streak > 0 && r === 'W') || (streak < 0 && r === 'L')) {
      streak += r === 'W' ? 1 : -1
    } else break
  }

  return {
    wins, losses, homeWins, homeLosses, awayWins, awayLosses,
    last10: last10.slice(0, 10),
    streak,
    ppgFor: gamesPlayed > 0 ? Math.round((totalFor / gamesPlayed) * 10) / 10 : 0,
    ppgAgainst: gamesPlayed > 0 ? Math.round((totalAgainst / gamesPlayed) * 10) / 10 : 0,
    restDays,
    gamesPlayed,
  }
}

export async function getH2HContext(
  homeTeam: string,
  awayTeam: string,
  league: string,
  gameDate: string,
  sb: SupabaseClient,
): Promise<string> {
  // Fetch H2H meetings (home ↔ away both directions)
  const [asHomeRes, asAwayRes, homeFormRes, awayFormRes] = await Promise.all([
    // Meetings where homeTeam hosted awayTeam
    sb.from('historical_games')
      .select('id, game_date, home_team, away_team, home_score, away_score, league')
      .eq('league', league)
      .eq('home_team', homeTeam)
      .eq('away_team', awayTeam)
      .lt('game_date', gameDate)
      .order('game_date', { ascending: false })
      .limit(15),

    // Meetings where awayTeam hosted homeTeam
    sb.from('historical_games')
      .select('id, game_date, home_team, away_team, home_score, away_score, league')
      .eq('league', league)
      .eq('home_team', awayTeam)
      .eq('away_team', homeTeam)
      .lt('game_date', gameDate)
      .order('game_date', { ascending: false })
      .limit(15),

    // Home team's recent games (as home)
    sb.from('historical_games')
      .select('id, game_date, home_team, away_team, home_score, away_score, league')
      .eq('league', league)
      .eq('home_team', homeTeam)
      .lt('game_date', gameDate)
      .order('game_date', { ascending: false })
      .limit(20),

    // Away team's recent games (as away)
    sb.from('historical_games')
      .select('id, game_date, home_team, away_team, home_score, away_score, league')
      .eq('league', league)
      .eq('away_team', awayTeam)
      .lt('game_date', gameDate)
      .order('game_date', { ascending: false })
      .limit(20),
  ])

  // Recent settled games from the current-season games table (last 14 days)
  const twoWeeksAgo = new Date(gameDate)
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)
  const twoWeeksAgoStr = twoWeeksAgo.toISOString().slice(0, 10)

  // Also fetch each team's games in the opposite role + recent settled scores
  const [homeAsAwayRes, awayAsHomeRes, recentSettledRes] = await Promise.all([
    sb.from('historical_games')
      .select('id, game_date, home_team, away_team, home_score, away_score, league')
      .eq('league', league)
      .eq('away_team', homeTeam)
      .lt('game_date', gameDate)
      .order('game_date', { ascending: false })
      .limit(20),

    sb.from('historical_games')
      .select('id, game_date, home_team, away_team, home_score, away_score, league')
      .eq('league', league)
      .eq('home_team', awayTeam)
      .lt('game_date', gameDate)
      .order('game_date', { ascending: false })
      .limit(20),

    // Pull settled games from the live games table — filtered in-code to avoid
    // Supabase OR issues with team names containing spaces
    sb.from('games')
      .select('id, game_date, home_team, away_team, home_score, away_score, status')
      .eq('league', league)
      .eq('status', 'final')
      .gte('game_date', twoWeeksAgoStr)
      .lt('game_date', gameDate)
      .order('game_date', { ascending: false })
      .limit(30),
  ])

  // Keep only games that involve homeTeam or awayTeam
  const recentGames = (recentSettledRes.data ?? []).filter(g =>
    g.home_team === homeTeam || g.away_team === homeTeam ||
    g.home_team === awayTeam || g.away_team === awayTeam
  )

  // Merge H2H games (both directions), deduplicate, sort descending
  const h2hMerged: HistoricalGame[] = [
    ...((asHomeRes.data ?? []) as HistoricalGame[]),
    ...((asAwayRes.data ?? []) as HistoricalGame[]),
  ]
    .filter((g, i, arr) => arr.findIndex(x => x.id === g.id) === i)
    .sort((a, b) => b.game_date.localeCompare(a.game_date))
    .slice(0, 20)

  // Merge each team's full recent game list
  const homeAllGames: HistoricalGame[] = [
    ...((homeFormRes.data ?? []) as HistoricalGame[]),
    ...((homeAsAwayRes.data ?? []) as HistoricalGame[]),
  ]
  const awayAllGames: HistoricalGame[] = [
    ...((awayFormRes.data ?? []) as HistoricalGame[]),
    ...((awayAsHomeRes.data ?? []) as HistoricalGame[]),
  ]

  const totalHistorical = asHomeRes.data?.length ?? 0 + (asAwayRes.data?.length ?? 0)

  // Build grounding block from verified settled results — MUST appear first in context
  const groundingLines: string[] = [
    '=== RECENT COMPLETED GAMES (verified results — use ONLY this data for recent form) ===',
  ]
  if (recentGames.length > 0) {
    for (const g of recentGames) {
      groundingLines.push(
        `${g.game_date}  ${g.home_team} ${g.home_score ?? '?'} — ${g.away_team} ${g.away_score ?? '?'}`
      )
    }
  } else {
    groundingLines.push('(No settled games found in the last 14 days for these teams)')
  }
  groundingLines.push('NOTE: Do NOT reference, infer, or fabricate any game result not listed above.')
  groundingLines.push('')
  const groundingBlock = groundingLines.join('\n')

  if (totalHistorical === 0 && homeAllGames.length === 0) {
    return groundingBlock + '=== MATCHUP HISTORY & TEAM STATS ===\n(No historical data yet — run scripts/backfill-historical.mjs to populate 6-year archive)'
  }

  const lines: string[] = ['=== MATCHUP HISTORY & TEAM STATS ===']

  // ── H2H section ────────────────────────────────────────────────────────────
  const h2h10 = h2hMerged.slice(0, 10)

  if (h2h10.length > 0) {
    let homeH2HWins = 0, awayH2HWins = 0
    let totalHomeScore = 0, totalAwayScore = 0
    const scoredGames = h2h10.filter(g => g.home_score != null && g.away_score != null)

    for (const g of scoredGames) {
      const homeScore = g.home_team === homeTeam ? g.home_score! : g.away_score!
      const awayScore = g.home_team === homeTeam ? g.away_score! : g.home_score!
      totalHomeScore += homeScore
      totalAwayScore += awayScore
      if (homeScore > awayScore) homeH2HWins++
      else if (awayScore > homeScore) awayH2HWins++
    }

    const n = scoredGames.length
    const avgHome = n > 0 ? (totalHomeScore / n).toFixed(1) : '—'
    const avgAway = n > 0 ? (totalAwayScore / n).toFixed(1) : '—'

    const oldest = h2h10[h2h10.length - 1]!.game_date.slice(0, 4)
    const newest = h2h10[0]!.game_date.slice(0, 4)
    const span = oldest === newest ? oldest : `${oldest}–${newest}`

    lines.push(`\nH2H LAST ${h2h10.length} MEETINGS (${span}):`)
    const leader = homeH2HWins > awayH2HWins
      ? `${homeTeam} leads ${homeH2HWins}–${awayH2HWins}`
      : homeH2HWins < awayH2HWins
        ? `${awayTeam} leads ${awayH2HWins}–${homeH2HWins}`
        : `Series tied ${homeH2HWins}–${awayH2HWins}`
    lines.push(`${leader} | Avg: ${homeTeam.split(' ').pop()} ${avgHome} / ${awayTeam.split(' ').pop()} ${avgAway}`)

    // Last 5 from homeTeam perspective
    const last5 = h2h10.slice(0, 5).map(g => {
      if (g.home_score == null || g.away_score == null) return '?'
      const homeWon = g.home_team === homeTeam
        ? g.home_score > g.away_score
        : g.away_score > g.home_score
      return homeWon ? 'W' : 'L'
    })
    lines.push(`Last 5 (${homeTeam.split(' ').pop()} view): ${last5.join(' ')}`)

    const last = h2h10[0]!
    if (last.home_score != null) {
      lines.push(`Most recent: ${last.game_date} | ${last.home_team} ${last.home_score}–${last.away_score} ${last.away_team}`)
    }
  } else {
    lines.push('\nH2H: No prior meetings found in database')
  }

  // ── Team form ───────────────────────────────────────────────────────────────
  const homeForm = computeTeamForm(homeAllGames, homeTeam, gameDate)
  const awayForm = computeTeamForm(awayAllGames, awayTeam, gameDate)

  const formatForm = (form: TeamFormResult, name: string, role: 'HOME' | 'AWAY') => {
    if (form.gamesPlayed === 0) return `\n${role} — ${name}:\n  (No form data in database yet)`

    const net = (form.ppgFor - form.ppgAgainst).toFixed(1)
    const netStr = Number(net) >= 0 ? `+${net}` : net
    const last10str = form.last10.join(' ')
    const streakStr = formatStreak(form.streak)
    const restStr = form.restDays == null
      ? 'rest unknown'
      : form.restDays === 0
        ? 'same-day doubleheader'
        : form.restDays === 1
          ? '1 day — BACK-TO-BACK ⚠️'
          : `${form.restDays} days rest`

    const record = `${form.wins}W-${form.losses}L`
    const splits = `Home ${form.homeWins}-${form.homeLosses} | Away ${form.awayWins}-${form.awayLosses}`

    return [
      `\n${role} — ${name}:`,
      `Season: ${record} (${splits})`,
      `Last ${form.last10.length}: ${last10str} | Streak: ${streakStr}`,
      `PPG: ${form.ppgFor} scored / ${form.ppgAgainst} allowed (${netStr} net)`,
      `Rest: ${restStr}`,
    ].join('\n')
  }

  lines.push(formatForm(homeForm, homeTeam, 'HOME'))
  lines.push(formatForm(awayForm, awayTeam, 'AWAY'))

  return groundingBlock + lines.join('\n')
}
