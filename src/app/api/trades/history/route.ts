import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const league = sp.get("league");
  const result = sp.get("result");
  const days = sp.get("days");

  const sb = getSupabaseAdmin();

  let query = sb
    .from("paper_trades")
    .select("*, game:games!inner(*)")
    .neq("result", "pending")
    .neq("result", "void")
    .order("placed_at", { ascending: false });

  if (league) {
    query = query.eq("game.league", league);
  }

  if (result && ["win", "loss", "push"].includes(result)) {
    query = query.eq("result", result);
  }

  if (days && days !== "all") {
    const d = parseInt(days, 10);
    if (!isNaN(d) && d > 0) {
      const cutoff = new Date(Date.now() - d * 86_400_000).toISOString();
      query = query.gte("placed_at", cutoff);
    }
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const trades = (data ?? []).map((row) => {
    const { game, ...rest } = row;
    return { ...rest, game };
  });

  const wins = trades.filter((t) => t.result === "win").length;
  const losses = trades.filter((t) => t.result === "loss").length;
  const pushes = trades.filter((t) => t.result === "push").length;
  const netPL = trades.reduce((s, t) => s + (t.profit_loss ?? 0), 0);
  const totalWagered = trades.reduce((s, t) => s + (t.stake ?? 0), 0);
  const roi = totalWagered > 0 ? (netPL / totalWagered) * 100 : 0;
  const winRate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0;

  return NextResponse.json({
    trades,
    summary: {
      total: trades.length,
      wins,
      losses,
      pushes,
      netPL: Math.round(netPL * 100) / 100,
      roi: Math.round(roi * 100) / 100,
      winRate: Math.round(winRate * 10) / 10,
      totalWagered: Math.round(totalWagered * 100) / 100,
    },
  });
}
