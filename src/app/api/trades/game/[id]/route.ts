import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = getSupabaseAdmin();
  const { id } = params;

  const { data, error } = await supabase
    .from("paper_trades")
    .select("*")
    .eq("game_id", id)
    .order("bot", { ascending: true });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ trades: data ?? [] });
}
