import { NextRequest, NextResponse } from 'next/server'
import { getTodayET } from '@/lib/date-utils'
import { fetchNBAGames, fetchNHLGames, fetchMLBGames } from '@/lib/sports-api'
import type { ESPNGame, NHLGame } from '@/lib/sports-api'
import { fetchPolymarketOdds, filterSnapshotsForGame, consolidateOdds } from '@/lib/odds-api'
import { isFullMoon } from '@/lib/moon-phase'
import { getSupabaseAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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

    // Fetch Polymarket odds for all 3 leagues in parallel
    const [nbaOdds, nhlOdds, mlbOdds] = await Promise.all([
      fetchPolymarketOdds('NBA').catch(() => []),
      fetchPolymarketOdds('NHL').catch(() => []),
      fetchPolymarketOdds('MLB').catch(() => []),
    ])
    const allOdds = [...nbaOdds, ...nhlOdds, ...mlbOdds]

    let oddsMatched = 0
    for (const row of rows) {
      const matched = filterSnapshotsForGame(allOdds, row.home_team, row.away_team, {
        league: row.league,
        gameDate: today,
      })
      if (matched.length === 0) continue

      const consolidated = consolidateOdds(matched)
      const oddsJson = {
        moneylineHome: consolidated.moneyline?.home ?? null,
        moneylineAway: consolidated.moneyline?.away ?? null,
        spreadLine: consolidated.spread?.line ?? null,
        spreadHomeOdds: consolidated.spread?.homeOdds ?? null,
        spreadAwayOdds: consolidated.spread?.awayOdds ?? null,
        overUnderLine: consolidated.overUnder?.line ?? null,
        overOdds: consolidated.overUnder?.overOdds ?? null,
        underOdds: consolidated.overUnder?.underOdds ?? null,
        impliedProbHome: consolidated.impliedProbability?.home ?? null,
        impliedProbAway: consolidated.impliedProbability?.away ?? null,
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
      total: rows.length,
    })
  } catch (err: any) {
    console.error('[fetch-games POST]', err)
    return NextResponse.json({ error: err.message ?? 'Failed to fetch games' }, { status: 500 })
  }
}
