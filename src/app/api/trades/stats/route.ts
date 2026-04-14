import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

interface GroupStats {
  total: number;
  wins: number;
  losses: number;
  pl: number;
  winRate: number;
  roi: number;
  avgClv: number | null;
}

function calcOverallAvgClv(trades: Record<string, unknown>[]): number | null {
  const clvTrades = trades.filter((t) => t.clv_percent != null);
  if (clvTrades.length === 0) return null;
  const sum = clvTrades.reduce((s, t) => s + (t.clv_percent as number), 0);
  return Math.round((sum / clvTrades.length) * 100) / 100;
}

function groupBy<T>(items: T[], key: (t: T) => string): Record<string, GroupStats> {
  const map: Record<string, { w: number; l: number; p: number; pl: number; wagered: number; clvSum: number; clvCount: number }> = {};
  for (const item of items) {
    const k = key(item) || "unknown";
    if (!map[k]) map[k] = { w: 0, l: 0, p: 0, pl: 0, wagered: 0, clvSum: 0, clvCount: 0 };
    const bucket = map[k];
    const t = item as Record<string, unknown>;
    if (t.result === "win") bucket.w++;
    else if (t.result === "loss") bucket.l++;
    else bucket.p++;
    bucket.pl += (t.profit_loss as number) ?? 0;
    bucket.wagered += (t.stake as number) ?? 0;
    if (t.clv_percent != null) {
      bucket.clvSum += t.clv_percent as number;
      bucket.clvCount++;
    }
  }

  const result: Record<string, GroupStats> = {};
  for (const [k, v] of Object.entries(map)) {
    const total = v.w + v.l + v.p;
    result[k] = {
      total,
      wins: v.w,
      losses: v.l,
      pl: Math.round(v.pl * 100) / 100,
      winRate: v.w + v.l > 0 ? Math.round((v.w / (v.w + v.l)) * 1000) / 10 : 0,
      roi: v.wagered > 0 ? Math.round((v.pl / v.wagered) * 10000) / 100 : 0,
      avgClv: v.clvCount > 0 ? Math.round((v.clvSum / v.clvCount) * 100) / 100 : null,
    };
  }
  return result;
}

export async function GET() {
  const sb = getSupabaseAdmin();

  const [ledgerRes, tradesRes] = await Promise.all([
    sb.from("bankroll_ledger").select("*").order("date", { ascending: true }),
    sb
      .from("paper_trades")
      .select("*, game:games!inner(*)")
      .neq("result", "pending")
      .neq("result", "void")
      .order("placed_at", { ascending: false }),
  ]);

  if (tradesRes.error) {
    return NextResponse.json({ error: tradesRes.error.message }, { status: 500 });
  }

  const ledger = ledgerRes.data ?? [];
  const rawTrades = tradesRes.data ?? [];

  const trades = rawTrades.map((row) => {
    const { game, ...rest } = row;
    return {
      ...rest,
      game,
      _league: game?.league,
      _lockType: rest.lock_type,
      _betType: rest.bet_type,
      _bot: rest.bot,
      _primetime: game?.is_primetime ? "Primetime" : "Non-Primetime",
    };
  });

  const balance = ledger.length > 0 ? (ledger[ledger.length - 1].balance as number) : 10000;
  const wins = trades.filter((t) => t.result === "win").length;
  const losses = trades.filter((t) => t.result === "loss").length;
  const totalWagered = trades.reduce((s, t) => s + (t.stake ?? 0), 0);
  const netPL = trades.reduce((s, t) => s + (t.profit_loss ?? 0), 0);
  const roi = totalWagered > 0 ? Math.round((netPL / totalWagered) * 10000) / 100 : 0;
  const winRate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 1000) / 10 : 0;

  const byLeague = groupBy(trades, (t) => t._league as string);
  const byLockType = groupBy(trades, (t) => (t._lockType as string) || "none");
  const byBetType = groupBy(trades, (t) => (t._betType as string) || "unknown");
  const byBot = groupBy(trades, (t) => `Bot ${(t._bot as string) || "A"}`);
  const byPrimetime = groupBy(trades, (t) => (t._primetime as string) || "Non-Primetime");
  const avgClv = calcOverallAvgClv(trades as Record<string, unknown>[]);

  return NextResponse.json({
    balance,
    roi,
    winRate,
    record: `${wins}W-${losses}L`,
    totalWagered: Math.round(totalWagered * 100) / 100,
    equityCurve: ledger,
    avgClv,
    byLeague,
    byBetType,
    byLockType,
    byBot,
    byPrimetime,
  });
}
