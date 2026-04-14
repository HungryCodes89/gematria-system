import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { getTodayET } from "@/lib/date-utils";
import { analyzeGameWithClaude } from "@/lib/claude-agent";
import { canPlaceBet, calculateStake } from "@/lib/paper-trading";
import { calculateDateNumerology, getAllDateValues } from "@/lib/gematria";
import type {
  Game,
  GematriaSettings,
  TradeDecision,
  LockType,
} from "@/lib/types";
import type { GameAnalysisResult, MatchedPattern } from "@/lib/claude-agent";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const AUTO_BET_MAP: Record<LockType, keyof GematriaSettings | null> = {
  triple_lock: "auto_bet_triple_locks",
  double_lock: "auto_bet_double_locks",
  single_lock: "auto_bet_single_locks",
  no_lock: null,
};

function sse(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function extractOpeningLine(
  game: Game,
  betType: string,
  pickedSide: string | null
): number | null {
  const odds = game.polymarket_odds;
  if (!odds) return null;
  // Prefer Pinnacle (sharpest book) for CLV benchmark; fall back to polymarket
  if (betType === "over_under") {
    return odds.pinnacleOverUnderLine ?? odds.overUnderLine ?? null;
  }
  if (betType === "moneyline") {
    if (pickedSide === "home") return odds.pinnacleMoneylineHome ?? odds.moneylineHome ?? null;
    if (pickedSide === "away") return odds.pinnacleMoneylineAway ?? odds.moneylineAway ?? null;
  }
  return null;
}

interface DecisionLog {
  idx: number;
  action: string;
  betType: string;
  pick: string;
  claudeConfidence: number;
  engineLockType: string;
  placed: boolean;
  skipReason?: string;
  dbError?: string;
}

async function placeBots(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  game: Game,
  decisions: TradeDecision[],
  analysis: GameAnalysisResult,
  bot: "A" | "B" | "C",
  settings: GematriaSettings,
  state: { balance: number; dailyUnits: number; betsPlaced: number }
): Promise<DecisionLog[]> {
  const logs: DecisionLog[] = [];

  for (let idx = 0; idx < decisions.length; idx++) {
    const decision = decisions[idx]!;
    const base = {
      idx,
      action: decision.action,
      betType: decision.betType,
      pick: decision.pick,
      claudeConfidence: decision.confidence,
      engineLockType: analysis.lockType,
    };

    if (decision.action !== "bet") {
      logs.push({ ...base, placed: false, skipReason: "Claude returned action=skip" });
      continue;
    }

    const autoBetKey = AUTO_BET_MAP[analysis.lockType];
    if (!autoBetKey) {
      logs.push({ ...base, placed: false, skipReason: `Engine: ${analysis.lockType} — no auto-bet for no_lock` });
      continue;
    }
    if (!settings[autoBetKey]) {
      logs.push({ ...base, placed: false, skipReason: `Auto-bet disabled for ${analysis.lockType} (settings.${autoBetKey}=false)` });
      continue;
    }
    if (decision.confidence < settings.min_confidence) {
      logs.push({ ...base, placed: false, skipReason: `Claude confidence ${decision.confidence}% < min_confidence ${settings.min_confidence}%` });
      continue;
    }
    if (!canPlaceBet(state.balance, state.dailyUnits, decision.units, settings)) {
      const stake = calculateStake(decision.units, settings.unit_size);
      logs.push({ ...base, placed: false, skipReason: `Limit hit: balance=$${state.balance} stake=$${stake} dailyUnits=${state.dailyUnits}/${settings.max_daily_units}` });
      continue;
    }

    const stake = calculateStake(decision.units, settings.unit_size);
    const potentialProfit =
      decision.odds > 0
        ? stake * (decision.odds / 100)
        : stake * (100 / Math.abs(decision.odds));

    const { error: insertErr } = await supabase
      .from("paper_trades")
      .insert({
        game_id: game.id,
        bot,
        bet_type: decision.betType,
        pick: decision.pick,
        picked_side: decision.pickedSide,
        odds: decision.odds,
        implied_probability: decision.impliedProbability,
        model_probability: decision.modelProbability,
        ev: decision.ev,
        units: decision.units,
        stake,
        potential_profit: potentialProfit,
        result: "pending",
        profit_loss: 0,
        confidence: decision.confidence,
        lock_type: analysis.lockType,
        reasoning: decision.reasoning,
        opening_line: extractOpeningLine(game, decision.betType, decision.pickedSide),
        placed_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (!insertErr) {
      state.balance -= stake;
      state.dailyUnits += decision.units;
      state.betsPlaced++;
      logs.push({ ...base, placed: true });
    } else {
      logs.push({ ...base, placed: false, skipReason: "DB insert failed", dbError: insertErr.message });
    }
  }

  return logs;
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const today = getTodayET();

  // Parse request body — bot selector + optional single-game re-analyze
  let botParam: "all" | "A" | "B" | "C" = "all";
  let gameIdParam: string | null = null;
  try {
    const body = await req.json();
    if (["all", "A", "B", "C"].includes(body?.bot)) botParam = body.bot;
    if (body?.gameId && typeof body.gameId === "string") gameIdParam = body.gameId;
  } catch { /* no body — use default */ }

  const { data: settingsRow } = await supabase
    .from("gematria_settings")
    .select("*")
    .eq("id", 1)
    .single();

  if (!settingsRow) {
    return Response.json({ error: "Settings not found" }, { status: 500 });
  }
  const settings = settingsRow as GematriaSettings;

  // Build per-bot effective settings (fall back to Bot A values if unset)
  const botBSettings: GematriaSettings = {
    ...settings,
    system_prompt: settings.bot_b_system_prompt || settings.system_prompt,
    bet_rules: settings.bot_b_bet_rules || settings.bet_rules,
    model: settings.bot_b_model || settings.model,
  };
  const botCSettings: GematriaSettings = {
    ...settings,
    system_prompt: settings.bot_c_system_prompt || settings.system_prompt,
    bet_rules: settings.bot_c_bet_rules || settings.bet_rules,
    model: settings.bot_c_model || settings.model,
  };

  const runA = botParam === "all" || botParam === "A";
  const runB = (botParam === "all" || botParam === "B") && Boolean(settings.bot_b_system_prompt);
  const runC = (botParam === "all" || botParam === "C") && Boolean(settings.bot_c_system_prompt);

  // Single-game re-analyze: mark unanalyzed first, then fetch just that game
  if (gameIdParam) {
    await supabase.from("games").update({ analyzed: false }).eq("id", gameIdParam);
  }

  const gamesQuery = gameIdParam
    ? supabase.from("games").select("*").eq("id", gameIdParam)
    : supabase.from("games").select("*").eq("game_date", today).eq("analyzed", false);

  const { data: games } = await gamesQuery;
  const unanalyzed: Game[] = (games ?? []) as Game[];

  // Fetch today's decode notes once and inject into all bot prompts
  const { data: notesRow } = await supabase
    .from("decode_notes")
    .select("content")
    .eq("game_date", today)
    .single();
  const todayNotes = notesRow?.content ?? "";

  // Fetch validated patterns and match against tonight's date numerology
  const [y, m, d] = today.split("-").map(Number);
  const todayDateObj = new Date(y!, m! - 1, d!);
  const todayNumerology = calculateDateNumerology(todayDateObj);
  const todayValueSet = new Set(getAllDateValues(todayNumerology));

  const { data: allPatterns } = await supabase
    .from("validated_patterns")
    .select("*")
    .eq("outcome", "hit");

  const matchedPatterns: MatchedPattern[] = (allPatterns ?? []).filter((p) => {
    const dateNums: number[] = p.date_numerology ?? [];
    return dateNums.some((n) => todayValueSet.has(n));
  });

  const { data: ledgerRow } = await supabase
    .from("bankroll_ledger")
    .select("balance")
    .order("date", { ascending: false })
    .limit(1)
    .single();

  const balance = ledgerRow?.balance ?? settings.starting_bankroll;

  // Query each bot's daily units independently
  const [botARes, botBRes, botCRes] = await Promise.all([
    supabase
      .from("paper_trades")
      .select("units")
      .eq("bot", "A")
      .gte("placed_at", `${today}T00:00:00`)
      .lt("placed_at", `${today}T23:59:59.999`),
    supabase
      .from("paper_trades")
      .select("units")
      .eq("bot", "B")
      .gte("placed_at", `${today}T00:00:00`)
      .lt("placed_at", `${today}T23:59:59.999`),
    supabase
      .from("paper_trades")
      .select("units")
      .eq("bot", "C")
      .gte("placed_at", `${today}T00:00:00`)
      .lt("placed_at", `${today}T23:59:59.999`),
  ]);

  const botAState = {
    balance,
    dailyUnits: (botARes.data ?? []).reduce((s: number, t: { units: number }) => s + (t.units ?? 0), 0),
    betsPlaced: 0,
  };
  const botBState = {
    balance,
    dailyUnits: (botBRes.data ?? []).reduce((s: number, t: { units: number }) => s + (t.units ?? 0), 0),
    betsPlaced: 0,
  };
  const botCState = {
    balance,
    dailyUnits: (botCRes.data ?? []).reduce((s: number, t: { units: number }) => s + (t.units ?? 0), 0),
    betsPlaced: 0,
  };

  const total = unanalyzed.length;
  let analyzed = 0;
  const errors: string[] = [];

  const stream = new ReadableStream({
    async start(controller) {
      for (let i = 0; i < unanalyzed.length; i++) {
        const game = unanalyzed[i]!;

        try {
          controller.enqueue(
            sse({
              game: i + 1,
              total,
              status: "analyzing",
              teams: `${game.away_team} at ${game.home_team}`,
            })
          );

          // --- Bot A ---
          let analysisA: GameAnalysisResult | null = null;
          let logsA: DecisionLog[] = [];
          if (runA) {
            const { analysis, decisions } = await analyzeGameWithClaude(game, settings, "A", todayNotes, matchedPatterns);
            analysisA = analysis;
            logsA = await placeBots(supabase, game, decisions, analysis, "A", settings, botAState);
          }

          // --- Bot B ---
          let analysisB: GameAnalysisResult | null = null;
          let logsB: DecisionLog[] = [];
          if (runB) {
            const { analysis, decisions } = await analyzeGameWithClaude(game, botBSettings, "B", todayNotes, matchedPatterns);
            analysisB = analysis;
            logsB = await placeBots(supabase, game, decisions, analysis, "B", settings, botBState);
          }

          // --- Bot C (AJ Wordplay) ---
          let analysisC: GameAnalysisResult | null = null;
          let logsC: DecisionLog[] = [];
          if (runC) {
            const { analysis, decisions } = await analyzeGameWithClaude(game, botCSettings, "C", todayNotes, matchedPatterns);
            analysisC = analysis;
            logsC = await placeBots(supabase, game, decisions, analysis, "C", settings, botCState);
          }

          const primaryAnalysis = analysisA ?? analysisB ?? analysisC;

          await supabase
            .from("games")
            .update({
              analyzed: true,
              lock_type: primaryAnalysis?.lockType ?? "no_lock",
              gematria_confidence: primaryAnalysis?.confidence ?? 0,
            })
            .eq("id", game.id);

          analyzed++;
          controller.enqueue(
            sse({
              game: i + 1,
              total,
              status: "complete",
              teams: `${game.away_team} at ${game.home_team}`,
              lockType: primaryAnalysis?.lockType,
              confidence: primaryAnalysis?.confidence,
              botB: runB ? { lockType: analysisB?.lockType, confidence: analysisB?.confidence } : null,
              botC: runC ? { lockType: analysisC?.lockType, confidence: analysisC?.confidence } : null,
              decisionLogs: {
                A: runA ? logsA : null,
                B: runB ? logsB : null,
                C: runC ? logsC : null,
              },
            })
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${game.away_team} @ ${game.home_team}: ${msg}`);

          controller.enqueue(
            sse({
              game: i + 1,
              total,
              status: "error",
              teams: `${game.away_team} at ${game.home_team}`,
              error: msg,
            })
          );
        }
      }

      const totalBets = botAState.betsPlaced + botBState.betsPlaced + botCState.betsPlaced;
      // Only include balances from bots that actually ran — disabled bots retain the
      // full starting balance and would otherwise corrupt the Math.min result.
      const activeBalances = [
        runA ? botAState.balance : null,
        runB ? botBState.balance : null,
        runC ? botCState.balance : null,
      ].filter((b): b is number => b !== null);
      const lowestBalance = activeBalances.length > 0 ? Math.min(...activeBalances) : balance;

      await supabase.from("bankroll_ledger").upsert(
        {
          date: today,
          balance: lowestBalance,
          daily_pl: 0,
          wins: 0,
          losses: 0,
          bets_placed: totalBets,
        },
        { onConflict: "date" }
      );

      controller.enqueue(
        sse({
          done: true,
          analyzed,
          betsPlaced: totalBets,
          botA: { bets: botAState.betsPlaced, enabled: runA },
          botB: { bets: botBState.betsPlaced, enabled: runB },
          botC: { bets: botCState.betsPlaced, enabled: runC },
          errors,
          settingsSnapshot: {
            model: settings.model,
            min_confidence: settings.min_confidence,
            auto_bet_triple_locks: settings.auto_bet_triple_locks,
            auto_bet_double_locks: settings.auto_bet_double_locks,
            auto_bet_single_locks: settings.auto_bet_single_locks,
          },
        })
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
