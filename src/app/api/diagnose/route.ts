import { getSupabaseAdmin } from "@/lib/supabase-server";
import { getTodayET } from "@/lib/date-utils";
import { analyzeGame } from "@/lib/analysis-engine";
import type { Game, GematriaSettings, LockType } from "@/lib/types";

export const dynamic = "force-dynamic";

const LOCK_MAP: Record<string, LockType> = {
  triple: "triple_lock",
  double: "double_lock",
  single: "single_lock",
  skip: "no_lock",
};

const AUTO_BET_MAP: Record<LockType, keyof GematriaSettings | null> = {
  triple_lock:    "auto_bet_triple_locks",
  double_lock:    "auto_bet_double_locks",
  single_lock:    "auto_bet_single_locks",
  sacrifice_lock: "auto_bet_triple_locks",
  no_lock:        null,
};

export async function GET() {
  const supabase = getSupabaseAdmin();
  const today = getTodayET();

  const [settingsRes, gamesRes, balanceRes] = await Promise.all([
    supabase.from("gematria_settings").select("*").eq("id", 1).single(),
    supabase.from("games").select("*").eq("game_date", today),
    supabase
      .from("bankroll_ledger")
      .select("balance")
      .order("date", { ascending: false })
      .limit(1)
      .single(),
  ]);

  const settings = settingsRes.data as GematriaSettings | null;
  const games = (gamesRes.data ?? []) as Game[];
  const balance = balanceRes.data?.balance ?? settings?.starting_bankroll ?? 10000;

  const [y, m, d] = today.split("-").map(Number);
  const todayDate = new Date(y!, m! - 1, d!);

  const gameResults = games.map((game) => {
    let engineData: ReturnType<typeof analyzeGame> | null = null;
    let engineError: string | null = null;

    try {
      engineData = analyzeGame({
        gameId: game.id,
        league: game.league,
        date: todayDate,
        homeTeamName: game.home_team,
        awayTeamName: game.away_team,
        venueName: game.venue ?? "",
        homeWins: game.home_wins,
        awayWins: game.away_wins,
        homeLosses: game.home_losses,
        awayLosses: game.away_losses,
      });
    } catch (e) {
      engineError = String(e);
    }

    if (!engineData) {
      return {
        id: game.id,
        teams: `${game.away_team} @ ${game.home_team}`,
        league: game.league,
        analyzed: game.analyzed,
        stored_lock_type: game.lock_type,
        engine: null,
        engineError,
        prediction: "ERROR",
        skipReason: engineError,
      };
    }

    const lockType = LOCK_MAP[engineData.lockType] ?? "no_lock";
    const autoBetKey = AUTO_BET_MAP[lockType];

    let skipReason: string | null = null;
    if (!settings) {
      skipReason = "Settings not found in DB";
    } else if (lockType === "no_lock") {
      skipReason = `Engine: no_lock — ${engineData.grading.lockRule}`;
    } else if (!autoBetKey || !settings[autoBetKey]) {
      skipReason = `Auto-bet disabled for ${lockType} (settings.${autoBetKey ?? "no_lock"} = false)`;
    } else if (engineData.gematriaConfidence < settings.min_confidence) {
      skipReason = `Engine confidence ${engineData.gematriaConfidence}% < min_confidence ${settings.min_confidence}%`;
    }

    return {
      id: game.id,
      teams: `${game.away_team} @ ${game.home_team}`,
      league: game.league,
      analyzed: game.analyzed,
      stored_lock_type: game.lock_type,
      engine: {
        lockType,
        confidence: engineData.gematriaConfidence,
        homeAlignments: engineData.homeAlignments.length,
        awayAlignments: engineData.awayAlignments.length,
        weightedGap: engineData.grading.weightedGap,
        skippedByGap: engineData.grading.skippedByTightWeightedGap,
        totalForLock: engineData.grading.totalAlignmentsForLock,
        homeLockCount: engineData.grading.homeLockCount,
        awayLockCount: engineData.grading.awayLockCount,
        rule: engineData.grading.lockRule,
        pickedSide: engineData.pickedSide,
      },
      prediction: skipReason ? "SKIP" : "WOULD_BET",
      skipReason,
    };
  });

  // Identify known issues
  const knownIssues: string[] = [];

  if (settings) {
    const modelOk =
      settings.model?.startsWith("claude-") &&
      !settings.model.includes("claude-sonnet-4-5") &&
      !settings.model.includes("claude-3-");
    if (!modelOk) {
      knownIssues.push(
        `Model "${settings.model}" looks outdated or invalid — update to "claude-sonnet-4-6" in Settings > Bot A or run: UPDATE gematria_settings SET model='claude-sonnet-4-6', bot_b_model='claude-sonnet-4-6', bot_c_model='claude-sonnet-4-6' WHERE id=1;`
      );
    }

    if (!settings.auto_bet_double_locks && !settings.auto_bet_single_locks) {
      knownIssues.push(
        "Auto-bet is only enabled for Triple Locks. Double/Single locks will never place bets unless you enable them in Settings > Bet Sizing."
      );
    }

    const wouldBetCount = gameResults.filter((g) => g.prediction === "WOULD_BET").length;
    const noLockCount = gameResults.filter((g) => g.engine?.lockType === "no_lock").length;
    if (games.length > 0 && noLockCount === games.length) {
      knownIssues.push(
        `All ${games.length} games classified as no_lock by the engine. Either today's date numerology produces few alignments, or the engine skip rules are too strict.`
      );
    }

    if (wouldBetCount === 0 && games.length > 0) {
      knownIssues.push("No games would trigger a bet with current settings. Check auto_bet toggles and min_confidence.");
    }
  } else {
    knownIssues.push("gematria_settings row not found — run 001_init.sql in Supabase");
  }

  knownIssues.push(
    "SQL fix required — paper_trades bot constraint only allows ('A','B'), blocking Bots C and D. Run: ALTER TABLE paper_trades DROP CONSTRAINT IF EXISTS paper_trades_bot_check; ALTER TABLE paper_trades ADD CONSTRAINT paper_trades_bot_check CHECK (bot IN ('A', 'B', 'C', 'D'));"
  );

  return Response.json({
    date: today,
    balance,
    games_total: games.length,
    games_analyzed: games.filter((g) => g.analyzed).length,
    games_would_bet: gameResults.filter((g) => g.prediction === "WOULD_BET").length,
    settings: settings
      ? {
          model: settings.model,
          min_confidence: settings.min_confidence,
          auto_bet_triple_locks: settings.auto_bet_triple_locks,
          auto_bet_double_locks: settings.auto_bet_double_locks,
          auto_bet_single_locks: settings.auto_bet_single_locks,
          unit_size: settings.unit_size,
          max_daily_units: settings.max_daily_units,
          max_units_per_bet: settings.max_units_per_bet,
          starting_bankroll: settings.starting_bankroll,
        }
      : null,
    knownIssues,
    games: gameResults,
  });
}
