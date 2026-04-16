import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

type BotId = 'A' | 'B' | 'C' | 'D'

interface SignalRow {
  signal_name: string
  times_fired: number
  wins: number
  losses: number
  pushes: number
  win_rate: number
  avg_clv: number
  weight_score: number
  last_updated: string
}

interface SacrificePatternRow {
  signal_name: string
  triple_lock_fires: number
  sacrifice_outcomes: number
  lock_outcomes: number
  sacrifice_rate: number
}

interface SacrificeStats {
  totalTripleLocks: number
  tripleWins: number
  tripleLosses: number
  historicalSacrificeRate: number   // how often TL team lost (sacrifice events)
  sacrificeLocksPlaced: number      // how many auto-flips were placed
  sacrificeLockWins: number
  sacrificeLockLosses: number
  sacrificeLockWinRate: number      // win rate when we flip
  patterns: SacrificePatternRow[]   // sorted by sacrifice_rate desc
}

interface BotStats {
  totalBets: number
  wins: number
  losses: number
  pushes: number
  winRate: number
  avgClv: number
  signals: SignalRow[]
  sacrifice: SacrificeStats
  lastFeedback: string | null
}

export async function GET() {
  const sb = getSupabaseAdmin()

  const [weightsRes, feedbackRes, sacrificePatternsRes, sacrificeTradesRes] = await Promise.all([
    sb
      .from('signal_weights')
      .select('*')
      .order('weight_score', { ascending: false }),
    sb
      .from('performance_feedback')
      .select('bot, result, clv_percent, created_at, sacrifice_detected')
      .order('created_at', { ascending: false })
      .limit(500),
    sb
      .from('sacrifice_patterns')
      .select('*')
      .order('sacrifice_rate', { ascending: false }),
    // Sacrifice lock trades: placed when we auto-flipped a triple lock
    sb
      .from('paper_trades')
      .select('bot, result, lock_type')
      .eq('lock_type', 'sacrifice_lock')
      .neq('result', 'pending'),
  ])

  const weights: any[] = weightsRes.data ?? []
  const feedback: any[] = feedbackRes.data ?? []
  const sacrificePatterns: any[] = sacrificePatternsRes.data ?? []
  const sacrificeTrades: any[] = sacrificeTradesRes.data ?? []

  const bots: BotId[] = ['A', 'B', 'C', 'D']
  const botStats: Record<BotId, BotStats> = {} as any

  for (const bot of bots) {
    const botWeights = weights.filter((w) => w.bot === bot) as SignalRow[]
    const botFeedback = feedback.filter((f) => f.bot === bot)
    const botSacrificePatterns = sacrificePatterns.filter((p) => p.bot === bot) as SacrificePatternRow[]
    const botSacrificeTrades = sacrificeTrades.filter((t) => t.bot === bot)

    // Overall stats
    const wins = botFeedback.filter((f) => f.result === 'win').length
    const losses = botFeedback.filter((f) => f.result === 'loss').length
    const pushes = botFeedback.filter((f) => f.result === 'push').length
    const totalBets = wins + losses + pushes
    const decidedGames = wins + losses
    const winRate = decidedGames > 0 ? wins / decidedGames : 0

    const clvValues = botFeedback
      .map((f) => f.clv_percent)
      .filter((v): v is number => v != null)
    const avgClv = clvValues.length > 0
      ? clvValues.reduce((s, v) => s + v, 0) / clvValues.length
      : 0

    const lastFeedback = botFeedback[0]?.created_at ?? null

    // Sacrifice stats
    const sacrificeEvents = botFeedback.filter((f) => f.sacrifice_detected === true)
    // Triple lock bets (raw): those where sacrifice was either confirmed or didn't fire
    // We derive triple lock totals from feedback records that have sacrifice_detected field
    // (all triple_lock settled trades have this field set to true or false)
    // For simplicity, sum from sacrifice_patterns triple_lock_fires
    const totalTripleLocks = botSacrificePatterns.reduce((s, p) => {
      // Each row tracks its own signal — but one trade fires multiple signals.
      // Use the triple_lock signal row as the canonical count (most common signal on TL trades)
      return p.signal_name === 'triple_lock' ? p.triple_lock_fires : s
    }, 0)
    const tripleWins = botSacrificePatterns.find(p => p.signal_name === 'triple_lock')?.lock_outcomes ?? 0
    const tripleLosses = botSacrificePatterns.find(p => p.signal_name === 'triple_lock')?.sacrifice_outcomes ?? 0
    const historicalSacrificeRate = (tripleWins + tripleLosses) > 0
      ? tripleLosses / (tripleWins + tripleLosses) : 0

    // Sacrifice flip (sacrifice_lock) performance
    const slWins = botSacrificeTrades.filter((t) => t.result === 'win').length
    const slLosses = botSacrificeTrades.filter((t) => t.result === 'loss').length
    const slDecided = slWins + slLosses
    const sacrificeLockWinRate = slDecided > 0 ? slWins / slDecided : 0

    botStats[bot] = {
      totalBets,
      wins,
      losses,
      pushes,
      winRate: Math.round(winRate * 10000) / 10000,
      avgClv: Math.round(avgClv * 100) / 100,
      signals: botWeights,
      sacrifice: {
        totalTripleLocks,
        tripleWins,
        tripleLosses,
        historicalSacrificeRate: Math.round(historicalSacrificeRate * 10000) / 10000,
        sacrificeLocksPlaced: botSacrificeTrades.length,
        sacrificeLockWins: slWins,
        sacrificeLockLosses: slLosses,
        sacrificeLockWinRate: Math.round(sacrificeLockWinRate * 10000) / 10000,
        patterns: botSacrificePatterns,
      },
      lastFeedback,
    }
  }

  // System status
  const totalTracked = Object.values(botStats).reduce((s, b) => s + b.totalBets, 0)
  const oldestUpdate = weights.length > 0
    ? weights.map((w) => w.last_updated).sort()[0]
    : null
  const daysSinceUpdate = oldestUpdate
    ? (Date.now() - new Date(oldestUpdate).getTime()) / (1000 * 60 * 60 * 24)
    : 999

  let systemStatus: 'active' | 'warming' | 'cold'
  if (totalTracked === 0) systemStatus = 'cold'
  else if (totalTracked < 20 || daysSinceUpdate > 30) systemStatus = 'warming'
  else systemStatus = 'active'

  return NextResponse.json({ bots: botStats, systemStatus, totalTracked })
}
