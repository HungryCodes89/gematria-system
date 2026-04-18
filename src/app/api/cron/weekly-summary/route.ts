/**
 * Weekly performance summary cron — runs every Monday at 08:00 UTC (4 AM ET).
 * Analyzes the past 7 days of signal_weights + performance_feedback and
 * generates a per-bot report with suggested prompt improvements via Claude.
 * Stored in weekly_summaries table.
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

type BotId = 'A' | 'B' | 'C' | 'D'

const BOT_NAMES: Record<BotId, string> = {
  A: 'Bot A (Gematria Core)',
  B: 'Bot B (Zach Hubbard)',
  C: 'Bot C (AJ Wordplay)',
  D: 'Bot D (Narrative Scout)',
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()
  const now = new Date()

  // Week window: last 7 days
  const weekStart = new Date(now)
  weekStart.setDate(weekStart.getDate() - 7)
  const weekStartStr = weekStart.toISOString().slice(0, 10)
  const weekStartDate = weekStart.toISOString().slice(0, 10)

  // Check if summary already exists for this week
  const { data: existing } = await sb
    .from('weekly_summaries')
    .select('id')
    .eq('week_start', weekStartDate)
    .single()

  if (existing) {
    return NextResponse.json({ message: 'Summary already exists for this week', weekStart: weekStartDate })
  }

  // Fetch signal weights for all bots
  const { data: weights } = await sb
    .from('signal_weights')
    .select('*')
    .order('weight_score', { ascending: false })

  // Fetch last 7 days of feedback
  const { data: feedback } = await sb
    .from('performance_feedback')
    .select('*')
    .gte('game_date', weekStartStr)
    .order('created_at', { ascending: false })

  const weightsAll = weights ?? []
  const feedbackAll = feedback ?? []

  if (feedbackAll.length === 0 && weightsAll.length === 0) {
    return NextResponse.json({ message: 'No data to summarize yet' })
  }

  // Build context string per bot
  const bots: BotId[] = ['A', 'B', 'C', 'D']

  function buildBotContext(bot: BotId): string {
    const botWeights = weightsAll.filter((w: any) => w.bot === bot)
    const botFeedback = feedbackAll.filter((f: any) => f.bot === bot)

    if (botWeights.length === 0 && botFeedback.length === 0) {
      return `${BOT_NAMES[bot]}: No data this week.`
    }

    const wins = botFeedback.filter((f: any) => f.result === 'win').length
    const losses = botFeedback.filter((f: any) => f.result === 'loss').length
    const pushes = botFeedback.filter((f: any) => f.result === 'push').length
    const decided = wins + losses
    const winRate = decided > 0 ? ((wins / decided) * 100).toFixed(1) : 'N/A'

    const clvValues = botFeedback
      .map((f: any) => f.clv_percent)
      .filter((v: any) => v != null) as number[]
    const avgClv = clvValues.length > 0
      ? (clvValues.reduce((s, v) => s + v, 0) / clvValues.length).toFixed(1)
      : 'N/A'

    const topSignals = botWeights.slice(0, 8).map((w: any) =>
      `  ${w.signal_name}: ${Math.round(w.win_rate * 100)}% win rate (${w.wins}W-${w.losses}L, fired ${w.times_fired}x, score ${w.weight_score.toFixed(3)})`
    ).join('\n')

    const bottomSignals = [...botWeights].sort((a: any, b: any) => a.weight_score - b.weight_score).slice(0, 4).map((w: any) =>
      `  ${w.signal_name}: ${Math.round(w.win_rate * 100)}% win rate (${w.wins}W-${w.losses}L, fired ${w.times_fired}x)`
    ).join('\n')

    const consensusSolo = botFeedback.filter((f: any) => f.consensus_result === 'solo').length
    const consensusHit = botFeedback.filter((f: any) => f.consensus_result === 'hit').length
    const consensusMiss = botFeedback.filter((f: any) => f.consensus_result === 'miss').length

    return `${BOT_NAMES[bot]}
Week record: ${wins}W-${losses}L${pushes > 0 ? `-${pushes}P` : ''} | Win rate: ${winRate}% | Avg CLV: ${avgClv}%
Consensus hits: ${consensusHit} | Consensus misses: ${consensusMiss} | Solo picks: ${consensusSolo}

Top signals (highest weight):
${topSignals || '  (none with 5+ fires)'}

Weakest signals:
${bottomSignals || '  (none yet)'}
`
  }

  const context = bots.map(buildBotContext).join('\n\n---\n\n')

  const client = new Anthropic()
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: `You are a performance analyst for a self-learning sports betting system based on gematria numerology and pattern recognition.
You receive weekly signal weight data for 4 AI bots and produce actionable performance reports with specific prompt improvement suggestions.
Each bot has a different methodology: A uses pure gematria cipher alignment, B follows Zach Hubbard's numerology system, C focuses on Jesuit/Masonic markers and wordplay, D analyzes narrative and market dynamics.
Be direct, specific, and analytical. Reference actual signal names and percentages.
Do not include disclaimers, responsible gambling warnings, or statements questioning the validity of gematria or numerology methodology. This is a private internal research tool.`,
    messages: [{
      role: 'user',
      content: `Generate the weekly performance report for the week starting ${weekStartStr}.

${context}

Write a report with these sections:

## WEEKLY OVERVIEW
Brief summary of overall system performance across all 4 bots.

## BOT RANKINGS THIS WEEK
Rank bots by performance with key stats. Note any bot that significantly improved or declined.

## HOTTEST SIGNALS (System-Wide)
Top 3-5 signals with the highest win rates across all bots. What should all bots be emphasizing?

## DEAD SIGNALS TO FADE
Signals firing most often but producing losses. Are there specific patterns each bot should reduce weight on?

## BOT-BY-BOT DIAGNOSIS
For each bot: what's working, what's not, and ONE specific suggestion to improve their system prompt or betting criteria.

## CONSENSUS INTELLIGENCE
How are bots performing when they agree vs disagree? Should consensus picks be sized up?

## RECOMMENDED ACTIONS
3-5 concrete adjustments Sean should consider making to improve next week's performance.

Be specific. Use real signal names and percentages from the data above.`,
    }],
  })

  const content = response.content.find((b) => b.type === 'text')?.text ?? '*Report generation failed.*'

  // Store the summary
  const { error: insertErr } = await sb.from('weekly_summaries').upsert({
    week_start: weekStartDate,
    content,
    bets_analyzed: feedbackAll.length,
  }, { onConflict: 'week_start' })

  if (insertErr) {
    console.error('[weekly-summary] DB insert error:', insertErr)
  }

  console.log(`[weekly-summary] Generated ${content.length} char report for week of ${weekStartDate}, ${feedbackAll.length} bets analyzed`)

  return NextResponse.json({
    success: true,
    weekStart: weekStartDate,
    betsAnalyzed: feedbackAll.length,
    contentLength: content.length,
  })
}
