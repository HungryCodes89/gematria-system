import { type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const linkedFor = searchParams.get("linkedFor");

  if (linkedFor) {
    const { data, error } = await supabase
      .from("paper_trades")
      .select("id, pick, result, profit_loss, placed_at, game:games(away_team, home_team, game_date)")
      .ilike("reasoning", `%${linkedFor}%`)
      .neq("result", "pass")
      .not("result", "is", null)
      .order("placed_at", { ascending: false })
      .limit(10);

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ picks: data ?? [] });
  }

  const { data, error } = await supabase
    .from("patterns")
    .select("id, name, category, status, description, live_record, created_at")
    .order("created_at", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ patterns: data ?? [] });
}
