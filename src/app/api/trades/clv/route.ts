import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { fetchOddsForLeague, matchOddsApiGame, type OddsApiGame } from "@/lib/the-odds-api";
import { moneylineToImpliedProb } from "@/lib/odds-api";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * CLV = how much you beat the closing line.
 * Moneyline: probability-based — positive = closing line was more expensive, you got a better price.
 * Over/under: raw total line difference (closing - opening).
 */
function calcClvPercent(
  openingLine: number,
  closingLine: number,
  betType: string
): number {
  if (betType === "moneyline") {
    const closingProb = moneylineToImpliedProb(closingLine);
    const openingProb = moneylineToImpliedProb(openingLine);
    return Math.round((closingProb - openingProb) * 10000) / 100;
  }
  // over_under: raw total line difference
  return Math.round((closingLine - openingLine) * 100) / 100;
}

// GET /api/trades/clv
// Auto-fetches current lines from The Odds API for all pending trades and updates CLV.
// Call this before games start to lock in the closing-line CLV.
export async function GET() {
  const supabase = getSupabaseAdmin();

  const { data: trades, error } = await supabase
    .from("paper_trades")
    .select(
      "id, bet_type, picked_side, pick, opening_line, game:games!inner(id, league, home_team, away_team)"
    )
    .eq("result", "pending")
    .not("opening_line", "is", null);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!trades?.length) {
    return Response.json({ updated: 0, total: 0, matched: 0 });
  }

  // Unique leagues with pending trades
  const leagues = [
    ...new Set(
      trades.flatMap((t) => {
        const g = t.game as unknown as { league: string } | null;
        return g ? [g.league] : [];
      })
    ),
  ];

  // Fetch current odds per league in parallel
  const oddsCache = new Map<string, OddsApiGame[]>();
  await Promise.all(
    leagues.map(async (league) => {
      const games = await fetchOddsForLeague(league);
      oddsCache.set(league, games);
    })
  );

  type Update = { id: string; closing_line: number; opening_line: number; bet_type: string };
  const updates: Update[] = [];

  for (const trade of trades) {
    const game = trade.game as unknown as {
      league: string;
      home_team: string;
      away_team: string;
    } | null;
    if (!game || trade.opening_line == null) continue;

    const oddsGames = oddsCache.get(game.league) ?? [];
    const matched = matchOddsApiGame(oddsGames, game.home_team, game.away_team);
    if (!matched) continue;

    let line: number | null = null;

    if (trade.bet_type === "moneyline") {
      line =
        trade.picked_side === "home"
          ? matched.bestMoneylineHome
          : matched.bestMoneylineAway;
    } else if (trade.bet_type === "over_under") {
      line = matched.bestOverLine;
    }

    if (line != null) {
      updates.push({
        id: trade.id,
        closing_line: line,
        opening_line: trade.opening_line,
        bet_type: trade.bet_type ?? "moneyline",
      });
    }
  }

  let updated = 0;
  const errors: string[] = [];

  for (const u of updates) {
    const clv_percent = calcClvPercent(u.opening_line, u.closing_line, u.bet_type);

    const { error: updateErr } = await supabase
      .from("paper_trades")
      .update({ closing_line: u.closing_line, clv_percent })
      .eq("id", u.id);

    if (updateErr) {
      errors.push(`${u.id}: ${updateErr.message}`);
    } else {
      updated++;
    }
  }

  return Response.json({
    updated,
    total: trades.length,
    matched: updates.length,
    ...(errors.length > 0 && { errors }),
  });
}

// PATCH /api/trades/clv
// Body: { trades: Array<{ id: string; closing_line: number }> }
// Manually supply closing lines and recalculate CLV.
export async function PATCH(req: NextRequest) {
  const supabase = getSupabaseAdmin();

  let body: { trades: { id: string; closing_line: number }[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.trades) || body.trades.length === 0) {
    return Response.json({ error: "trades array required" }, { status: 400 });
  }

  const ids = body.trades.map((t) => t.id);

  const { data: existing, error: fetchErr } = await supabase
    .from("paper_trades")
    .select("id, opening_line, bet_type")
    .in("id", ids);

  if (fetchErr) {
    return Response.json({ error: fetchErr.message }, { status: 500 });
  }

  const tradeMap = new Map(
    (existing ?? []).map((r) => [
      r.id,
      {
        opening_line: r.opening_line as number | null,
        bet_type: r.bet_type as string | null,
      },
    ])
  );

  const errors: string[] = [];
  let updated = 0;

  for (const { id, closing_line } of body.trades) {
    const row = tradeMap.get(id);
    const opening = row?.opening_line ?? null;
    const betType = row?.bet_type ?? "moneyline";
    const clv_percent =
      opening != null ? calcClvPercent(opening, closing_line, betType) : null;

    const { error } = await supabase
      .from("paper_trades")
      .update({ closing_line, clv_percent })
      .eq("id", id);

    if (error) errors.push(`${id}: ${error.message}`);
    else updated++;
  }

  return Response.json({ updated, errors });
}
