import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { fetchNBAGames, fetchNHLGames, fetchMLBGames } from '@/lib/sports-api'
import type { ESPNGame, NHLGame } from '@/lib/sports-api'
import { determineTradeResult } from '@/lib/settlement'
import { fetchOddsForLeague, matchOddsApiGame } from '@/lib/the-odds-api'
import { moneylineToImpliedProb } from '@/lib/odds-api'
import type { PaperTrade } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

interface GameScores {
  homeScore: number
  awayScore: number
  status: string
}

export interface PreviewItem {
  trade: PaperTrade
  homeScore: number | null
  awayScore: number | null
  gameStatus: 'pre' | 'in' | 'post' | 'unknown'
  autoResult: 'win' | 'loss' | 'push' | 'void' | null
  closingLine: number | null
  clvPercent: number | null
}

function calcClvPercent(
  openingLine: number,
  closingLine: number,
  betType: string
): number {
  if (betType === 'moneyline') {
    const closingProb = moneylineToImpliedProb(closingLine)
    const openingProb = moneylineToImpliedProb(openingLine)
    return Math.round((closingProb - openingProb) * 10000) / 100
  }
  return Math.round((closingLine - openingLine) * 100) / 100
}

function extractEspnScores(games: ESPNGame[]): Map<string, GameScores> {
  const map = new Map<string, GameScores>()
  for (const g of games) {
    map.set(g.id, { homeScore: g.homeTeam.score, awayScore: g.awayTeam.score, status: g.status })
  }
  return map
}

function extractNhlScores(games: NHLGame[]): Map<string, GameScores> {
  const map = new Map<string, GameScores>()
  for (const g of games) {
    map.set(g.id, { homeScore: g.homeTeam.score, awayScore: g.awayTeam.score, status: g.status })
  }
  return map
}

export async function GET() {
  try {
    const sb = getSupabaseAdmin()

    const { data: rows, error } = await sb
      .from('paper_trades')
      .select('*, game:games(*)')
      .eq('result', 'pending')
      .order('placed_at', { ascending: false })

    if (error) throw error
    if (!rows || rows.length === 0) {
      return NextResponse.json({ items: [], total: 0 })
    }

    // Collect unique game dates
    const gameDates = new Set<string>()
    for (const r of rows) {
      const d = (r.game as any)?.game_date
      if (d) gameDates.add(d)
    }

    // Fetch scores for each date across all sports
    const scoreMap = new Map<string, GameScores>()
    for (const dateStr of gameDates) {
      const [nba, nhl, mlb] = await Promise.all([
        fetchNBAGames(dateStr).catch(() => [] as ESPNGame[]),
        fetchNHLGames(dateStr).catch(() => [] as NHLGame[]),
        fetchMLBGames(dateStr).catch(() => [] as ESPNGame[]),
      ])
      for (const [id, s] of extractEspnScores(nba)) scoreMap.set(id, s)
      for (const [id, s] of extractNhlScores(nhl)) scoreMap.set(id, s)
      for (const [id, s] of extractEspnScores(mlb)) scoreMap.set(id, s)
    }

    // Fetch closing lines from Odds API for unique leagues
    const leagues = [
      ...new Set(
        rows.flatMap((r) => {
          const league = (r.game as any)?.league
          return league ? [league as string] : []
        })
      ),
    ]
    const oddsCache = new Map<string, Awaited<ReturnType<typeof fetchOddsForLeague>>>()
    await Promise.all(
      leagues.map(async (league) => {
        oddsCache.set(league, await fetchOddsForLeague(league).catch(() => []))
      })
    )

    // Build preview items
    const items: PreviewItem[] = rows.map((row) => {
      const { game, ...rest } = row as any
      const trade = { ...rest, game } as PaperTrade

      const liveScores = scoreMap.get(trade.game_id)
      const homeScore = liveScores?.homeScore ?? null
      const awayScore = liveScores?.awayScore ?? null
      const rawStatus = liveScores?.status ?? 'unknown'
      const gameStatus: PreviewItem['gameStatus'] =
        rawStatus === 'post' ? 'post' :
        rawStatus === 'in' ? 'in' :
        rawStatus === 'pre' ? 'pre' : 'unknown'

      // Auto-determine result only if game is final
      const autoResult: PreviewItem['autoResult'] =
        gameStatus === 'post'
          ? determineTradeResult(trade, homeScore, awayScore)
          : null

      // Try to find closing line from Odds API
      const league = (game as any)?.league as string | undefined
      const oddsGames = league ? (oddsCache.get(league) ?? []) : []
      const homeTeam = (game as any)?.home_team as string | undefined
      const awayTeam = (game as any)?.away_team as string | undefined
      let closingLine: number | null = null

      if (homeTeam && awayTeam) {
        const matched = matchOddsApiGame(oddsGames, homeTeam, awayTeam)
        if (matched) {
          if (trade.bet_type === 'moneyline') {
            closingLine = trade.picked_side === 'home'
              ? matched.bestMoneylineHome
              : matched.bestMoneylineAway
          } else {
            closingLine = matched.bestOverLine
          }
        }
      }

      // If trade already has a stored closing_line, prefer that
      if (trade.closing_line != null) closingLine = trade.closing_line

      const clvPercent =
        trade.opening_line != null && closingLine != null
          ? calcClvPercent(trade.opening_line, closingLine, trade.bet_type)
          : null

      return { trade, homeScore, awayScore, gameStatus, autoResult, closingLine, clvPercent }
    })

    return NextResponse.json({ items, total: items.length })
  } catch (err: any) {
    console.error('[settle/preview GET]', err)
    return NextResponse.json({ error: err.message ?? 'Preview failed' }, { status: 500 })
  }
}
