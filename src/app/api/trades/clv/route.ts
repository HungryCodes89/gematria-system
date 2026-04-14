import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// PATCH /api/trades/clv
// Body: { trades: Array<{ id: string; closing_line: number }> }
// Fetches each trade's opening_line from DB, calculates clv_percent = closing - opening
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
    .select("id, opening_line")
    .in("id", ids);

  if (fetchErr) {
    return Response.json({ error: fetchErr.message }, { status: 500 });
  }

  const openingMap = new Map<string, number | null>(
    (existing ?? []).map((r) => [r.id, r.opening_line])
  );

  const updates = body.trades.map(({ id, closing_line }) => {
    const opening = openingMap.get(id) ?? null;
    const clv_percent = opening != null ? closing_line - opening : null;
    return { id, closing_line, clv_percent };
  });

  const errors: string[] = [];
  for (const u of updates) {
    const { error } = await supabase
      .from("paper_trades")
      .update({ closing_line: u.closing_line, clv_percent: u.clv_percent })
      .eq("id", u.id);
    if (error) errors.push(`${u.id}: ${error.message}`);
  }

  return Response.json({ updated: updates.length - errors.length, errors });
}
