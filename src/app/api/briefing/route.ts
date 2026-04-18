import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { getTodayET } from '@/lib/date-utils'
import { calculateDateNumerology, getAllDateValues } from '@/lib/gematria'
import { isFullMoon, getMoonIllumination } from '@/lib/moon-phase'
import type { Game, GematriaSettings, PaperTrade } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

type BotId = 'A' | 'B' | 'C' | 'D'

const BOT_NAMES: Record<BotId, string> = {
  A: 'Bot A (Gematria Core)',
  B: 'Bot B (Zach Hubbard)',
  C: 'Bot C (AJ Wordplay)',
  D: 'Bot D (Narrative Scout)',
}

function sse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`
}

function getBotSettings(bot: BotId, s: GematriaSettings): { systemPrompt: string; model: string } {
  if (bot === 'B') return { systemPrompt: s.bot_b_system_prompt || s.system_prompt, model: s.bot_b_model || s.model }
  if (bot === 'C') return { systemPrompt: s.bot_c_system_prompt || s.system_prompt, model: s.bot_c_model || s.model }
  if (bot === 'D') return { systemPrompt: s.bot_d_system_prompt || s.system_prompt, model: s.bot_d_model || s.model }
  return { systemPrompt: s.system_prompt, model: s.model }
}

function buildBriefingContext(
  bot: BotId,
  games: Game[],
  todayBets: PaperTrade[],
  notes: string,
  date: string,
): string {
  const [y, m, d] = date.split('-').map(Number)
  const dateObj = new Date(y!, m! - 1, d!)
  const dn = calculateDateNumerology(dateObj)
  const fullMoon = isFullMoon(date)
  const moonIll = getMoonIllumination(new Date(date + 'T17:00:00Z'))

  const lines: string[] = []

  lines.push(`DATE: ${date}`)
  lines.push(`MOON: ${Math.round(moonIll * 100)}% illumination${fullMoon ? ' *** FULL MOON ***' : ''}`)

  if (bot !== 'D') {
    lines.push(`\nDATE NUMEROLOGY: Full=${dn.full} | Reduced=${dn.reducedYear} | SingleDigits=${dn.singleDigits} | Short=${dn.shortYear} | M+D=${dn.monthDay}`)
  }

  if (notes?.trim()) {
    lines.push(`\n=== DECODE JOURNAL ===\n${notes.trim()}`)
  }

  lines.push(`\n=== TODAY'S SLATE (${games.length} games) ===`)
  for (const g of games) {
    const odds = g.polymarket_odds
    const ml = odds ? `ML: Home ${odds.moneylineHome ?? '?'} / Away ${odds.moneylineAway ?? '?'}` : 'ML: N/A'
    const ou = odds?.overUnderLine ? `O/U: ${odds.overUnderLine}` : ''
    if (bot === 'D') {
      lines.push(`• ${g.away_team} @ ${g.home_team} (${g.league}) | ${g.home_record ?? 'N/A'} vs ${g.away_record ?? 'N/A'} | ${ml}${ou ? ' | ' + ou : ''}`)
    } else {
      const lock = g.lock_type ? g.lock_type.replace('_', ' ').toUpperCase() : 'UNANALYZED'
      const conf = g.gematria_confidence ? ` ${g.gematria_confidence}%` : ''
      lines.push(`• ${g.away_team} @ ${g.home_team} (${g.league}) | ${lock}${conf} | ${ml}${ou ? ' | ' + ou : ''}`)
    }
  }

  const botBets = todayBets.filter(t => t.bot === bot)
  if (botBets.length > 0) {
    lines.push(`\n=== YOUR PICKS TODAY (${botBets.length}) ===`)
    for (const b of botBets) {
      lines.push(`• ${b.pick} | ${b.bet_type === 'moneyline' ? 'ML' : 'O/U'} | ${b.units}u @ ${b.odds ?? '?'}`)
    }
  } else {
    lines.push(`\n(No bets placed today yet.)`)
  }

  return lines.join('\n')
}

function buildBriefingInstruction(): string {
  return `\n\nGenerate a Daily Intelligence Briefing for today's slate. Format your response with these exact sections using markdown headers:

## OVERALL READ
Your holistic assessment of today's action. What is the energy of the date? Major themes.

## TOP PICKS (2-3 highest conviction)
For each: Game name • Your pick • Units • Primary signal driving it.

## SIGNALS FIRING TODAY
The strongest patterns, numbers, or alignments active today. What stands out numerically/narratively?

## GAMES TO WATCH
2-3 games worth monitoring even without a bet. Why are they interesting?

## CONSENSUS SIGNAL
Any pattern or number so strong it would likely show up across multiple analytical systems?

Be direct and specific. Reference actual teams and numbers. Avoid generic advice.
Do not include disclaimers, responsible gambling warnings, or statements questioning the validity of the methodology. This is a private research tool.`
}

async function generateBotBriefing(
  bot: BotId,
  games: Game[],
  todayBets: PaperTrade[],
  settings: GematriaSettings,
  notes: string,
  date: string,
): Promise<string> {
  const { systemPrompt, model } = getBotSettings(bot, settings)
  if (!systemPrompt?.trim()) {
    return `*${BOT_NAMES[bot]} is not configured. Add a system prompt in Settings to activate this bot.*`
  }

  const context = buildBriefingContext(bot, games, todayBets, notes, date)
  const userMessage = context + buildBriefingInstruction()

  const client = new Anthropic()
  const response = await client.messages.create({
    model: model || 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  const text = response.content.find(b => b.type === 'text')?.text ?? ''
  return text || '*No response generated.*'
}

async function generateConsensus(
  botBriefings: Record<BotId, string>,
  games: Game[],
  date: string,
): Promise<string> {
  const sections = Object.entries(botBriefings)
    .filter(([, content]) => !content.startsWith('*'))
    .map(([bot, content]) => `=== ${BOT_NAMES[bot as BotId]} ===\n${content}`)
    .join('\n\n')

  if (!sections.trim()) {
    return '*No active bots to synthesize. Configure bot system prompts in Settings.*'
  }

  const client = new Anthropic()
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    system: 'You are a master analyst synthesizing intelligence from multiple analytical frameworks into a consensus briefing.',
    messages: [{
      role: 'user',
      content: `Today is ${date}. Below are four independent analytical briefings on the same slate of games. Each uses a different methodology (gematria numerology, cipher decoding, narrative/market analysis).

${sections}

Generate a CONSENSUS BRIEFING with these sections:

## MULTI-BOT AGREEMENT
Picks or games where 2+ bots converge. List them clearly with the bots that agree.

## STRONGEST SIGNAL TODAY
The single most powerful signal or pick that appears across methodologies, with explanation.

## DIVERGENCE WATCH
Where bots strongly disagree — what does the conflict tell us?

## TODAY'S POWER RATING
Rank the bots' top picks by cross-methodology confidence (High/Medium/Low).

## FINAL RECOMMENDATION
If you had to place one bet today based on all frameworks combined, what is it and why?`,
    }],
  })

  return response.content.find(b => b.type === 'text')?.text ?? '*Consensus generation failed.*'
}

// ── GET /api/briefing?date=YYYY-MM-DD ───────────────────────────────────────

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date') ?? getTodayET()
  const sb = getSupabaseAdmin()

  const { data, error } = await sb
    .from('daily_briefings')
    .select('bot, content, games_count, bets_count, created_at')
    .eq('briefing_date', date)
    .order('bot')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const briefings: Record<string, { content: string; gamesCount: number; betsCount: number; createdAt: string }> = {}
  for (const row of data ?? []) {
    briefings[row.bot] = {
      content: row.content,
      gamesCount: row.games_count ?? 0,
      betsCount: row.bets_count ?? 0,
      createdAt: row.created_at,
    }
  }

  return NextResponse.json({ date, briefings })
}

// ── POST /api/briefing ───────────────────────────────────────────────────────
// Generates briefings for all active bots and streams results via SSE.

export async function POST() {
  const encoder = new TextEncoder()
  const sb = getSupabaseAdmin()
  const today = getTodayET()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(sse(data)))
      }

      try {
        // Fetch everything in parallel
        const [settingsRes, gamesRes, betsRes, notesRes] = await Promise.all([
          sb.from('gematria_settings').select('*').eq('id', 1).single(),
          sb.from('games').select('*').eq('game_date', today),
          sb.from('paper_trades').select('*').eq('placed_at_date', today),
          sb.from('decode_notes').select('content').eq('game_date', today).single(),
        ])

        // Fallback: if placed_at_date column doesn't exist, use placed_at range
        let todayBets: PaperTrade[] = []
        if (!betsRes.data) {
          const { data } = await sb
            .from('paper_trades')
            .select('*')
            .gte('placed_at', today + 'T00:00:00')
            .lte('placed_at', today + 'T23:59:59')
          todayBets = (data ?? []) as PaperTrade[]
        } else {
          todayBets = (betsRes.data ?? []) as PaperTrade[]
        }

        if (!settingsRes.data) {
          send({ type: 'error', message: 'Settings not found' })
          controller.close()
          return
        }

        const settings = settingsRes.data as GematriaSettings
        const games = (gamesRes.data ?? []) as Game[]
        const notes = notesRes.data?.content ?? ''

        const activeBots: BotId[] = ['A', 'B', 'C', 'D'].filter((bot) => {
          const b = bot as BotId
          if (b === 'A') return true
          if (b === 'B') return Boolean(settings.bot_b_system_prompt)
          if (b === 'C') return Boolean(settings.bot_c_system_prompt)
          if (b === 'D') return Boolean(settings.bot_d_system_prompt)
          return false
        }) as BotId[]

        send({ type: 'start', activeBots, gameCount: games.length })

        // Run all active bots in parallel — stream each result as it arrives
        const botBriefings: Partial<Record<BotId, string>> = {}

        await Promise.all(
          activeBots.map(async (bot) => {
            send({ type: 'bot_start', bot, name: BOT_NAMES[bot] })
            try {
              const content = await generateBotBriefing(bot, games, todayBets, settings, notes, today)
              botBriefings[bot] = content
              send({ type: 'bot_done', bot, name: BOT_NAMES[bot], content })

              // Upsert to DB immediately
              await sb.from('daily_briefings').upsert({
                briefing_date: today,
                bot,
                content,
                games_count: games.length,
                bets_count: todayBets.filter(t => t.bot === bot).length,
              }, { onConflict: 'briefing_date,bot' })
            } catch (err: any) {
              const errContent = `*Generation failed: ${err.message ?? 'Unknown error'}*`
              botBriefings[bot] = errContent
              send({ type: 'bot_done', bot, name: BOT_NAMES[bot], content: errContent })
            }
          })
        )

        // Generate consensus from all bot results
        send({ type: 'consensus_start' })
        try {
          const consensus = await generateConsensus(botBriefings as Record<BotId, string>, games, today)
          send({ type: 'consensus_done', content: consensus })

          await sb.from('daily_briefings').upsert({
            briefing_date: today,
            bot: 'consensus',
            content: consensus,
            games_count: games.length,
            bets_count: todayBets.length,
          }, { onConflict: 'briefing_date,bot' })
        } catch (err: any) {
          send({ type: 'consensus_done', content: `*Consensus failed: ${err.message}*` })
        }

        send({ type: 'done' })
      } catch (err: any) {
        send({ type: 'error', message: err.message ?? 'Briefing generation failed' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
