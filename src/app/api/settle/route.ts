import { NextResponse } from 'next/server'
import { getTodayET } from '@/lib/date-utils'
import { fetchNBAGames, fetchNHLGames, fetchMLBGames } from '@/lib/sports-api'
import type { ESPNGame, NHLGame } from '@/lib/sports-api'
import { determineTradeResult, profitLossForSettledTrade } from '@/lib/settlement'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import type { PaperTrade } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface GameScores {
  homeScore: number
  awayScore: number
  status: string
}

function extractScoresFromEspn(games: ESPNGame[]): Map<string, GameScores> {
  const map = new Map<string, GameScores>()
  for (const g of games) {
    map.set(g.id, {
      homeScore: g.homeTeam.score,
      awayScore: g.awayTeam.score,
      status: g.status,
    })
  }
  return map
}

function extractScoresFromNhl(games: NHLGame[]): Map<string, GameScores> {
  const map = new Map<string, GameScores>()
  for (const g of games) {
    map.set(g.id, {
      homeScore: g.homeTeam.score,
      awayScore: g.awayTeam.score,
      status: g.status,
    })
  }
  return map
}

// Called by Vercel cron — same logic as POST
export async function GET() {
  return POST()
}

export async function POST() {
  try {
    const sb = getSupabaseAdmin()

    // Load all pending trades with their game data
    const { data: pendingTrades, error: tradeErr } = await sb
      .from('paper_trades')
      .select('*, game:games(*)')
      .eq('result', 'pending')

    if (tradeErr) throw tradeErr
    if (!pendingTrades || pendingTrades.length === 0) {
      return NextResponse.json({
        success: true,
        settled: 0,
        stillPending: 0,
        results: { wins: 0, losses: 0, pushes: 0 },
        dailyPL: 0,
        newBalance: null,
      })
    }

    // Collect unique game dates from pending trades
    const gameDates = new Set<string>()
    for (const t of pendingTrades) {
      const d = t.game?.game_date
      if (d) gameDates.add(d)
    }
    if (gameDates.size === 0) gameDates.add(getTodayET())

    // Fetch fresh scores for each date from all APIs
    const scoreMap = new Map<string, GameScores>()

    for (const dateStr of gameDates) {
      const [nba, nhl, mlb] = await Promise.all([
        fetchNBAGames(dateStr).catch(() => [] as ESPNGame[]),
        fetchNHLGames(dateStr).catch(() => [] as NHLGame[]),
        fetchMLBGames(dateStr).catch(() => [] as ESPNGame[]),
      ])

      for (const [id, scores] of extractScoresFromEspn(nba)) scoreMap.set(id, scores)
      for (const [id, scores] of extractScoresFromNhl(nhl)) scoreMap.set(id, scores)
      for (const [id, scores] of extractScoresFromEspn(mlb)) scoreMap.set(id, scores)
    }

    // Update games that are now final and settle their trades
    let settled = 0
    let wins = 0
    let losses = 0
    let pushes = 0
    let totalPL = 0

    for (const trade of pendingTrades) {
      const gameId = trade.game_id
      const liveScores = scoreMap.get(gameId)
      if (!liveScores) continue
      if (liveScores.status !== 'post') continue

      // Update game row with final scores
      await sb
        .from('games')
        .update({
          home_score: liveScores.homeScore,
          away_score: liveScores.awayScore,
          status: 'final',
          updated_at: new Date().toISOString(),
        })
        .eq('id', gameId)

      const tradeForSettle: PaperTrade = {
        ...trade,
        game: undefined,
      }

      const result = determineTradeResult(tradeForSettle, liveScores.homeScore, liveScores.awayScore)
      const pl = profitLossForSettledTrade(tradeForSettle, result)

      const { error: updateErr } = await sb
        .from('paper_trades')
        .update({
          result,
          profit_loss: pl,
          settled_at: new Date().toISOString(),
        })
        .eq('id', trade.id)
        .eq('result', 'pending')

      if (!updateErr) {
        settled++
        totalPL += pl
        if (result === 'win') wins++
        else if (result === 'loss') losses++
        else if (result === 'push') pushes++
      }
    }

    // Update bankroll ledger
    const today = getTodayET()
    let newBalance: number | null = null

    const { data: latestLedger } = await sb
      .from('bankroll_ledger')
      .select('balance')
      .order('date', { ascending: false })
      .limit(1)
      .single()

    const prevBalance = latestLedger?.balance ?? 10000

    if (settled > 0) {
      newBalance = prevBalance + totalPL

      await sb
        .from('bankroll_ledger')
        .upsert({
          date: today,
          balance: newBalance,
          daily_pl: totalPL,
          wins,
          losses,
          bets_placed: settled,
        }, { onConflict: 'date' })
    }

    const stillPending = pendingTrades.length - settled

    return NextResponse.json({
      success: true,
      settled,
      stillPending,
      results: { wins, losses, pushes },
      dailyPL: totalPL,
      newBalance: newBalance ?? prevBalance,
    })
  } catch (err: any) {
    console.error('[settle POST]', err)
    return NextResponse.json({ error: err.message ?? 'Settlement failed' }, { status: 500 })
  }
}
