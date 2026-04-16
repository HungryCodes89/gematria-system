import { NextRequest, NextResponse } from 'next/server'
import { getTodayET } from '@/lib/date-utils'
import { fetchNBAGames, fetchNHLGames, fetchMLBGames } from '@/lib/sports-api'
import type { ESPNGame, NHLGame } from '@/lib/sports-api'
import { fetchPolymarketOdds, filterSnapshotsForGame, consolidateOdds } from '@/lib/odds-api'
import { fetchOddsForLeague, matchOddsApiGame, calculateSharpData } from '@/lib/the-odds-api'
import { isFullMoon } from '@/lib/moon-phase'
import { getSupabaseAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Returns true if the game starts at 7 PM ET or later. */
function isPrimetimeET(isoString: string | null): boolean {
  if (!isoString) return false
  const date = new Date(isoString)
  if (isNaN(date.getTime())) return false
  const etHour = parseInt(
    new Intl.DateTimeFormat('en-US', { hour: '2-digit', hour12: false, timeZone: 'America/New_York' }).format(date),
    10
  )
  return etHour >= 19
}

function mapEspnStatus(state: string): 'pre' | 'in_progress' | 'final' {
  if (state === 'pre') return 'pre'
  if (state === 'in') return 'in_progress'
  return 'final'
}

function espnGameToRow(g: ESPNGame, league: 'NBA' | 'MLB', today: string, fullMoon: boolean) {
  return {
    id: g.id,
    league,
    game_date: today,
    home_team: g.homeTeam.name,
    away_team: g.awayTeam.name,
    home_score: g.homeTeam.score || null,
    away_score: g.awayTeam.score || null,
    status: mapEspnStatus(g.status),
    venue: g.venue.name || null,
    start_time: g.startTime || null,
    home_record: g.homeTeam.record || null,
    away_record: g.awayTeam.record || null,
    home_wins: g.homeTeam.wins || 0,
    away_wins: g.awayTeam.wins || 0,
    home_losses: g.homeTeam.losses || 0,
    away_losses: g.awayTeam.losses || 0,
    is_full_moon: fullMoon,
    is_primetime: isPrimetimeET(g.startTime),
  }
}

function nhlGameToRow(g: NHLGame, today: string, fullMoon: boolean) {
  const statusMap: Record<string, 'pre' | 'in_progress' | 'final'> = {
    pre: 'pre',
    in: 'in_progress',
    post: 'final',
  }
  return {
    id: g.id,
    league: 'NHL' as const,
    game_date: today,
    home_team: g.homeTeam.name,
    away_team: g.awayTeam.name,
    home_score: g.homeTeam.score || null,
    away_score: g.awayTeam.score || null,
    status: statusMap[g.status] ?? 'pre',
    venue: g.venue.name || null,
    start_time: g.startTime || null,
    home_record: g.homeTeam.record || null,
    away_record: g.awayTeam.record || null,
    home_wins: g.homeTeam.wins || 0,
    away_wins: g.awayTeam.wins || 0,
    home_losses: g.homeTeam.losses || 0,
    away_losses: g.awayTeam.losses || 0,
    is_full_moon: fullMoon,
    is_primetime: isPrimetimeET(g.startTime),
  }
}

// ── GET: load games from DB ──

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const date = url.searchParams.get('date') || getTodayET()
    const sb = getSupabaseAdmin()

    const { data: games, error } = await sb
      .from('games')
      .select('*')
      .eq('game_date', date)
      .order('start_time', { ascending: true })

    if (error) throw error
    return NextResponse.json({ games: games ?? [] })
  } catch (err: any) {
    console.error('[fetch-games GET]', err)
    return NextResponse.json({ error: err.message ?? 'Failed to load games' }, { status: 500 })
  }
}

// ── POST: fetch from APIs, upsert to DB, attach odds ──

export async function POST() {
  try {
    const today = getTodayET()
    const fullMoon = isFullMoon(today)

    // Fetch games from all 3 leagues in parallel
    const [nbaRaw, nhlRaw, mlbRaw] = await Promise.all([
      fetchNBAGames(today).catch((e) => { console.error('[fetch-games] NBA fetch failed:', e); return [] as ESPNGame[] }),
      fetchNHLGames(today).catch((e) => { console.error('[fetch-games] NHL fetch failed:', e); return [] as NHLGame[] }),
      fetchMLBGames(today).catch((e) => { console.error('[fetch-games] MLB fetch failed:', e); return [] as ESPNGame[] }),
    ])

    // Build upsert rows
    const rows = [
      ...nbaRaw.map((g) => espnGameToRow(g, 'NBA', today, fullMoon)),
      ...nhlRaw.map((g) => nhlGameToRow(g, today, fullMoon)),
      ...mlbRaw.map((g) => espnGameToRow(g, 'MLB', today, fullMoon)),
    ]

    const sb = getSupabaseAdmin()

    if (rows.length > 0) {
      const { error: upsertErr } = await sb
        .from('games')
        .upsert(rows, { onConflict: 'id' })

      if (upsertErr) {
        console.error('[fetch-games] upsert error:', upsertErr)
      }
    }

    // Fetch Polymarket + The Odds API for all 3 leagues in parallel
    const [nbaOdds, nhlOdds, mlbOdds, nbaApi, nhlApi, mlbApi] = await Promise.all([
      fetchPolymarketOdds('NBA').catch(() => []),
      fetchPolymarketOdds('NHL').catch(() => []),
      fetchPolymarketOdds('MLB').catch(() => []),
      fetchOddsForLeague('NBA').catch(() => []),
      fetchOddsForLeague('NHL').catch(() => []),
      fetchOddsForLeague('MLB').catch(() => []),
    ])
    const allOdds = [...nbaOdds, ...nhlOdds, ...mlbOdds]
    const oddsApiGames: Record<string, typeof nbaApi> = { NBA: nbaApi, NHL: nhlApi, MLB: mlbApi }

    let oddsMatched = 0
    for (const row of rows) {
      const polyMatched = filterSnapshotsForGame(allOdds, row.home_team, row.away_team, {
        league: row.league,
        gameDate: today,
      })
      const consolidated = polyMatched.length > 0 ? consolidateOdds(polyMatched) : null
      const apiMatch = matchOddsApiGame(oddsApiGames[row.league] ?? [], row.home_team, row.away_team)

      if (!consolidated && !apiMatch) continue

      const pinnacle = apiMatch?.books['Pinnacle'] ?? null
      const dk = apiMatch?.books['DraftKings'] ?? null
      const sharpData = calculateSharpData(pinnacle, dk)

      const oddsJson = {
        // Polymarket base lines (fallback to Pinnacle if polymarket missed)
        moneylineHome: consolidated?.moneyline?.home ?? apiMatch?.bestMoneylineHome ?? null,
        moneylineAway: consolidated?.moneyline?.away ?? apiMatch?.bestMoneylineAway ?? null,
        spreadLine: consolidated?.spread?.line ?? null,
        spreadHomeOdds: consolidated?.spread?.homeOdds ?? null,
        spreadAwayOdds: consolidated?.spread?.awayOdds ?? null,
        overUnderLine: consolidated?.overUnder?.line ?? apiMatch?.bestOverLine ?? null,
        overOdds: consolidated?.overUnder?.overOdds ?? apiMatch?.bestOverOdds ?? null,
        underOdds: consolidated?.overUnder?.underOdds ?? apiMatch?.bestUnderOdds ?? null,
        impliedProbHome: consolidated?.impliedProbability?.home ?? null,
        impliedProbAway: consolidated?.impliedProbability?.away ?? null,
        // The Odds API per-book data
        books: apiMatch?.books ?? null,
        bestMoneylineHome: apiMatch?.bestMoneylineHome ?? null,
        bestMoneylineAway: apiMatch?.bestMoneylineAway ?? null,
        bestBookHome: apiMatch?.bestBookHome ?? null,
        bestBookAway: apiMatch?.bestBookAway ?? null,
        bestOverOdds: apiMatch?.bestOverOdds ?? null,
        bestUnderOdds: apiMatch?.bestUnderOdds ?? null,
        bestOverLine: apiMatch?.bestOverLine ?? null,
        // Pinnacle as sharp reference
        pinnacleMoneylineHome: pinnacle?.moneylineHome ?? null,
        pinnacleMoneylineAway: pinnacle?.moneylineAway ?? null,
        pinnacleOverUnderLine: pinnacle?.overUnderLine ?? null,
        // Sharp money indicator (Pinnacle vs DraftKings line comparison)
        sharpHome: sharpData?.sharpHome ?? null,
        sharpAway: sharpData?.sharpAway ?? null,
        sharpOU: sharpData?.sharpOU ?? null,
        pinnacleImpliedHome: sharpData?.pinnacleImpliedHome ?? null,
        pinnacleImpliedAway: sharpData?.pinnacleImpliedAway ?? null,
        dkImpliedHome: sharpData?.dkImpliedHome ?? null,
        dkImpliedAway: sharpData?.dkImpliedAway ?? null,
        mlGapHome: sharpData?.mlGapHome ?? null,
        mlGapAway: sharpData?.mlGapAway ?? null,
        ouGap: sharpData?.ouGap ?? null,
      }

      const { error: oddsErr } = await sb
        .from('games')
        .update({ polymarket_odds: oddsJson })
        .eq('id', row.id)

      if (!oddsErr) oddsMatched++
    }

    return NextResponse.json({
      success: true,
      date: today,
      games: { nba: nbaRaw.length, nhl: nhlRaw.length, mlb: mlbRaw.length },
      oddsMatched,
      oddsApiGames: { nba: nbaApi.length, nhl: nhlApi.length, mlb: mlbApi.length },
      total: rows.length,
    })
  } catch (err: any) {
    console.error('[fetch-games POST]', err)
    return NextResponse.json({ error: err.message ?? 'Failed to fetch games' }, { status: 500 })
  }
}
