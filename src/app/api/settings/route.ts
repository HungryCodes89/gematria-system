import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("gematria_settings")
    .select("*")
    .eq("id", 1)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const sb = getSupabaseAdmin();

  const { data, error } = await sb
    .from("gematria_settings")
    .update(body)
    .eq("id", 1)
    .select("*")
    .single();

  if (error) {
    // bot_d columns may not exist yet in the DB schema — retry without them
    if (error.message?.toLowerCase().includes("bot_d")) {
      const { bot_d_system_prompt, bot_d_bet_rules, bot_d_model, ...rest } = body;
      const retry = await sb
        .from("gematria_settings")
        .update(rest)
        .eq("id", 1)
        .select("*")
        .single();
      if (retry.error) {
        return NextResponse.json({ error: retry.error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, settings: retry.data });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, settings: data });
}
