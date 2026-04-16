import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = getSupabaseAdmin();

  const [tradesRes, ledgerRes, lastSettledRes] = await Promise.all([
    sb
      .from("paper_trades")
      .select("*, game:games(*)")
      .eq("result", "pending")
      .order("placed_at", { ascending: false }),
    sb
      .from("bankroll_ledger")
      .select("balance, date, daily_pl, wins, losses, bets_placed")
      .order("date", { ascending: false })
      .limit(1),
    sb
      .from("paper_trades")
      .select("settled_at")
      .not("settled_at", "is", null)
      .order("settled_at", { ascending: false })
      .limit(1),
  ]);

  if (tradesRes.error) {
    return NextResponse.json({ error: tradesRes.error.message }, { status: 500 });
  }

  const trades = (tradesRes.data ?? []).map((row) => {
    const { game, ...rest } = row;
    return { ...rest, game };
  });

  const latestLedger = ledgerRes.data?.[0] ?? null;
  const balance = (latestLedger?.balance as number) ?? 10000;
  const atRisk = trades.reduce((s, t) => s + (t.stake ?? 0), 0);
  const potentialWin = trades.reduce((s, t) => s + (t.potential_profit ?? 0), 0);

  const lastSettledAt = (lastSettledRes.data?.[0]?.settled_at as string) ?? null;

  return NextResponse.json({
    trades,
    bankroll: {
      balance,
      atRisk,
      pendingCount: trades.length,
      potentialWin,
    },
    lastSettlement: lastSettledAt
      ? {
          settledAt: lastSettledAt,
          date: latestLedger?.date ?? null,
          betsPlaced: latestLedger?.bets_placed ?? null,
          wins: latestLedger?.wins ?? null,
          losses: latestLedger?.losses ?? null,
          dailyPL: latestLedger?.daily_pl ?? null,
        }
      : null,
  });
}
