import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { fetchOddsForLeague, matchOddsApiGame } from '@/lib/the-odds-api'
import { moneylineToImpliedProb } from '@/lib/odds-api'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function calcClvPercent(openingLine: number, closingLine: number, betType: string): number {
  if (betType === 'moneyline') {
    const closingProb = moneylineToImpliedProb(closingLine)
    const openingProb = moneylineToImpliedProb(openingLine)
    return Math.round((closingProb - openingProb) * 10000) / 100
  }
  return Math.round((closingLine - openingLine) * 100) / 100
}

// Runs at 6:30 PM ET (22:30 UTC / EDT) — before evening games tip off.
// Snapshots current Odds API lines as closing lines for all pending bets.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const sb = getSupabaseAdmin()

    const { data: trades, error } = await sb
      .from('paper_trades')
      .select('id, bet_type, picked_side, opening_line, closing_line, game:games(*)')
      .eq('result', 'pending')

    if (error) throw error
    if (!trades?.length) {
      return NextResponse.json({ snapshotted: 0, total: 0 })
    }

    // Unique leagues
    const leagues = [
      ...new Set(
        trades.flatMap((t) => {
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

    let snapshotted = 0
    let alreadyHad = 0

    for (const trade of trades) {
      // Overwrite with today's fresh snapshot even if one exists — this IS the closing line run
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

      if (trade.closing_line != null) alreadyHad++

      const { error: updateErr } = await sb
        .from('paper_trades')
        .update({ closing_line: closingLine, clv_percent })
        .eq('id', trade.id)

      if (!updateErr) snapshotted++
    }

    console.log(`[snapshot-lines] snapshotted=${snapshotted} alreadyHad=${alreadyHad} total=${trades.length}`)
    return NextResponse.json({ snapshotted, alreadyHad, total: trades.length })
  } catch (err: any) {
    console.error('[snapshot-lines]', err)
    return NextResponse.json({ error: err.message ?? 'Snapshot failed' }, { status: 500 })
  }
}
