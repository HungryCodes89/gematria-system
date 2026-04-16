import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

type BotId = 'A' | 'B' | 'C' | 'D'

interface BotStats {
  totalBets: number
  wins: number
  losses: number
  pushes: number
  winRate: number
  avgClv: number
  signals: SignalRow[]
  lastFeedback: string | null
}

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

export async function GET() {
  const sb = getSupabaseAdmin()

  const [weightsRes, feedbackRes] = await Promise.all([
    sb
      .from('signal_weights')
      .select('*')
      .order('weight_score', { ascending: false }),
    sb
      .from('performance_feedback')
      .select('bot, result, clv_percent, created_at')
      .order('created_at', { ascending: false })
      .limit(500),
  ])

  const weights: any[] = weightsRes.data ?? []
  const feedback: any[] = feedbackRes.data ?? []

  const bots: BotId[] = ['A', 'B', 'C', 'D']
  const botStats: Record<BotId, BotStats> = {} as any

  for (const bot of bots) {
    const botWeights = weights.filter((w) => w.bot === bot) as SignalRow[]
    const botFeedback = feedback.filter((f) => f.bot === bot)

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

    botStats[bot] = {
      totalBets,
      wins,
      losses,
      pushes,
      winRate: Math.round(winRate * 10000) / 10000,
      avgClv: Math.round(avgClv * 100) / 100,
      signals: botWeights,
      lastFeedback,
    }
  }

  // System status: based on total bets tracked
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
