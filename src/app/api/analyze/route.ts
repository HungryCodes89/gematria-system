import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { getTodayET } from "@/lib/date-utils";
import { analyzeGameWithClaude } from "@/lib/claude-agent";
import { getH2HContext } from "@/lib/h2h-engine";
import { canPlaceBet, calculateStake } from "@/lib/paper-trading";
import { calculateDateNumerology, getAllDateValues } from "@/lib/gematria";
import type {
  Game,
  GematriaSettings,
  TradeDecision,
  LockType,
  BotDecision,
  ReconciledDecision,
} from "@/lib/types";
import type { GameAnalysisResult, MatchedPattern, ProvenPattern, SacrificePattern } from "@/lib/claude-agent";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const AUTO_BET_MAP: Record<LockType, keyof GematriaSettings | null> = {
  triple_lock:    "auto_bet_triple_locks",
  double_lock:    "auto_bet_double_locks",
  single_lock:    "auto_bet_single_locks",
  sacrifice_lock: "auto_bet_triple_locks",
  no_lock:        null,
};

function confidenceToLockType(confidence: number): LockType {
  if (confidence >= 75) return "triple_lock";
  if (confidence >= 60) return "double_lock";
  if (confidence >= 55) return "single_lock";
  return "no_lock";
}

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

// ── Bot Reconciliation Helpers ─────────────────────────────────────────────

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item);
    (acc[k] = acc[k] ?? []).push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

function lockTierToUnits(lockType: string): number {
  if (lockType === "triple_lock" || lockType === "sacrifice_lock") return 3;
  if (lockType === "double_lock") return 2;
  if (lockType === "single_lock") return 1;
  return 0;
}

function logSkip(gameId: string, reason: string, decisions: BotDecision[]): void {
  const bots = decisions.map(d => `Bot${d.bot}→${d.picked_side ?? "null"}`).join(", ");
  console.log(`[reconcile] SKIP game=${gameId} reason=${reason} decisions=[${bots}]`);
}

function reconcileBotDecisions(decisions: BotDecision[], game: Game): ReconciledDecision | null {
  const bySide = groupBy(decisions, d => d.picked_side ?? "null");
  const sides = Object.keys(bySide);
  if (sides.length > 1) {
    logSkip(game.id, "bot_disagreement", decisions);
    return null;
  }
  const winningSide = sides[0]!;
  const botPicks = bySide[winningSide]!;
  const topBot = botPicks.reduce((a, b) => a.units > b.units ? a : b);
  return {
    ...topBot,
    convergence_count: botPicks.length,
    convergent_bots: botPicks.map(b => b.bot),
    sizing_note: null,
  };
}

function sizeWithPriceModifier(decision: ReconciledDecision): ReconciledDecision {
  const baseUnits = lockTierToUnits(decision.lock_type);
  let priceModifier = 1.0;
  if (decision.bet_type === "moneyline") {
    if (decision.odds >= 300)        priceModifier = 0.25;
    else if (decision.odds >= 200)   priceModifier = 0.5;
    else if (decision.odds >= 150)   priceModifier = 0.75;
  }
  return {
    ...decision,
    units: baseUnits * priceModifier,
    sizing_note: priceModifier < 1.0
      ? `base ${baseUnits}u × ${priceModifier} (price modifier @ ${decision.odds}) = ${baseUnits * priceModifier}u`
      : null,
  };
}

// ── Gather (gate-check without placing) ───────────────────────────────────

interface GatheredResult {
  logs: DecisionLog[];
  betDecisions: BotDecision[];
}

async function gatherEligibleBets(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  game: Game,
  decisions: TradeDecision[],
  analysis: GameAnalysisResult,
  bot: "A" | "B" | "C" | "D",
  settings: GematriaSettings,
  state: { balance: number; dailyUnits: number; betsPlaced: number; gameIds: Set<string> }
): Promise<GatheredResult> {
  const logs: DecisionLog[] = [];
  const betDecisions: BotDecision[] = [];

  const saveAnalysisRecord = (decision: TradeDecision, lockType: string) =>
    supabase.from("paper_trades").upsert({
      game_id: game.id,
      bot,
      bet_type: "analysis",
      pick: decision.pick || "Pass",
      picked_side: decision.pickedSide ?? null,
      odds: null,
      implied_probability: null,
      model_probability: null,
      ev: null,
      units: 0,
      stake: 0,
      potential_profit: 0,
      result: "pass",
      profit_loss: 0,
      confidence: decision.confidence,
      lock_type: lockType,
      reasoning: decision.reasoning,
      placed_at: new Date().toISOString(),
    }, { onConflict: "game_id,bet_type,bot" });

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
      const reason = "Claude returned action=skip";
      console.log(`[gather] Bot ${bot} [${idx}] SKIP — ${reason} | lean=${decision.pick} conf=${decision.confidence}`);
      await saveAnalysisRecord(decision, analysis.lockType);
      logs.push({ ...base, placed: false, skipReason: reason });
      continue;
    }

    const effectiveLockType: LockType =
      analysis.lockType === "sacrifice_lock"
        ? "sacrifice_lock"
        : bot === "A"
          ? analysis.lockType as LockType
          : confidenceToLockType(decision.confidence);

    console.log(`[gather] Bot ${bot} [${idx}] action=bet pick="${decision.pick}" conf=${decision.confidence}% effectiveLock=${effectiveLockType}`);

    const autoBetKey = AUTO_BET_MAP[effectiveLockType];
    if (!autoBetKey) {
      const reason = `${bot === "A" ? "Engine" : "Claude"}: ${effectiveLockType} — no auto-bet for no_lock`;
      console.log(`[gather] Bot ${bot} [${idx}] SKIP — ${reason}`);
      await saveAnalysisRecord(decision, effectiveLockType);
      logs.push({ ...base, placed: false, skipReason: reason });
      continue;
    }
    if (!settings[autoBetKey]) {
      const reason = `Auto-bet disabled for ${effectiveLockType} (settings.${autoBetKey}=false)`;
      console.log(`[gather] Bot ${bot} [${idx}] SKIP — ${reason}`);
      await saveAnalysisRecord(decision, effectiveLockType);
      logs.push({ ...base, placed: false, skipReason: reason });
      continue;
    }
    if (decision.confidence < settings.min_confidence) {
      const reason = `Claude confidence ${decision.confidence}% < min_confidence ${settings.min_confidence}%`;
      console.log(`[gather] Bot ${bot} [${idx}] SKIP — ${reason}`);
      await saveAnalysisRecord(decision, effectiveLockType);
      logs.push({ ...base, placed: false, skipReason: reason });
      continue;
    }
    if (!canPlaceBet(state.balance, state.dailyUnits, decision.units, settings)) {
      const stake = calculateStake(decision.units, settings.unit_size);
      const reason = `Limit hit: balance=$${state.balance} stake=$${stake} dailyUnits=${state.dailyUnits}/${settings.max_daily_units}`;
      console.log(`[gather] Bot ${bot} [${idx}] SKIP — ${reason}`);
      await saveAnalysisRecord(decision, effectiveLockType);
      logs.push({ ...base, placed: false, skipReason: reason });
      continue;
    }

    // Passed all gates — defer to reconciliation step
    betDecisions.push({
      bot,
      lock_type: effectiveLockType,
      bet_type: decision.betType,
      pick: decision.pick,
      picked_side: decision.pickedSide ?? null,
      odds: decision.odds,
      implied_probability: decision.impliedProbability,
      model_probability: decision.modelProbability,
      ev: decision.ev,
      units: decision.units,
      confidence: decision.confidence,
      reasoning: decision.reasoning,
    });
    logs.push({ ...base, placed: false, skipReason: "pending_reconciliation" });
  }

  return { logs, betDecisions };
}

// ── Save analysis records for reconciliation-rejected eligibles ────────────

async function saveAnalysisRecordsForRejected(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  game: Game,
  decisions: BotDecision[]
): Promise<void> {
  for (const d of decisions) {
    await supabase.from("paper_trades").upsert({
      game_id: game.id,
      bot: d.bot,
      bet_type: "analysis",
      pick: d.pick,
      picked_side: d.picked_side,
      odds: null,
      implied_probability: null,
      model_probability: null,
      ev: null,
      units: 0,
      stake: 0,
      potential_profit: 0,
      result: "pass",
      profit_loss: 0,
      confidence: d.confidence,
      lock_type: d.lock_type,
      reasoning: d.reasoning,
      placed_at: new Date().toISOString(),
    }, { onConflict: "game_id,bet_type,bot" });
  }
}

// ── Place the single reconciled bet ───────────────────────────────────────

type BotStates = Record<"A" | "B" | "C" | "D", { balance: number; dailyUnits: number; betsPlaced: number; gameIds: Set<string> }>;

async function placeReconciledBet(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  game: Game,
  decision: ReconciledDecision,
  settings: GematriaSettings,
  botStates: BotStates
): Promise<boolean> {
  const state = botStates[decision.bot];
  const stake = calculateStake(decision.units, settings.unit_size);
  const potentialProfit =
    decision.odds > 0
      ? stake * (decision.odds / 100)
      : stake * (100 / Math.abs(decision.odds));

  const convergenceNote =
    decision.convergence_count > 1
      ? `\n\n[BOT CONSENSUS: ${decision.convergence_count} bots (${decision.convergent_bots.join(",")})${decision.sizing_note ? ` | SIZING: ${decision.sizing_note}` : ""}]`
      : decision.sizing_note
        ? `\n\n[SIZING: ${decision.sizing_note}]`
        : "";

  const { error: insertErr } = await supabase
    .from("paper_trades")
    .insert({
      game_id: game.id,
      bot: decision.bot,
      bet_type: decision.bet_type,
      pick: decision.pick,
      picked_side: decision.picked_side,
      odds: decision.odds,
      implied_probability: decision.implied_probability,
      model_probability: decision.model_probability,
      ev: decision.ev,
      units: decision.units,
      stake,
      potential_profit: potentialProfit,
      result: "pending",
      profit_loss: 0,
      confidence: decision.confidence,
      lock_type: decision.lock_type,
      reasoning: `${decision.reasoning}${convergenceNote}`,
      opening_line: extractOpeningLine(game, decision.bet_type, decision.picked_side),
      strategy_version: "v1",
      placed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (!insertErr) {
    state.balance -= stake;
    state.dailyUnits += decision.units;
    state.betsPlaced++;
    state.gameIds.add(game.id);
    console.log(`[reconcile] PLACED — ${decision.pick} ${decision.units}u @ ${decision.odds} lock=${decision.lock_type} bots=[${decision.convergent_bots.join(",")}] count=${decision.convergence_count}${decision.sizing_note ? ` sizing=${decision.sizing_note}` : ""}`);
    return true;
  } else {
    console.error(`[reconcile] DB INSERT FAILED for game ${game.id}: ${insertErr.message}`);
    console.error(`[reconcile] If error mentions 'bot_check' constraint run: ALTER TABLE paper_trades DROP CONSTRAINT paper_trades_bot_check; ALTER TABLE paper_trades ADD CONSTRAINT paper_trades_bot_check CHECK (bot IN ('A','B','C','D'));`);
    return false;
  }
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const today = getTodayET();

  let botParam: "all" | "A" | "B" | "C" | "D" = "all";
  let gameIdParam: string | null = null;
  try {
    const body = await req.json();
    if (["all", "A", "B", "C", "D"].includes(body?.bot)) botParam = body.bot;
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
  const botDSettings: GematriaSettings = {
    ...settings,
    system_prompt: settings.bot_d_system_prompt || settings.system_prompt,
    bet_rules: settings.bot_d_bet_rules || settings.bet_rules,
    model: settings.bot_d_model || settings.model,
  };

  const runA = botParam === "all" || botParam === "A";
  const runB = (botParam === "all" || botParam === "B") && Boolean(settings.bot_b_system_prompt);
  const runC = (botParam === "all" || botParam === "C") && Boolean(settings.bot_c_system_prompt);
  const runD = (botParam === "all" || botParam === "D") && Boolean(settings.bot_d_system_prompt);

  if (gameIdParam) {
    await supabase.from("games").update({ analyzed: false }).eq("id", gameIdParam);
    await supabase.from("paper_trades")
      .delete()
      .eq("game_id", gameIdParam)
      .eq("bet_type", "analysis");
  }

  const forceReanalyze = Boolean(gameIdParam);

  const gamesQuery = gameIdParam
    ? supabase.from("games").select("*").eq("id", gameIdParam)
    : supabase.from("games").select("*").eq("game_date", today);

  const { data: games } = await gamesQuery;
  const unanalyzed: Game[] = (games ?? []) as Game[];
  console.log(`[analyze] runA=${runA} runB=${runB} runC=${runC} runD=${runD} games=${unanalyzed.length} bot=${botParam}`);
  console.log(`[analyze] runD gate: botParam=${botParam} bot_d_prompt_set=${Boolean(settings.bot_d_system_prompt)} (${(settings.bot_d_system_prompt ?? "").length} chars)`);
  console.log(`[analyze] settings: min_confidence=${settings.min_confidence} triple=${settings.auto_bet_triple_locks} double=${settings.auto_bet_double_locks} single=${settings.auto_bet_single_locks}`);

  const { data: notesRow } = await supabase
    .from("decode_notes")
    .select("content")
    .eq("game_date", today)
    .single();
  const todayNotes = notesRow?.content ?? "";

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

  const { data: allWeights } = await supabase
    .from("signal_weights")
    .select("bot, signal_name, times_fired, wins, losses, win_rate, avg_clv, weight_score")
    .gte("times_fired", 5)
    .order("weight_score", { ascending: false });

  function getTopPatterns(bot: string): ProvenPattern[] {
    return ((allWeights ?? []) as any[])
      .filter((w) => w.bot === bot)
      .slice(0, 5)
      .map((w) => ({
        signal_name: w.signal_name,
        times_fired: w.times_fired,
        wins: w.wins,
        losses: w.losses,
        win_rate: w.win_rate,
        avg_clv: w.avg_clv,
        weight_score: w.weight_score,
      }));
  }

  const provenPatternsA = getTopPatterns("A");
  const provenPatternsB = getTopPatterns("B");
  const provenPatternsC = getTopPatterns("C");
  const provenPatternsD = getTopPatterns("D");

  const { data: allSacrificeData } = await supabase
    .from("sacrifice_patterns")
    .select("bot, signal_name, triple_lock_fires, sacrifice_outcomes, lock_outcomes, sacrifice_rate")
    .order("sacrifice_rate", { ascending: false });

  function getBotSacrificePatterns(bot: string): SacrificePattern[] {
    return ((allSacrificeData ?? []) as any[])
      .filter((p) => p.bot === bot)
      .map((p) => ({
        signal_name: p.signal_name,
        triple_lock_fires: p.triple_lock_fires,
        sacrifice_outcomes: p.sacrifice_outcomes,
        lock_outcomes: p.lock_outcomes,
        sacrifice_rate: p.sacrifice_rate,
      }));
  }

  const sacrificePatternsA = getBotSacrificePatterns("A");
  const sacrificePatternsB = getBotSacrificePatterns("B");
  const sacrificePatternsC = getBotSacrificePatterns("C");
  const sacrificePatternsD = getBotSacrificePatterns("D");

  const { data: ledgerRow } = await supabase
    .from("bankroll_ledger")
    .select("balance")
    .order("date", { ascending: false })
    .limit(1)
    .single();

  const balance = ledgerRow?.balance ?? settings.starting_bankroll;

  const [botARes, botBRes, botCRes, botDRes] = await Promise.all([
    supabase
      .from("paper_trades")
      .select("units, game_id")
      .eq("bot", "A")
      .gte("placed_at", `${today}T00:00:00`)
      .lt("placed_at", `${today}T23:59:59.999`),
    supabase
      .from("paper_trades")
      .select("units, game_id")
      .eq("bot", "B")
      .gte("placed_at", `${today}T00:00:00`)
      .lt("placed_at", `${today}T23:59:59.999`),
    supabase
      .from("paper_trades")
      .select("units, game_id")
      .eq("bot", "C")
      .gte("placed_at", `${today}T00:00:00`)
      .lt("placed_at", `${today}T23:59:59.999`),
    supabase
      .from("paper_trades")
      .select("units, game_id")
      .eq("bot", "D")
      .gte("placed_at", `${today}T00:00:00`)
      .lt("placed_at", `${today}T23:59:59.999`),
  ]);

  const botAState = {
    balance,
    dailyUnits: (botARes.data ?? []).reduce((s: number, t: { units: number }) => s + (t.units ?? 0), 0),
    betsPlaced: 0,
    gameIds: new Set<string>((botARes.data ?? []).map((t: { game_id: string }) => t.game_id).filter(Boolean)),
  };
  const botBState = {
    balance,
    dailyUnits: (botBRes.data ?? []).reduce((s: number, t: { units: number }) => s + (t.units ?? 0), 0),
    betsPlaced: 0,
    gameIds: new Set<string>((botBRes.data ?? []).map((t: { game_id: string }) => t.game_id).filter(Boolean)),
  };
  const botCState = {
    balance,
    dailyUnits: (botCRes.data ?? []).reduce((s: number, t: { units: number }) => s + (t.units ?? 0), 0),
    betsPlaced: 0,
    gameIds: new Set<string>((botCRes.data ?? []).map((t: { game_id: string }) => t.game_id).filter(Boolean)),
  };
  const botDState = {
    balance,
    dailyUnits: (botDRes.data ?? []).reduce((s: number, t: { units: number }) => s + (t.units ?? 0), 0),
    betsPlaced: 0,
    gameIds: new Set<string>((botDRes.data ?? []).map((t: { game_id: string }) => t.game_id).filter(Boolean)),
  };
  console.log(`[analyze] Bot A today: ${botAState.dailyUnits}u, ${botAState.gameIds.size} games`);
  console.log(`[analyze] Bot B today: ${botBState.dailyUnits}u, ${botBState.gameIds.size} games`);
  console.log(`[analyze] Bot C today: ${botCState.dailyUnits}u, ${botCState.gameIds.size} games`);
  console.log(`[analyze] Bot D today: ${botDState.dailyUnits}u, ${botDState.gameIds.size} games`);

  const botStates: BotStates = { A: botAState, B: botBState, C: botCState, D: botDState };

  const total = unanalyzed.length;
  let analyzed = 0;
  const errors: string[] = [];

  const h2hMap = new Map<string, string>();
  await Promise.all(
    unanalyzed.map(async (game) => {
      try {
        const ctx = await getH2HContext(game.home_team, game.away_team, game.league, game.game_date, supabase);
        h2hMap.set(game.id, ctx);
      } catch {
        // H2H is supplementary — never block analysis
      }
    })
  );

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

          const h2hCtx = h2hMap.get(game.id);

          // --- Bot A ---
          let analysisA: GameAnalysisResult | null = null;
          let logsA: DecisionLog[] = [];
          let betDecisionsA: BotDecision[] = [];
          const skipA = runA && !forceReanalyze && botAState.gameIds.has(game.id);
          if (runA && !skipA) {
            console.log(`[analyze] Bot A analyzing ${game.away_team} @ ${game.home_team}`);
            const { analysis, decisions } = await analyzeGameWithClaude(game, settings, "A", todayNotes, matchedPatterns, provenPatternsA.length > 0 ? provenPatternsA : undefined, sacrificePatternsA.length > 0 ? sacrificePatternsA : undefined, h2hCtx);
            analysisA = analysis;
            const gatheredA = await gatherEligibleBets(supabase, game, decisions, analysis, "A", settings, botAState);
            logsA = gatheredA.logs;
            betDecisionsA = gatheredA.betDecisions;
          } else if (skipA) {
            console.log(`[analyze] Bot A skip — already bet game ${game.id}`);
          }

          // --- Bot B ---
          let analysisB: GameAnalysisResult | null = null;
          let logsB: DecisionLog[] = [];
          let betDecisionsB: BotDecision[] = [];
          const skipB = runB && !forceReanalyze && botBState.gameIds.has(game.id);
          if (runB && !skipB) {
            console.log(`[analyze] Bot B analyzing ${game.away_team} @ ${game.home_team}`);
            const { analysis, decisions } = await analyzeGameWithClaude(game, botBSettings, "B", todayNotes, matchedPatterns, provenPatternsB.length > 0 ? provenPatternsB : undefined, sacrificePatternsB.length > 0 ? sacrificePatternsB : undefined, h2hCtx);
            analysisB = analysis;
            const gatheredB = await gatherEligibleBets(supabase, game, decisions, analysis, "B", settings, botBState);
            logsB = gatheredB.logs;
            betDecisionsB = gatheredB.betDecisions;
          } else if (skipB) {
            console.log(`[analyze] Bot B skip — already bet game ${game.id}`);
          }

          // --- Bot C (AJ Wordplay) ---
          let analysisC: GameAnalysisResult | null = null;
          let logsC: DecisionLog[] = [];
          let betDecisionsC: BotDecision[] = [];
          const skipC = runC && !forceReanalyze && botCState.gameIds.has(game.id);
          if (runC && !skipC) {
            console.log(`[analyze] Bot C analyzing ${game.away_team} @ ${game.home_team}`);
            const { analysis, decisions } = await analyzeGameWithClaude(game, botCSettings, "C", todayNotes, matchedPatterns, provenPatternsC.length > 0 ? provenPatternsC : undefined, sacrificePatternsC.length > 0 ? sacrificePatternsC : undefined, h2hCtx);
            analysisC = analysis;
            const gatheredC = await gatherEligibleBets(supabase, game, decisions, analysis, "C", settings, botCState);
            logsC = gatheredC.logs;
            betDecisionsC = gatheredC.betDecisions;
          } else if (skipC) {
            console.log(`[analyze] Bot C skip — already bet game ${game.id}`);
          }

          // --- Bot D (Narrative Scout) ---
          let analysisD: GameAnalysisResult | null = null;
          let logsD: DecisionLog[] = [];
          let betDecisionsD: BotDecision[] = [];
          const skipD = runD && !forceReanalyze && botDState.gameIds.has(game.id);
          if (runD && !skipD) {
            console.log(`[analyze] Bot D analyzing ${game.away_team} @ ${game.home_team}`);
            const { analysis, decisions } = await analyzeGameWithClaude(game, botDSettings, "D", todayNotes, matchedPatterns, provenPatternsD.length > 0 ? provenPatternsD : undefined, sacrificePatternsD.length > 0 ? sacrificePatternsD : undefined, h2hCtx);
            console.log(`[bot-D] lockType=${analysis.lockType} engineConf=${analysis.confidence}% decisions=${decisions.length}`);
            decisions.forEach((d, i) => {
              console.log(`[bot-D] decision[${i}] action=${d.action} pick="${d.pick}" conf=${d.confidence}% odds=${d.odds} units=${d.units} effectiveLock=${confidenceToLockType(d.confidence)}`);
            });
            analysisD = analysis;
            const gatheredD = await gatherEligibleBets(supabase, game, decisions, analysis, "D", settings, botDState);
            logsD = gatheredD.logs;
            betDecisionsD = gatheredD.betDecisions;
          } else if (skipD) {
            console.log(`[analyze] Bot D skip — already bet game ${game.id}`);
          } else if (!runD) {
            console.log(`[analyze] Bot D disabled — botParam=${botParam} bot_d_prompt_set=${Boolean(settings.bot_d_system_prompt)}`);
          }

          // --- Reconcile & Place ---
          const allBetDecisions = [...betDecisionsA, ...betDecisionsB, ...betDecisionsC, ...betDecisionsD];
          if (allBetDecisions.length > 0) {
            const reconciled = reconcileBotDecisions(allBetDecisions, game);
            if (reconciled === null) {
              // Bots disagree — save analysis records so all bots are deduped on re-run
              await saveAnalysisRecordsForRejected(supabase, game, allBetDecisions);
            } else {
              const sized = sizeWithPriceModifier(reconciled);
              const placed = await placeReconciledBet(supabase, game, sized, settings, botStates);
              if (placed) {
                // Save analysis records for non-winning bots so they dedup on re-run
                const nonWinners = allBetDecisions.filter(d => d.bot !== sized.bot);
                if (nonWinners.length > 0) {
                  await saveAnalysisRecordsForRejected(supabase, game, nonWinners);
                }
              } else {
                // Placement failed — save analysis records for all
                await saveAnalysisRecordsForRejected(supabase, game, allBetDecisions);
              }
            }
          }

          const primaryAnalysis = analysisA ?? analysisB ?? analysisC ?? analysisD;
          const anyBotRan = analysisA || analysisB || analysisC || analysisD;

          if (anyBotRan) {
            await supabase
              .from("games")
              .update({
                analyzed: true,
                lock_type: primaryAnalysis?.lockType ?? "no_lock",
                gematria_confidence: primaryAnalysis?.confidence ?? 0,
              })
              .eq("id", game.id);
          }

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
              botD: runD ? { lockType: analysisD?.lockType, confidence: analysisD?.confidence } : null,
              decisionLogs: {
                A: runA ? logsA : null,
                B: runB ? logsB : null,
                C: runC ? logsC : null,
                D: runD ? logsD : null,
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

      const totalBets = botAState.betsPlaced + botBState.betsPlaced + botCState.betsPlaced + botDState.betsPlaced;
      const activeBalances = [
        runA ? botAState.balance : null,
        runB ? botBState.balance : null,
        runC ? botCState.balance : null,
        runD ? botDState.balance : null,
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
          botD: { bets: botDState.betsPlaced, enabled: runD },
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
