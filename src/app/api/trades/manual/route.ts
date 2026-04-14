import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { calculateStake, calculatePayout } from "@/lib/paper-trading";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { gameId, bot, betType, pick, pickedSide, odds, units, reasoning } = body;

  if (!gameId || !bot || !betType || !pick || odds == null || !units) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: settingsRow } = await supabase
    .from("gematria_settings")
    .select("unit_size")
    .eq("id", 1)
    .single();

  const unitSize: number = settingsRow?.unit_size ?? 10;
  const stake = calculateStake(units, unitSize);
  const potentialProfit = calculatePayout(stake, odds);

  const { error } = await supabase.from("paper_trades").insert({
    game_id: gameId,
    bot,
    bet_type: betType,
    pick,
    picked_side: pickedSide ?? null,
    odds,
    units,
    stake,
    potential_profit: potentialProfit,
    result: "pending",
    profit_loss: 0,
    reasoning: reasoning || null,
    lock_type: "manual",
    strategy_version: "v1",
    placed_at: new Date().toISOString(),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
