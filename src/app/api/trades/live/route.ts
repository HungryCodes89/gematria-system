import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = getSupabaseAdmin();

  const [tradesRes, ledgerRes] = await Promise.all([
    sb
      .from("paper_trades")
      .select("*, game:games(*)")
      .eq("result", "pending")
      .order("placed_at", { ascending: false }),
    sb
      .from("bankroll_ledger")
      .select("balance")
      .order("date", { ascending: false })
      .limit(1),
  ]);

  if (tradesRes.error) {
    return NextResponse.json({ error: tradesRes.error.message }, { status: 500 });
  }

  const trades = (tradesRes.data ?? []).map((row) => {
    const { game, ...rest } = row;
    return { ...rest, game };
  });

  const balance = (ledgerRes.data?.[0]?.balance as number) ?? 10000;
  const atRisk = trades.reduce((s, t) => s + (t.stake ?? 0), 0);
  const potentialWin = trades.reduce((s, t) => s + (t.potential_profit ?? 0), 0);

  return NextResponse.json({
    trades,
    bankroll: {
      balance,
      atRisk,
      pendingCount: trades.length,
      potentialWin,
    },
  });
}
