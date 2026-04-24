import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { getYesterdayET } from '@/lib/date-utils'
import type { GematriaSettings, PaperTrade } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

type BotId = 'A' | 'B' | 'C' | 'D'

const BOT_NAMES: Record<BotId, string> = {
  A: 'Bot A (Gematria Core)',
  B: 'Bot B (Zach Hubbard)',
  C: 'Bot C (AJ Wordplay)',
  D: 'Bot D (Narrative Scout)',
}

function getBotSystemPrompt(bot: BotId, settings: GematriaSettings): string {
  if (bot === 'B') return settings.bot_b_system_prompt || settings.system_prompt
  if (bot === 'C') return settings.bot_c_system_prompt || settings.system_prompt
  if (bot === 'D') return settings.bot_d_system_prompt || settings.system_prompt
  return settings.system_prompt
}

function getBotModel(bot: BotId, settings: GematriaSettings): string {
  if (bot === 'B') return settings.bot_b_model || settings.model
  if (bot === 'C') return settings.bot_c_model || settings.model
  if (bot === 'D') return settings.bot_d_model || settings.model
  return settings.model
}

function buildOutcomeSummary(trades: PaperTrade[]): string {
  if (trades.length === 0) return '(No bets were placed or settled for this date.)'

  const wins = trades.filter(t => t.result === 'win').length
  const losses = trades.filter(t => t.result === 'loss').length
  const pushes = trades.filter(t => t.result === 'push').length
  const totalPL = trades.reduce((s, t) => s + (t.profit_loss ?? 0), 0)

  const lines: string[] = [
    `RESULTS: ${wins}W-${losses}L-${pushes}P | Net: ${totalPL >= 0 ? '+' : ''}${totalPL.toFixed(2)}u`,
    '',
  ]

  for (const t of trades) {
    const outcome = t.result?.toUpperCase() ?? 'UNKNOWN'
    const pl = t.profit_loss != null ? ` (${t.profit_loss >= 0 ? '+' : ''}${t.profit_loss}u)` : ''
    lines.push(`• ${t.pick} | ${t.bet_type === 'moneyline' ? 'ML' : 'O/U'} | ${t.units}u @ ${t.odds ?? '?'} | ${outcome}${pl} | ${t.lock_type ?? 'no lock'}`)
    if (t.reasoning) {
      lines.push(`  Signal reasoning: ${t.reasoning.slice(0, 180)}`)
    }
  }

  return lines.join('\n')
}

function buildReflectionPrompt(originalBriefing: string, outcomes: string, date: string): string {
  return `Date: ${date}

You wrote this morning briefing. Now the games are final. Review your own work honestly.

=== YOUR MORNING BRIEFING ===
${originalBriefing}

=== ACTUAL OUTCOMES ===
${outcomes}

Generate a REFLECTION REPORT. This is how the system learns. Be precise, not diplomatic.

## WHAT I GOT RIGHT
Specific claims from this morning that proved correct — which teams, which numbers, which signals hit. Name them exactly.

## WHAT I GOT WRONG
Specific claims that failed. Pay particular attention to absolute language: "scripted," "handed to," "always," "guaranteed." Which number signals fired but didn't determine the result?

## SIGNAL CALIBRATION
For each major signal you invoked today (specific cipher values, date numerology, moon phase, sacrifice markers), state what its actual track record suggests. Replace absolute language with calibrated language. Example: instead of "74 teams WIN," try "74 alignment has hit in 7 of 10 observed cases — high confidence, not certainty."

## LESSON FOR TOMORROW
One specific, concrete behavioral change for tomorrow's briefing. Not vague ("be less certain") — name the exact signal or claim pattern you will adjust.`
}

async function generateBotReflection(
  bot: BotId,
  originalBriefing: string,
  trades: PaperTrade[],
  settings: GematriaSettings,
  date: string,
): Promise<string> {
  const systemPrompt = getBotSystemPrompt(bot, settings)
  const model = getBotModel(bot, settings) || 'claude-sonnet-4-6'

  if (!systemPrompt?.trim()) return `*${BOT_NAMES[bot]} is not configured — no reflection generated.*`
  if (!originalBriefing || originalBriefing.startsWith('*')) {
    return `*No briefing found for ${date} — nothing to reflect on.*`
  }

  const outcomes = buildOutcomeSummary(trades)
  const client = new Anthropic()

  const response = await client.messages.create({
    model,
    max_tokens: 1000,
    system: systemPrompt,
    messages: [{ role: 'user', content: buildReflectionPrompt(originalBriefing, outcomes, date) }],
  })

  return response.content.find(b => b.type === 'text')?.text ?? '*Reflection generation failed.*'
}

// ── GET /api/reflection?date=YYYY-MM-DD ─────────────────────────────────────
// Fetch stored reflections for a date (defaults to yesterday).

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date') ?? getYesterdayET()
  const sb = getSupabaseAdmin()

  const { data, error } = await sb
    .from('briefing_reflections')
    .select('bot, reflection_content, trades_won, trades_lost, trades_pushed, created_at')
    .eq('reflection_date', date)
    .order('bot')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const reflections: Record<string, unknown> = {}
  for (const row of data ?? []) {
    reflections[row.bot] = row
  }

  return NextResponse.json({ date, reflections })
}

// ── POST /api/reflection?date=YYYY-MM-DD ────────────────────────────────────
// Generate and store reflections for all bots for a given date.
// Called by the cron (GET /api/cron/reflection) and manually from the UI.

export async function POST(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date') ?? getYesterdayET()
  const sb = getSupabaseAdmin()

  const [settingsRes, briefingsRes, tradesRes] = await Promise.all([
    sb.from('gematria_settings').select('*').eq('id', 1).single(),
    sb.from('daily_briefings').select('bot, content').eq('briefing_date', date),
    sb.from('paper_trades').select('*').gte('placed_at', date + 'T00:00:00').lte('placed_at', date + 'T23:59:59').neq('result', 'pending'),
  ])

  if (!settingsRes.data) {
    return NextResponse.json({ error: 'Settings not found' }, { status: 500 })
  }

  const settings = settingsRes.data as GematriaSettings
  const allTrades = (tradesRes.data ?? []) as PaperTrade[]

  const briefingMap: Record<string, string> = {}
  for (const row of briefingsRes.data ?? []) {
    briefingMap[row.bot] = row.content
  }

  const bots: BotId[] = ['A', 'B', 'C', 'D']
  const results: Record<string, string> = {}

  await Promise.all(
    bots.map(async (bot) => {
      const originalBriefing = briefingMap[bot] ?? ''
      const botTrades = allTrades.filter(t => t.bot === bot)

      try {
        const reflection = await generateBotReflection(bot, originalBriefing, botTrades, settings, date)
        results[bot] = reflection

        await sb.from('briefing_reflections').upsert(
          {
            reflection_date: date,
            bot,
            original_briefing: originalBriefing,
            reflection_content: reflection,
            trades_won: botTrades.filter(t => t.result === 'win').length,
            trades_lost: botTrades.filter(t => t.result === 'loss').length,
            trades_pushed: botTrades.filter(t => t.result === 'push').length,
          },
          { onConflict: 'reflection_date,bot' }
        )
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        results[bot] = `*Reflection failed: ${msg}*`
      }
    })
  )

  return NextResponse.json({ date, reflections: results })
}
