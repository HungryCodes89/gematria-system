import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const PATTERN_TYPES = [
  "Return Stamp",
  "Sacrifice Marker",
  "Triple Milestone",
  "Birthday Measurement",
  "Jesuit Number",
  "Mirror Mechanic",
  "H2H Gap",
  "Other",
] as const;

export async function GET() {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("validated_patterns")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const patterns = data ?? [];

  // Aggregate win rates by pattern type
  const winRates: Record<string, { hits: number; total: number; winRate: number }> = {};
  for (const type of PATTERN_TYPES) {
    const group = patterns.filter((p) => p.pattern_type === type);
    const hits = group.filter((p) => p.outcome === "hit").length;
    winRates[type] = {
      hits,
      total: group.length,
      winRate: group.length > 0 ? Math.round((hits / group.length) * 100) : 0,
    };
  }

  return Response.json({ patterns, winRates });
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();

  let body: {
    pattern_type?: string;
    cipher_values?: number[];
    date_numerology?: number[];
    sport?: string;
    teams_involved?: string;
    outcome?: string;
    notes?: string;
    confidence_score?: number;
  };

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.pattern_type || !body.outcome) {
    return Response.json({ error: "pattern_type and outcome are required" }, { status: 400 });
  }

  if (!["hit", "miss"].includes(body.outcome)) {
    return Response.json({ error: "outcome must be hit or miss" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("validated_patterns")
    .insert({
      pattern_type: body.pattern_type,
      cipher_values: body.cipher_values ?? [],
      date_numerology: body.date_numerology ?? [],
      sport: body.sport ?? null,
      teams_involved: body.teams_involved ?? null,
      outcome: body.outcome,
      notes: body.notes ?? null,
      confidence_score: body.confidence_score ?? null,
    })
    .select("*")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ pattern: data }, { status: 201 });
}
