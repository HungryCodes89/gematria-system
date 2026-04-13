import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const date = new URL(req.url).searchParams.get("date");
  if (!date) return NextResponse.json({ content: "" });

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("decode_notes")
    .select("content")
    .eq("game_date", date)
    .single();

  return NextResponse.json({ content: data?.content ?? "" });
}

export async function POST(req: NextRequest) {
  const { date, content } = await req.json();
  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("decode_notes").upsert(
    { game_date: date, content: content ?? "", updated_at: new Date().toISOString() },
    { onConflict: "game_date" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
