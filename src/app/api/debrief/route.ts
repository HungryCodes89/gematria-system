import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { extractSignals } from "@/lib/signal-extractor";
import { calculateDateNumerology } from "@/lib/gematria";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ── Types ────────────────────────────────────────────────────────────────────

export interface GameEntry {
  bot: "A" | "B" | "C" | "D";
  betType: string;
  pick: string;
  pickedSide: "home" | "away" | null;
  odds: number | null;
  confidence: number | null;
  lockType: string | null;
  result: "win" | "loss" | "push" | "pass" | "lean_hit" | "lean_miss" | "pending";
  profitLoss: number;
  reasoning: string | null;
}

export interface GameBreakdown {
  gameId: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  engineLockType: string | null;
  entries: GameEntry[];
}

export interface DebriefStats {
  wins: number;
  losses: number;
  pushes: number;
  leanHits: number;
  leanMisses: number;
  netPL: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function yesterdayET(): string {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  et.setDate(et.getDate() - 1);
  const y = et.getFullYear();
  const m = String(et.getMonth() + 1).padStart(2, "0");
  const d = String(et.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function leanOutcome(
  pickedSide: "home" | "away" | null,
  homeScore: number | null,
  awayScore: number | null,
): "lean_hit" | "lean_miss" | "pass" {
  if (!pickedSide || homeScore == null || awayScore == null) return "pass";
  if (homeScore === awayScore) return "pass";
  const homeWon = homeScore > awayScore;
  return (pickedSide === "home") === homeWon ? "lean_hit" : "lean_miss";
}

// ── Compute game breakdown ────────────────────────────────────────────────────

async function computeBreakdown(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  date: string,
): Promise<GameBreakdown[]> {
  const [{ data: trades }, { data: games }] = await Promise.all([
    supabase
      .from("paper_trades")
      .select("id,bot,bet_type,pick,picked_side,odds,confidence,lock_type,result,profit_loss,reasoning,clv_percent,game_id")
      .gte("placed_at", `${date}T00:00:00`)
      .lt("placed_at", `${date}T23:59:59.999`),
    supabase
      .from("games")
      .select("id,league,home_team,away_team,home_score,away_score,lock_type,gematria_confidence")
      .eq("game_date", date)
      .order("start_time", { ascending: true }),
  ]);

  if (!trades || !games) return [];

  type RawGame = { id: string; league: string; home_team: string; away_team: string; home_score: number | null; away_score: number | null; lock_type: string | null; gematria_confidence: number | null };
  type RawTrade = { id: string; bot: "A"|"B"|"C"|"D"; bet_type: string; pick: string; picked_side: "home"|"away"|null; odds: number|null; confidence: number|null; lock_type: string|null; result: string; profit_loss: number; reasoning: string|null; clv_percent: number|null; game_id: string };

  const gameMap = new Map<string, RawGame>((games as RawGame[]).map(g => [g.id, g]));
  const byGame = new Map<string, RawTrade[]>();
  for (const t of trades as RawTrade[]) {
    const list = byGame.get(t.game_id) ?? [];
    list.push(t);
    byGame.set(t.game_id, list);
  }

  const result: GameBreakdown[] = [];
  for (const game of games as RawGame[]) {
    const gameTrades = byGame.get(game.id) ?? [];
    if (!gameTrades.length) continue;

    const entries: GameEntry[] = gameTrades.map(t => {
      let res: GameEntry["result"] = t.result as GameEntry["result"];
      if (t.bet_type === "analysis" || t.result === "pass") {
        res = leanOutcome(t.picked_side, game.home_score, game.away_score);
      }
      return {
        bot: t.bot,
        betType: t.bet_type,
        pick: t.pick,
        pickedSide: t.picked_side,
        odds: t.odds,
        confidence: t.confidence,
        lockType: t.lock_type,
        result: res,
        profitLoss: t.profit_loss,
        reasoning: t.reasoning,
      };
    });

    result.push({
      gameId: game.id,
      league: game.league,
      homeTeam: game.home_team,
      awayTeam: game.away_team,
      homeScore: game.home_score,
      awayScore: game.away_score,
      engineLockType: game.lock_type,
      entries,
    });
  }

  return result;
}

function computeStats(breakdown: GameBreakdown[]): DebriefStats {
  const all = breakdown.flatMap(g => g.entries);
  const real = all.filter(e => e.betType !== "analysis");
  return {
    wins:      real.filter(e => e.result === "win").length,
    losses:    real.filter(e => e.result === "loss").length,
    pushes:    real.filter(e => e.result === "push").length,
    leanHits:  all.filter(e => e.result === "lean_hit").length,
    leanMisses:all.filter(e => e.result === "lean_miss").length,
    netPL:     real.reduce((s, e) => s + (e.profitLoss ?? 0), 0),
  };
}

// ── Self-heal: update signal weights ─────────────────────────────────────────

async function runSelfHeal(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  date: string,
): Promise<number> {
  const { data: trades } = await supabase
    .from("paper_trades")
    .select("bot,lock_type,bet_type,picked_side,pick,odds,confidence,reasoning,result,clv_percent")
    .gte("placed_at", `${date}T00:00:00`)
    .lt("placed_at", `${date}T23:59:59.999`)
    .in("result", ["win", "loss", "push"])
    .neq("bet_type", "analysis");

  if (!trades?.length) return 0;

  let updates = 0;
  for (const trade of trades as { bot: "A"|"B"|"C"|"D"; lock_type: string|null; bet_type: string; picked_side: string|null; pick: string; odds: number|null; confidence: number|null; reasoning: string|null; result: string; clv_percent: number|null }[]) {
    const signals = extractSignals({
      lock_type: trade.lock_type,
      bet_type: trade.bet_type,
      picked_side: trade.picked_side,
      pick: trade.pick,
      odds: trade.odds,
      confidence: trade.confidence,
      reasoning: trade.reasoning,
    });

    const isWin = trade.result === "win";
    const isLoss = trade.result === "loss";
    const clv = trade.clv_percent ?? 0;

    for (const signal of signals) {
      const { data: ex } = await supabase
        .from("signal_weights")
        .select("times_fired,wins,losses,avg_clv")
        .eq("bot", trade.bot)
        .eq("signal_name", signal)
        .single();

      const oldFired = ex?.times_fired ?? 0;
      const newFired  = oldFired + 1;
      const newWins   = (ex?.wins ?? 0) + (isWin ? 1 : 0);
      const newLosses = (ex?.losses ?? 0) + (isLoss ? 1 : 0);
      const newWinRate = newWins / Math.max(1, newWins + newLosses);
      const newClv = ((ex?.avg_clv ?? 0) * oldFired + clv) / newFired;
      // weight_score: skill above 50% × log-scale sample size + CLV bonus
      const weightScore = (newWinRate - 0.5) * 2 * Math.log(newFired + 1) + newClv * 0.1;

      await supabase.from("signal_weights").upsert({
        bot: trade.bot,
        signal_name: signal,
        times_fired: newFired,
        wins: newWins,
        losses: newLosses,
        win_rate: newWinRate,
        avg_clv: newClv,
        weight_score: weightScore,
        last_updated: new Date().toISOString(),
      }, { onConflict: "bot,signal_name" });

      updates++;
    }
  }

  return updates;
}

// ── Bot D narrative reflection prompt ────────────────────────────────────────

function buildBotDReflectionPrompt(breakdown: GameBreakdown[], date: string): string {
  const botDGames = breakdown.filter(g => g.entries.some(e => e.bot === "D"));

  const lines = [
    `BOT D NARRATIVE SCOUT DEBRIEF — ${date}`,
    "",
    "=== TODAY'S SLATE ===",
  ];

  for (const game of breakdown) {
    const score = game.homeScore != null && game.awayScore != null
      ? `${game.awayScore}–${game.homeScore}` : "no final score";
    lines.push(`${game.awayTeam} @ ${game.homeTeam} [${game.league}] — ${score}`);

    const dEntries = game.entries.filter(e => e.bot === "D");
    if (dEntries.length) {
      for (const e of dEntries) {
        const icon = e.result === "win" || e.result === "lean_hit" ? "✓"
          : e.result === "loss" || e.result === "lean_miss" ? "✗" : "–";
        const label = e.betType === "analysis" ? "LEAN" : "BET";
        lines.push(`  MY CALL: ${icon} ${label} ${e.pick} (conf=${e.confidence ?? "?"}%)`);
        if (e.reasoning) {
          lines.push(`  MY READ: "${e.reasoning.slice(0, 280).replace(/\n/g, " ")}"`);
        }
      }
    } else {
      lines.push("  (no pick)");
    }
  }

  if (!botDGames.length) {
    lines.push("\n(Bot D had no picks today — reflect on the full slate retrospectively)");
  }

  lines.push(`
=== YOUR TASK ===
You are Bot D — the HUNGRY System's Narrative Scout. You read sports through the lens of media narratives, scripted theater, revenge storylines, coronation games, underdog arcs, and public attention cycles.

Today is ${date}. Review the slate and your picks above. Write your personal debrief in first person.

Respond with EXACTLY these section headers (## prefix):

## NARRATIVES THAT PLAYED OUT
Which storylines were scripted correctly today. Name the team, the arc (revenge game, coronation, underdog moment, media cycle), and what made it legible in advance.

## WHERE THE SCRIPT FLIPPED
Games where the narrative pointed one way but the outcome went the other. Was there a counter-narrative you underweighted? A quiet story you missed?

## GAMES I PASSED — IN RETROSPECT
Any games you skipped that had a clear narrative angle. What was the signal and why did you sit out.

## TOMORROW'S NARRATIVE WATCH
Which teams on tonight's slate are on a building emotional arc. Which game tomorrow looks narratively primed for a specific outcome — and what story is being written.

## ONE ADJUSTMENT
One change to your read methodology or filter criteria for tomorrow.

Total under 450 words. First person. Direct. Analytical.`);

  return lines.join("\n");
}

// ── Claude debrief prompt ────────────────────────────────────────────────────

function buildDebriefPrompt(breakdown: GameBreakdown[], date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dn = calculateDateNumerology(new Date(y!, m! - 1, d!));
  const stats = computeStats(breakdown);

  const lines = [
    `GEMATRIA DEBRIEF — ${date}`,
    `Date numerology: Full=${dn.full} | Reduced=${dn.reducedYear} | Single=${dn.singleDigits} | M+D=${dn.monthDay} | Day=${dn.dayOfYear}`,
    "",
    `SESSION: ${stats.wins}W-${stats.losses}L-${stats.pushes}P | Lean accuracy: ${stats.leanHits} correct / ${stats.leanMisses} wrong | Net: $${stats.netPL.toFixed(0)}`,
    "",
    "=== GAME-BY-GAME ===",
  ];

  for (const game of breakdown) {
    const score = game.homeScore != null && game.awayScore != null
      ? `${game.awayScore}–${game.homeScore}` : "no score";
    lines.push(`\n${game.awayTeam} @ ${game.homeTeam} [${game.league}] — ${score}`);
    lines.push(`Engine: ${game.engineLockType ?? "no_lock"}`);

    for (const e of game.entries) {
      const icon = e.result === "win" || e.result === "lean_hit" ? "✓"
        : e.result === "loss" || e.result === "lean_miss" ? "✗" : "–";
      const label = e.betType === "analysis" ? "LEAN" : "BET";
      lines.push(`  [Bot ${e.bot}] ${icon} ${label} ${e.pick} lock=${e.lockType ?? "none"} conf=${e.confidence ?? "?"}%`);
      if (e.reasoning) {
        lines.push(`    "${e.reasoning.slice(0, 180).replace(/\n/g, " ")}"`);
      }
    }
  }

  lines.push(`
=== YOUR TASK ===
You are the HUNGRY System debrief oracle for gematria sports decoding.
Review the day's results above and produce a focused debrief.

Respond with EXACTLY these section headers (## prefix):

## WHAT WORKED
Which signals, ciphers, and alignment types actually correlated with wins today. Be specific: name the cipher (Ordinal, Reduction, Reverse Ordinal, Reverse Reduction), the value, and the team element that matched.

## WHAT FAILED
Which signals or alignment types misfired. Why might they have produced false positives. Was it conflicting evidence, tight weighted gap, misread sacrifice?

## MISSED OPPORTUNITIES
Leans (lean_hit) that were correct but unbetted. What would have needed to be different in the analysis or settings to capture them.

## SIGNAL CALIBRATION
Based on today's results, which signal types should carry more weight going forward and which should be faded. Reference specific alignment types (date_city, date_team, cipher_mirror, win_target, etc.).

## LESSON FOR TOMORROW
One concrete adjustment to the decode methodology, threshold setting, or bot instruction for tomorrow's slate.

Total under 550 words. Be direct and analytical, not vague.`);

  return lines.join("\n");
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? yesterdayET();

  const [breakdown, { data: stored }, { data: storedBotD }] = await Promise.all([
    computeBreakdown(supabase, date),
    supabase
      .from("daily_briefings")
      .select("content,created_at,bets_count")
      .eq("briefing_date", date)
      .eq("bot", "debrief")
      .single(),
    supabase
      .from("daily_briefings")
      .select("content,created_at")
      .eq("briefing_date", date)
      .eq("bot", "D")
      .single(),
  ]);

  return Response.json({
    date,
    narrative: stored?.content ?? null,
    botDNarrative: storedBotD?.content ?? null,
    generatedAt: stored?.created_at ?? null,
    selfHealApplied: (stored?.bets_count ?? 0) > 0,
    stats: computeStats(breakdown),
    games: breakdown,
  });
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json().catch(() => ({}));
  const date: string = body.date ?? yesterdayET();

  const breakdown = await computeBreakdown(supabase, date);
  if (!breakdown.length) {
    return Response.json({ error: "No games found for that date" }, { status: 404 });
  }

  // Check if self-heal already ran for this date (prevent double-counting)
  const { data: existing } = await supabase
    .from("daily_briefings")
    .select("id,bets_count")
    .eq("briefing_date", date)
    .eq("bot", "debrief")
    .single();

  const isFirstRun = !existing;
  let signalUpdates = 0;
  if (isFirstRun) {
    signalUpdates = await runSelfHeal(supabase, date);
  }

  // Fetch Bot D system prompt for its debrief persona
  const { data: settingsRow } = await supabase
    .from("gematria_settings")
    .select("bot_d_system_prompt")
    .eq("id", 1)
    .single();
  const botDSystemPrompt: string = (settingsRow as { bot_d_system_prompt?: string } | null)?.bot_d_system_prompt
    || "You are Bot D, a sports narrative analyst who reads outcomes through the lens of media storylines, public arcs, and scripted theater.";

  // Generate main debrief + Bot D reflection in parallel
  const client = new Anthropic();
  const [mainMsg, botDMsg] = await Promise.all([
    client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      messages: [{ role: "user", content: buildDebriefPrompt(breakdown, date) }],
    }),
    client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: botDSystemPrompt,
      messages: [{ role: "user", content: buildBotDReflectionPrompt(breakdown, date) }],
    }),
  ]);

  const narrative    = mainMsg.content.find(b => b.type === "text")?.text ?? "";
  const botDNarrative = botDMsg.content.find(b => b.type === "text")?.text ?? "";

  const stats = computeStats(breakdown);
  const real = breakdown.flatMap(g => g.entries.filter(e => e.betType !== "analysis"));

  // Store both — bets_count > 0 signals that self-heal has been applied for this date
  await Promise.all([
    supabase.from("daily_briefings").upsert({
      briefing_date: date,
      bot: "debrief",
      content: narrative,
      games_count: breakdown.length,
      bets_count: isFirstRun ? Math.max(1, real.length) : (existing?.bets_count ?? 1),
    }, { onConflict: "briefing_date,bot" }),
    supabase.from("daily_briefings").upsert({
      briefing_date: date,
      bot: "D",
      content: botDNarrative,
      games_count: breakdown.length,
      bets_count: 0,
    }, { onConflict: "briefing_date,bot" }),
  ]);

  return Response.json({
    date,
    narrative,
    botDNarrative,
    stats,
    signalUpdates,
    selfHealApplied: isFirstRun,
    games: breakdown,
  });
}
