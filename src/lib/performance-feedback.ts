/**
 * Records performance feedback after settlement and updates signal_weights.
 * Called by the settle route after each batch of trades is resolved.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { extractSignals } from '@/lib/signal-extractor'

type BotId = 'A' | 'B' | 'C' | 'D'

export interface SettledTradeRecord {
  id: string
  game_id: string
  game_date: string | null
  bot: BotId
  lock_type: string | null
  bet_type: string | null
  picked_side: string | null
  pick: string | null
  odds: number | null
  confidence: number | null
  reasoning: string | null
  result: 'win' | 'loss' | 'push'
  clv_percent: number | null
}

interface OtherBotPick {
  pick: string | null
  result: string | null
  agreed: boolean
}

type ConsensusResult = 'hit' | 'miss' | 'mixed' | 'solo' | 'push'

function computeConsensus(
  thisTrade: SettledTradeRecord,
  allBotResults: SettledTradeRecord[]
): { consensusResult: ConsensusResult; otherBotPicks: Record<string, OtherBotPick> } {
  const others = allBotResults.filter(
    (t) => t.game_id === thisTrade.game_id && t.id !== thisTrade.id
  )

  const otherBotPicks: Record<string, OtherBotPick> = {}
  for (const other of others) {
    otherBotPicks[other.bot] = {
      pick: other.pick,
      result: other.result,
      agreed: other.picked_side === thisTrade.picked_side && other.bet_type === thisTrade.bet_type,
    }
  }

  if (others.length === 0) {
    return { consensusResult: 'solo', otherBotPicks }
  }

  // Consider all bots (this + others) that bet on this game
  const allResults = [thisTrade, ...others].map((t) => t.result)
  const wins = allResults.filter((r) => r === 'win').length
  const losses = allResults.filter((r) => r === 'loss').length
  const pushes = allResults.filter((r) => r === 'push').length
  const total = wins + losses + pushes

  let consensusResult: ConsensusResult
  if (pushes === total) consensusResult = 'push'
  else if (wins > losses) consensusResult = 'hit'
  else if (losses > wins) consensusResult = 'miss'
  else consensusResult = 'mixed'

  return { consensusResult, otherBotPicks }
}

/**
 * Upserts sacrifice_patterns for a triple_lock bet that has settled.
 * Only called for trades where lock_type === 'triple_lock' (not sacrifice_lock).
 */
async function upsertSacrificePatterns(
  sb: SupabaseClient,
  bot: BotId,
  signals: string[],
  result: 'win' | 'loss' | 'push'
) {
  if (signals.length === 0) return

  const { data: existing } = await sb
    .from('sacrifice_patterns')
    .select('*')
    .eq('bot', bot)
    .in('signal_name', signals)

  const existingMap = new Map(
    (existing ?? []).map((r: any) => [r.signal_name as string, r])
  )

  const upserts = signals.map((signal) => {
    const cur = existingMap.get(signal) ?? {
      bot, signal_name: signal, triple_lock_fires: 0, sacrifice_outcomes: 0, lock_outcomes: 0,
    }

    const triple_lock_fires = (cur.triple_lock_fires ?? 0) + 1
    const sacrifice_outcomes = (cur.sacrifice_outcomes ?? 0) + (result === 'loss' ? 1 : 0)
    const lock_outcomes = (cur.lock_outcomes ?? 0) + (result === 'win' ? 1 : 0)
    // Pushes increment triple_lock_fires but neither outcome — sacrifice_rate unchanged
    const decided = sacrifice_outcomes + lock_outcomes
    const sacrifice_rate = decided > 0 ? sacrifice_outcomes / decided : 0

    return {
      bot,
      signal_name: signal,
      triple_lock_fires,
      sacrifice_outcomes,
      lock_outcomes,
      sacrifice_rate: Math.round(sacrifice_rate * 10000) / 10000,
      last_updated: new Date().toISOString(),
    }
  })

  await sb.from('sacrifice_patterns').upsert(upserts, { onConflict: 'bot,signal_name' })
}

async function upsertSignalWeights(
  sb: SupabaseClient,
  bot: BotId,
  signals: string[],
  result: 'win' | 'loss' | 'push',
  clvPercent: number | null
) {
  if (signals.length === 0) return

  const { data: existing } = await sb
    .from('signal_weights')
    .select('*')
    .eq('bot', bot)
    .in('signal_name', signals)

  const existingMap = new Map(
    (existing ?? []).map((r: any) => [r.signal_name as string, r])
  )

  const upserts = signals.map((signal) => {
    const cur = existingMap.get(signal) ?? {
      bot,
      signal_name: signal,
      times_fired: 0,
      wins: 0,
      losses: 0,
      pushes: 0,
      total_clv: 0,
    }

    const wins = (cur.wins ?? 0) + (result === 'win' ? 1 : 0)
    const losses = (cur.losses ?? 0) + (result === 'loss' ? 1 : 0)
    const pushes = (cur.pushes ?? 0) + (result === 'push' ? 1 : 0)
    const times_fired = (cur.times_fired ?? 0) + 1
    const total_clv = (cur.total_clv ?? 0) + (clvPercent ?? 0)

    // win_rate excludes pushes (consistent with standard betting math)
    const decidedGames = wins + losses
    const win_rate = decidedGames > 0 ? wins / decidedGames : 0
    const avg_clv = times_fired > 0 ? total_clv / times_fired : 0

    // weight_score = win_rate amplified by positive CLV
    // CLV bonus caps at +20% amplification to avoid runaway scores
    const clvBonus = Math.min(Math.max(avg_clv, 0), 20) / 100
    const weight_score = win_rate * (1 + clvBonus)

    return {
      bot,
      signal_name: signal,
      times_fired,
      wins,
      losses,
      pushes,
      total_clv: Math.round(total_clv * 100) / 100,
      win_rate: Math.round(win_rate * 10000) / 10000,
      avg_clv: Math.round(avg_clv * 100) / 100,
      weight_score: Math.round(weight_score * 10000) / 10000,
      last_updated: new Date().toISOString(),
    }
  })

  await sb
    .from('signal_weights')
    .upsert(upserts, { onConflict: 'bot,signal_name' })
}

/**
 * Called after a batch of trades settles. Records feedback and updates signal weights.
 * Wraps in try/catch — feedback errors must never break settlement.
 */
export async function recordPerformanceFeedback(
  settledTrades: SettledTradeRecord[],
  allGameTrades: SettledTradeRecord[], // all trades on the same games (for cross-bot comparison)
  sb: SupabaseClient
): Promise<void> {
  try {
    for (const trade of settledTrades) {
      const signals = extractSignals(trade)
      const { consensusResult, otherBotPicks } = computeConsensus(trade, allGameTrades)

      // Sacrifice detection:
      // A Triple Lock team that lost = sacrifice confirmed (the pick was wrong direction).
      // A Sacrifice Lock that won = we correctly flipped; sacrifice_detected stays false
      // (the underlying TL team still lost, but we weren't holding that ticket).
      const sacrifice_detected =
        trade.lock_type === 'triple_lock' && trade.result === 'loss'

      // Insert feedback record
      await sb.from('performance_feedback').insert({
        trade_id: trade.id,
        game_id: trade.game_id,
        game_date: trade.game_date ?? new Date().toISOString().slice(0, 10),
        bot: trade.bot,
        signals,
        result: trade.result,
        clv_percent: trade.clv_percent,
        other_bot_picks: otherBotPicks,
        consensus_result: consensusResult,
        sacrifice_detected,
      })

      // Update signal weights for this bot (all trade types)
      await upsertSignalWeights(sb, trade.bot, signals, trade.result, trade.clv_percent)

      // Update sacrifice patterns ONLY for raw triple_lock bets (not sacrifice_lock flips).
      // sacrifice_lock bets are already the flipped pick — they don't contribute to the
      // "how often does signal X cause triple_lock losses" pattern database.
      if (trade.lock_type === 'triple_lock') {
        await upsertSacrificePatterns(sb, trade.bot, signals, trade.result)
      }
    }
  } catch (err) {
    console.error('[performance-feedback] Error recording feedback:', err)
    // Swallow — never break settlement
  }
}
