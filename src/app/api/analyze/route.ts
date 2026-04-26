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

// No legacy "picks" table exists in this codebase — all trades go through paper_trades only.

const AUTO_BET_MAP: Record<LockType, keyof GematriaSettings | null> = {
  triple_lock:    "auto_bet_triple_locks",
  double_lock:    "auto_bet_double_locks",
  single_lock:    "auto_bet_single_locks",
  lean:           null,  // lean decisions bypass AUTO_BET_MAP — routed to lean_tracked
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

// ── Reconciliation Helpers ─────────────────────────────────────────────────

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item);
    (acc[k] = acc[k] ?? []).push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

function roundToNearest025(n: number): number {
  return Math.round(n * 4) / 4;
}

function formatUnits(n: number): string {
  return String(parseFloat(n.toFixed(4)));
}

// Returns null + logs disagreement; caller writes to skipped_picks.
function reconcileBotDecisions(decisions: BotDecision[], game: Game): ReconciledDecision | null {
  const bySide = groupBy(decisions, d => d.picked_side ?? "null");
  const sides = Object.keys(bySide);

  if (sides.length > 1) {
    const bots = decisions.map(d => `Bot${d.bot}→${d.picked_side ?? "null"}`).join(", ");
    console.log(`[reconcile] DISAGREE game=${game.id} sides=[${sides.join(",")}] decisions=[${bots}]`);
    return null;
  }

  const winningSide = sides[0]!;
  const botPicks = bySide[winningSide]!;

  // Use lowest-units bot — convergence adds no edge (60.0% vs 60.9% single-bot), so no bonus stake.
  const lowestBot = botPicks.reduce((a, b) => a.units < b.units ? a : b);
  const baseUnits = lowestBot.units;

  const botBreakdown = botPicks.length > 1
    ? `lowest of ${botPicks.map(b => `${b.bot}:${formatUnits(b.units)}`).join(", ")}`
    : null;
  const baseSizingNote = botBreakdown
    ? `base ${formatUnits(baseUnits)}u from bot ${lowestBot.bot} (${botBreakdown})`
    : `base ${formatUnits(baseUnits)}u from bot ${lowestBot.bot}`;

  return {
    ...lowestBot,
    units: baseUnits,
    convergence_count: botPicks.length,
    convergent_bots: botPicks.map(b => b.bot),
    sizing_note: baseSizingNote,
  };
}

function sizeWithPriceModifier(decision: ReconciledDecision): ReconciledDecision {
  const baseUnits = decision.units;
  const oddsStr = decision.odds > 0 ? `+${decision.odds}` : `${decision.odds}`;

  let priceModifier = 1.0;
  if (decision.bet_type === "moneyline") {
    if (decision.odds >= 300)        priceModifier = 0.25;
    else if (decision.odds >= 200)   priceModifier = 0.5;
    else if (decision.odds >= 150)   priceModifier = 0.75;
  }

  const finalUnits = roundToNearest025(baseUnits * priceModifier);

  const sizingNote = priceModifier < 1.0
    ? `${decision.sizing_note} → price modifier ${priceModifier} @ ${oddsStr} → final ${formatUnits(finalUnits)}u`
    : `${decision.sizing_note} → final ${formatUnits(finalUnits)}u`;

  return { ...decision, units: finalUnits, sizing_note: sizingNote };
}

// ── Gather (gate-check, no DB writes for eligible bets) ───────────────────

interface GatheredResult {
  logs: DecisionLog[];
  betDecisions: BotDecision[];
  leanDecisions: BotDecision[];
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
  const leanDecisions: BotDecision[] = [];

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
      was_reconciled: false,
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

    if (decision.action === "lean") {
      // Lean tier — real directional signal but below bet threshold. Tracked only, no position.
      console.log(`[gather] Bot ${bot} [${idx}] LEAN — pick="${decision.pick}" conf=${decision.confidence}%`);
      leanDecisions.push({
        action: "lean",
        bot,
        lock_type: "lean",
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
      logs.push({ ...base, placed: false, skipReason: "lean_tracked" });
      continue;
    }

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

    // Passed all gates — defer to reconciliation
    betDecisions.push({
      action: "bet",
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

  return { logs, betDecisions, leanDecisions };
}

// ── Write disagreement to skipped_picks ──────────────────────────────────

async function writeSkippedPick(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  gameId: string,
  reason: string,
  decisions: BotDecision[]
): Promise<void> {
  const { error } = await supabase.from("skipped_picks").insert({
    game_id: gameId,
    reason,
    bot_decisions: decisions as unknown as object,
    created_at: new Date().toISOString(),
  });
  if (error) {
    console.error(`[reconcile] skipped_picks write failed: ${error.message}`);
  }
}

// ── Place the single reconciled trade ────────────────────────────────────

type BotStates = Record<"A" | "B" | "C" | "D", {
  balance: number; dailyUnits: number; betsPlaced: number; gameIds: Set<string>;
}>;

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
      reasoning: decision.reasoning,
      opening_line: extractOpeningLine(game, decision.bet_type, decision.picked_side),
      strategy_version: "v1",
      // Reconciliation columns (migration 010)
      convergence_count: decision.convergence_count,
      convergent_bots: decision.convergent_bots,
      sizing_note: decision.sizing_note,
      was_reconciled: true,
      placed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (!insertErr) {
    state.balance -= stake;
    state.dailyUnits += decision.units;
    state.betsPlaced++;
    state.gameIds.add(game.id);
    console.log(
      `[reconcile] PLACED — ${decision.pick} ${decision.units}u @ ${decision.odds > 0 ? "+" : ""}${decision.odds}` +
      ` lock=${decision.lock_type} bots=[${decision.convergent_bots.join(",")}]` +
      ` sizing="${decision.sizing_note}"`
    );
    return true;
  } else {
    console.error(`[reconcile] DB INSERT FAILED for game ${game.id}: ${insertErr.message}`);
    if (insertErr.message.includes("bot_check")) {
      console.error(`[reconcile] Run: ALTER TABLE paper_trades DROP CONSTRAINT paper_trades_bot_check; ALTER TABLE paper_trades ADD CONSTRAINT paper_trades_bot_check CHECK (bot IN ('A','B','C','D'));`);
    }
    return false;
  }
}

// ── Write lean_tracked row (no position, result tracking only) ────────────

async function writeLeanTracked(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  game: Game,
  decision: ReconciledDecision,
): Promise<void> {
  const { error } = await supabase.from("paper_trades").insert({
    game_id: game.id,
    bot: decision.bot,
    bet_type: "lean_tracked",
    pick: decision.pick,
    picked_side: decision.picked_side,
    odds: decision.odds,
    implied_probability: decision.implied_probability,
    model_probability: decision.model_probability,
    ev: decision.ev,
    units: 0,
    stake: 0,
    potential_profit: 0,
    result: null,
    profit_loss: 0,
    confidence: decision.confidence,
    lock_type: "lean",
    reasoning: decision.reasoning,
    opening_line: extractOpeningLine(game, decision.bet_type, decision.picked_side),
    strategy_version: "v1",
    convergence_count: decision.convergence_count,
    convergent_bots: decision.convergent_bots,
    sizing_note: decision.sizing_note,
    was_reconciled: true,
    placed_at: new Date().toISOString(),
  });
  if (error) {
    console.error(`[lean] DB INSERT FAILED for game ${game.id}: ${error.message}`);
  } else {
    console.log(
      `[lean] TRACKED — ${decision.pick} @ ${decision.odds > 0 ? "+" : ""}${decision.odds}` +
      ` conf=${decision.confidence}% bots=[${decision.convergent_bots.join(",")}]`
    );
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
    await Promise.all([
      supabase.from("games").update({ analyzed: false }).eq("id", gameIdParam),
      supabase.from("paper_trades").delete().eq("game_id", gameIdParam).eq("bet_type", "analysis"),
      supabase.from("skipped_picks").delete().eq("game_id", gameIdParam),
    ]);
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

  // Fetch today's bot trades + today's skipped picks for cross-session dedup.
  // A game in skipped_picks was already reconciled (disagreement) — don't re-run it.
  const [botARes, botBRes, botCRes, botDRes, skippedRes] = await Promise.all([
    supabase.from("paper_trades").select("units, game_id").eq("bot", "A")
      .gte("placed_at", `${today}T00:00:00`).lt("placed_at", `${today}T23:59:59.999`),
    supabase.from("paper_trades").select("units, game_id").eq("bot", "B")
      .gte("placed_at", `${today}T00:00:00`).lt("placed_at", `${today}T23:59:59.999`),
    supabase.from("paper_trades").select("units, game_id").eq("bot", "C")
      .gte("placed_at", `${today}T00:00:00`).lt("placed_at", `${today}T23:59:59.999`),
    supabase.from("paper_trades").select("units, game_id").eq("bot", "D")
      .gte("placed_at", `${today}T00:00:00`).lt("placed_at", `${today}T23:59:59.999`),
    supabase.from("skipped_picks").select("game_id")
      .gte("created_at", `${today}T00:00:00`).lt("created_at", `${today}T23:59:59.999`),
  ]);

  const skippedGameIds = new Set<string>(
    (skippedRes.data ?? []).map((s: { game_id: string }) => s.game_id).filter(Boolean)
  );

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
  console.log(`[analyze] Skipped games today (cross-session dedup): ${skippedGameIds.size}`);

  const botStates: BotStates = { A: botAState, B: botBState, C: botCState, D: botDState };

  // Helper — already-seen check that includes the skipped_picks dedup
  const alreadyProcessed = (gameId: string, botGameIds: Set<string>) =>
    botGameIds.has(gameId) || skippedGameIds.has(gameId);

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
          controller.enqueue(sse({ game: i + 1, total, status: "analyzing", teams: `${game.away_team} at ${game.home_team}` }));

          const h2hCtx = h2hMap.get(game.id);

          // --- Bot A ---
          let analysisA: GameAnalysisResult | null = null;
          let logsA: DecisionLog[] = [];
          let betDecisionsA: BotDecision[] = [];
          let leanDecisionsA: BotDecision[] = [];
          const skipA = runA && !forceReanalyze && alreadyProcessed(game.id, botAState.gameIds);
          if (runA && !skipA) {
            console.log(`[analyze] Bot A analyzing ${game.away_team} @ ${game.home_team}`);
            const { analysis, decisions } = await analyzeGameWithClaude(game, settings, "A", todayNotes, matchedPatterns, provenPatternsA.length > 0 ? provenPatternsA : undefined, sacrificePatternsA.length > 0 ? sacrificePatternsA : undefined, h2hCtx);
            analysisA = analysis;
            const g = await gatherEligibleBets(supabase, game, decisions, analysis, "A", settings, botAState);
            logsA = g.logs; betDecisionsA = g.betDecisions; leanDecisionsA = g.leanDecisions;
          } else if (skipA) {
            console.log(`[analyze] Bot A skip — already processed game ${game.id}`);
          }

          // --- Bot B ---
          let analysisB: GameAnalysisResult | null = null;
          let logsB: DecisionLog[] = [];
          let betDecisionsB: BotDecision[] = [];
          let leanDecisionsB: BotDecision[] = [];
          const skipB = runB && !forceReanalyze && alreadyProcessed(game.id, botBState.gameIds);
          if (runB && !skipB) {
            console.log(`[analyze] Bot B analyzing ${game.away_team} @ ${game.home_team}`);
            const { analysis, decisions } = await analyzeGameWithClaude(game, botBSettings, "B", todayNotes, matchedPatterns, provenPatternsB.length > 0 ? provenPatternsB : undefined, sacrificePatternsB.length > 0 ? sacrificePatternsB : undefined, h2hCtx);
            analysisB = analysis;
            const g = await gatherEligibleBets(supabase, game, decisions, analysis, "B", settings, botBState);
            logsB = g.logs; betDecisionsB = g.betDecisions; leanDecisionsB = g.leanDecisions;
          } else if (skipB) {
            console.log(`[analyze] Bot B skip — already processed game ${game.id}`);
          }

          // --- Bot C (AJ Wordplay) ---
          let analysisC: GameAnalysisResult | null = null;
          let logsC: DecisionLog[] = [];
          let betDecisionsC: BotDecision[] = [];
          let leanDecisionsC: BotDecision[] = [];
          const skipC = runC && !forceReanalyze && alreadyProcessed(game.id, botCState.gameIds);
          if (runC && !skipC) {
            console.log(`[analyze] Bot C analyzing ${game.away_team} @ ${game.home_team}`);
            const { analysis, decisions } = await analyzeGameWithClaude(game, botCSettings, "C", todayNotes, matchedPatterns, provenPatternsC.length > 0 ? provenPatternsC : undefined, sacrificePatternsC.length > 0 ? sacrificePatternsC : undefined, h2hCtx);
            analysisC = analysis;
            const g = await gatherEligibleBets(supabase, game, decisions, analysis, "C", settings, botCState);
            logsC = g.logs; betDecisionsC = g.betDecisions; leanDecisionsC = g.leanDecisions;
          } else if (skipC) {
            console.log(`[analyze] Bot C skip — already processed game ${game.id}`);
          }

          // --- Bot D (Narrative Scout) ---
          let analysisD: GameAnalysisResult | null = null;
          let logsD: DecisionLog[] = [];
          let betDecisionsD: BotDecision[] = [];
          let leanDecisionsD: BotDecision[] = [];
          const skipD = runD && !forceReanalyze && alreadyProcessed(game.id, botDState.gameIds);
          if (runD && !skipD) {
            console.log(`[analyze] Bot D analyzing ${game.away_team} @ ${game.home_team}`);
            const { analysis, decisions } = await analyzeGameWithClaude(game, botDSettings, "D", todayNotes, matchedPatterns, provenPatternsD.length > 0 ? provenPatternsD : undefined, sacrificePatternsD.length > 0 ? sacrificePatternsD : undefined, h2hCtx);
            console.log(`[bot-D] lockType=${analysis.lockType} engineConf=${analysis.confidence}% decisions=${decisions.length}`);
            decisions.forEach((dv, ii) => {
              console.log(`[bot-D] decision[${ii}] action=${dv.action} pick="${dv.pick}" conf=${dv.confidence}% odds=${dv.odds} units=${dv.units} effectiveLock=${confidenceToLockType(dv.confidence)}`);
            });
            analysisD = analysis;
            const g = await gatherEligibleBets(supabase, game, decisions, analysis, "D", settings, botDState);
            logsD = g.logs; betDecisionsD = g.betDecisions; leanDecisionsD = g.leanDecisions;
          } else if (skipD) {
            console.log(`[analyze] Bot D skip — already processed game ${game.id}`);
          } else if (!runD) {
            console.log(`[analyze] Bot D disabled — botParam=${botParam} bot_d_prompt_set=${Boolean(settings.bot_d_system_prompt)}`);
          }

          // ── Reconcile & Place ──────────────────────────────────────────
          const allBetDecisions = [
            ...betDecisionsA, ...betDecisionsB, ...betDecisionsC, ...betDecisionsD,
          ];
          const allLeanDecisions = [
            ...leanDecisionsA, ...leanDecisionsB, ...leanDecisionsC, ...leanDecisionsD,
          ];
          let reconcileOutcome: "no_eligible_bets" | "skipped" | "placed" | "lean_tracked" = "no_eligible_bets";

          if (allBetDecisions.length > 0) {
            // Bet decisions take full precedence — leans on same game are ignored
            const reconciled = reconcileBotDecisions(allBetDecisions, game);
            if (reconciled === null) {
              await writeSkippedPick(supabase, game.id, "bot_disagreement", allBetDecisions);
              skippedGameIds.add(game.id);
              reconcileOutcome = "skipped";
            } else {
              const sized = sizeWithPriceModifier(reconciled);
              await placeReconciledBet(supabase, game, sized, settings, botStates);
              reconcileOutcome = "placed";
            }
          } else if (allLeanDecisions.length > 0) {
            // No bets — try lean reconciliation
            const reconciledLean = reconcileBotDecisions(allLeanDecisions, game);
            if (reconciledLean === null) {
              await writeSkippedPick(supabase, game.id, "lean_disagreement", allLeanDecisions);
              skippedGameIds.add(game.id);
              reconcileOutcome = "skipped";
            } else {
              // sizing_note already built by reconcileBotDecisions; override units to 0
              const leanDecision: ReconciledDecision = { ...reconciledLean, units: 0 };
              await writeLeanTracked(supabase, game, leanDecision);
              reconcileOutcome = "lean_tracked";
            }
          }
          // ──────────────────────────────────────────────────────────────

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
          controller.enqueue(sse({
            game: i + 1,
            total,
            status: "complete",
            teams: `${game.away_team} at ${game.home_team}`,
            lockType: primaryAnalysis?.lockType,
            confidence: primaryAnalysis?.confidence,
            reconciled: reconcileOutcome,
            botB: runB ? { lockType: analysisB?.lockType, confidence: analysisB?.confidence } : null,
            botC: runC ? { lockType: analysisC?.lockType, confidence: analysisC?.confidence } : null,
            botD: runD ? { lockType: analysisD?.lockType, confidence: analysisD?.confidence } : null,
            decisionLogs: {
              A: runA ? logsA : null,
              B: runB ? logsB : null,
              C: runC ? logsC : null,
              D: runD ? logsD : null,
            },
          }));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${game.away_team} @ ${game.home_team}: ${msg}`);
          controller.enqueue(sse({ game: i + 1, total, status: "error", teams: `${game.away_team} at ${game.home_team}`, error: msg }));
        }
      }

      const totalBets =
        botAState.betsPlaced + botBState.betsPlaced + botCState.betsPlaced + botDState.betsPlaced;
      const activeBalances = [
        runA ? botAState.balance : null,
        runB ? botBState.balance : null,
        runC ? botCState.balance : null,
        runD ? botDState.balance : null,
      ].filter((b): b is number => b !== null);
      const lowestBalance = activeBalances.length > 0 ? Math.min(...activeBalances) : balance;

      await supabase.from("bankroll_ledger").upsert(
        { date: today, balance: lowestBalance, daily_pl: 0, wins: 0, losses: 0, bets_placed: totalBets },
        { onConflict: "date" }
      );

      controller.enqueue(sse({
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
      }));
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
