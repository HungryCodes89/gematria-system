import { NextResponse } from 'next/server'
import { getTodayET } from '@/lib/date-utils'
import {
  fetchNBAGames, fetchNHLGames, fetchMLBGames,
  fetchNBAGameById, fetchMLBGameById, fetchNHLGameById,
} from '@/lib/sports-api'
import type { ESPNGame, NHLGame } from '@/lib/sports-api'
import { determineTradeResult, profitLossForSettledTrade } from '@/lib/settlement'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { fetchOddsForLeague, matchOddsApiGame } from '@/lib/the-odds-api'
import { moneylineToImpliedProb } from '@/lib/odds-api'
import { recordPerformanceFeedback } from '@/lib/performance-feedback'
import type { SettledTradeRecord } from '@/lib/performance-feedback'
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
    map.set(g.id, { homeScore: g.homeTeam.score, awayScore: g.awayTeam.score, status: g.status })
  }
  return map
}

function extractScoresFromNhl(games: NHLGame[]): Map<string, GameScores> {
  const map = new Map<string, GameScores>()
  for (const g of games) {
    map.set(g.id, { homeScore: g.homeTeam.score, awayScore: g.awayTeam.score, status: g.status })
  }
  return map
}

function calcClvPercent(openingLine: number, closingLine: number, betType: string): number {
  if (betType === 'moneyline') {
    const closingProb = moneylineToImpliedProb(closingLine)
    const openingProb = moneylineToImpliedProb(openingLine)
    return Math.round((closingProb - openingProb) * 10000) / 100
  }
  return Math.round((closingLine - openingLine) * 100) / 100
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
        success: true, settled: 0, stillPending: 0,
        results: { wins: 0, losses: 0, pushes: 0 },
        dailyPL: 0, newBalance: null,
      })
    }

    // ── Auto-fetch closing lines from Odds API ───────────────────────────────
    // Do this first so lines are captured while games may still be active.
    // Trades that already have a closing_line stored are skipped.
    const leagues = [
      ...new Set(
        pendingTrades.flatMap((t) => {
          const league = (t.game as any)?.league as string | undefined
          return league ? [league] : []
        })
      ),
    ]

    const oddsCache = new Map<string, Awaited<ReturnType<typeof fetchOddsForLeague>>>()
    await Promise.all(
      leagues.map(async (league) => {
        oddsCache.set(league, await fetchOddsForLeague(league).catch(() => []))
      })
    )

    // Save closing lines for trades that don't have one yet
    for (const trade of pendingTrades) {
      if (trade.closing_line != null) continue // already stored
      const game = trade.game as any
      if (!game?.home_team || !game?.away_team || !game?.league) continue

      const oddsGames = oddsCache.get(game.league) ?? []
      const matched = matchOddsApiGame(oddsGames, game.home_team, game.away_team)
      if (!matched) continue

      let closingLine: number | null = null
      if (trade.bet_type === 'moneyline') {
        closingLine = trade.picked_side === 'home'
          ? matched.bestMoneylineHome
          : matched.bestMoneylineAway
      } else if (trade.bet_type === 'over_under') {
        closingLine = matched.bestOverLine
      }

      if (closingLine == null) continue

      const clv_percent =
        trade.opening_line != null
          ? calcClvPercent(trade.opening_line, closingLine, trade.bet_type ?? 'moneyline')
          : null

      await sb
        .from('paper_trades')
        .update({ closing_line: closingLine, clv_percent })
        .eq('id', trade.id)

      // Patch in-memory so we use it during settlement below
      trade.closing_line = closingLine
    }

    // ── Fetch final scores ───────────────────────────────────────────────────
    const gameDates = new Set<string>()
    for (const t of pendingTrades) {
      const d = (t.game as any)?.game_date
      if (d) gameDates.add(d)
    }
    if (gameDates.size === 0) gameDates.add(getTodayET())

    const scoreMap = new Map<string, GameScores>()
    for (const dateStr of gameDates) {
      const [nba, nhl, mlb] = await Promise.all([
        fetchNBAGames(dateStr).catch(() => [] as ESPNGame[]),
        fetchNHLGames(dateStr).catch(() => [] as NHLGame[]),
        fetchMLBGames(dateStr).catch(() => [] as ESPNGame[]),
      ])
      for (const [id, s] of extractScoresFromEspn(nba)) scoreMap.set(id, s)
      for (const [id, s] of extractScoresFromNhl(nhl)) scoreMap.set(id, s)
      for (const [id, s] of extractScoresFromEspn(mlb)) scoreMap.set(id, s)
    }

    // ── Fallback: per-game lookup for any IDs missing from the scoreboard ────
    // ESPN's scoreboard endpoint can omit games (pagination / date boundaries).
    // For each pending trade whose game_id wasn't returned, fetch it directly.
    const missingIds = pendingTrades
      .filter((t) => !scoreMap.has(t.game_id))
      .reduce((acc, t) => {
        const league: string = (t.game as any)?.league ?? ''
        if (!acc.has(t.game_id)) acc.set(t.game_id, league)
        return acc
      }, new Map<string, string>())

    await Promise.all(
      [...missingIds.entries()].map(async ([gameId, league]) => {
        let game: { homeScore: number; awayScore: number; status: string } | null = null
        if (league === 'NBA') {
          const g = await fetchNBAGameById(gameId).catch(() => null)
          if (g) game = { homeScore: g.homeTeam.score, awayScore: g.awayTeam.score, status: g.status }
        } else if (league === 'MLB') {
          const g = await fetchMLBGameById(gameId).catch(() => null)
          if (g) game = { homeScore: g.homeTeam.score, awayScore: g.awayTeam.score, status: g.status }
        } else if (league === 'NHL') {
          const g = await fetchNHLGameById(gameId).catch(() => null)
          if (g) game = { homeScore: g.homeTeam.score, awayScore: g.awayTeam.score, status: g.status }
        }
        if (game) scoreMap.set(gameId, game)
      })
    )

    // ── Settle final games ───────────────────────────────────────────────────
    let settled = 0, wins = 0, losses = 0, pushes = 0, totalPL = 0
    const settledTradeRecords: SettledTradeRecord[] = []
    const historicalUpserts = new Map<string, object>() // keyed by game_id, deduped

    for (const trade of pendingTrades) {
      const liveScores = scoreMap.get(trade.game_id)
      if (!liveScores || liveScores.status !== 'post') continue

      // Update game row with final scores
      await sb
        .from('games')
        .update({
          home_score: liveScores.homeScore,
          away_score: liveScores.awayScore,
          status: 'final',
          updated_at: new Date().toISOString(),
        })
        .eq('id', trade.game_id)

      const tradeForSettle: PaperTrade = { ...trade, game: undefined }
      const result = determineTradeResult(tradeForSettle, liveScores.homeScore, liveScores.awayScore)
      const pl = profitLossForSettledTrade(tradeForSettle, result)

      // Compute CLV% at settlement time using whatever closing_line we have
      const clv_percent =
        trade.closing_line != null && trade.opening_line != null
          ? calcClvPercent(trade.opening_line, trade.closing_line, trade.bet_type ?? 'moneyline')
          : undefined

      const updatePayload: Record<string, unknown> = {
        result,
        profit_loss: pl,
        settled_at: new Date().toISOString(),
      }
      if (clv_percent !== undefined) updatePayload.clv_percent = clv_percent

      const { error: updateErr } = await sb
        .from('paper_trades')
        .update(updatePayload)
        .eq('id', trade.id)
        .eq('result', 'pending')

      if (!updateErr) {
        // Collect for historical_games archive (deduped per game)
        if (!historicalUpserts.has(trade.game_id)) {
          const g = trade.game as any
          const gdate: string = g?.game_date ?? ''
          const [yr, mo] = gdate.split('-').map(Number)
          const league: string = g?.league ?? ''
          const season = league === 'MLB'
            ? String(yr)
            : (mo >= 10 ? `${yr}-${String(yr + 1).slice(2)}` : `${yr - 1}-${String(yr).slice(2)}`)
          historicalUpserts.set(trade.game_id, {
            id: trade.game_id,
            league,
            season,
            game_date: gdate,
            home_team: g?.home_team ?? '',
            away_team: g?.away_team ?? '',
            home_score: liveScores.homeScore,
            away_score: liveScores.awayScore,
          })
        }
        settled++
        totalPL += pl
        if (result === 'win') wins++
        else if (result === 'loss') losses++
        else if (result === 'push') pushes++

        // Accumulate for performance feedback (only win/loss/push, not void)
        if (result === 'win' || result === 'loss' || result === 'push') {
          settledTradeRecords.push({
            id: trade.id,
            game_id: trade.game_id,
            game_date: (trade.game as any)?.game_date ?? null,
            bot: trade.bot as 'A' | 'B' | 'C' | 'D',
            lock_type: trade.lock_type ?? null,
            bet_type: trade.bet_type ?? null,
            picked_side: trade.picked_side ?? null,
            pick: trade.pick ?? null,
            odds: trade.odds ?? null,
            confidence: trade.confidence ?? null,
            reasoning: trade.reasoning ?? null,
            result,
            clv_percent: clv_percent ?? null,
          })
        }
      }
    }

    // ── Update bankroll ledger ───────────────────────────────────────────────
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
          date: today, balance: newBalance,
          daily_pl: totalPL, wins, losses, bets_placed: settled,
        }, { onConflict: 'date' })
    }

    // ── Archive final games to historical_games ──────────────────────────────
    if (historicalUpserts.size > 0) {
      await sb
        .from('historical_games')
        .upsert([...historicalUpserts.values()], { onConflict: 'id', ignoreDuplicates: true })
        .then(({ error }) => { if (error) console.warn('[settle] historical_games upsert:', error.message) })
    }

    // ── Record performance feedback (non-blocking) ───────────────────────────
    if (settledTradeRecords.length > 0) {
      // Build allGameTrades from pendingTrades (includes all bots on same games)
      const allGameTrades: SettledTradeRecord[] = settledTradeRecords // settled ones are enough for cross-bot comparison
      await recordPerformanceFeedback(settledTradeRecords, allGameTrades, sb)
    }

    return NextResponse.json({
      success: true,
      settled,
      stillPending: pendingTrades.length - settled,
      results: { wins, losses, pushes },
      dailyPL: totalPL,
      newBalance: newBalance ?? prevBalance,
    })
  } catch (err: any) {
    console.error('[settle]', err)
    return NextResponse.json({ error: err.message ?? 'Settlement failed' }, { status: 500 })
  }
}
