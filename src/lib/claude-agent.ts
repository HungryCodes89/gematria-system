import Anthropic from "@anthropic-ai/sdk";
import type {
  Game,
  TradeDecision,
  GematriaSettings,
  ConsolidatedOdds,
  LockType as TypesLockType,
} from "@/lib/types";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import {
  analyzeGame,
  type GameAnalysis,
  type LockType as EngineLockType,
  type Alignment,
  type TeamGematria,
} from "@/lib/analysis-engine";
import { calculateDateNumerology } from "@/lib/gematria";
import { getMoonIllumination, isFullMoon } from "@/lib/moon-phase";

// ---------------------------------------------------------------------------
// Pattern library types
// ---------------------------------------------------------------------------

export interface MatchedPattern {
  pattern_type: string;
  cipher_values: number[];
  date_numerology: number[];
  sport: string | null;
  teams_involved: string | null;
  outcome: "hit" | "miss";
  notes: string | null;
  confidence_score: number | null;
}

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface GameAnalysisResult {
  lockType: TypesLockType;
  confidence: number;
  pickedSide: "home" | "away" | null;
  alignmentCount: number;
}

const LOCK_MAP: Record<EngineLockType, TypesLockType> = {
  triple: "triple_lock",
  double: "double_lock",
  single: "single_lock",
  skip: "no_lock",
};

// ---------------------------------------------------------------------------
// Jesuit / Masonic number detection (Bot C only)
// ---------------------------------------------------------------------------

const JESUIT_NUMBERS = new Set([33, 42, 47, 56, 59, 72, 84, 113, 131, 144, 187, 201, 322]);

interface JesuitHit {
  element: string;
  cipher: string;
  value: number;
  side: "home" | "away";
}

function collectJesuitFlags(engineResult: GameAnalysis): JesuitHit[] {
  const hits: JesuitHit[] = [];
  const seen = new Set<string>();

  const checkG = (g: { text: string; ordinal: number; reduction: number; reverseOrdinal: number; reverseReduction: number }, side: "home" | "away") => {
    if (!g.text) return;
    const ciphers: [string, number][] = [
      ["Ordinal", g.ordinal],
      ["Reduction", g.reduction],
      ["Reverse Ordinal", g.reverseOrdinal],
      ["Reverse Reduction", g.reverseReduction],
    ];
    for (const [cipher, val] of ciphers) {
      const key = `${side}-${g.text}-${cipher}`;
      if (JESUIT_NUMBERS.has(val) && !seen.has(key)) {
        seen.add(key);
        hits.push({ element: g.text, cipher, value: val, side });
      }
    }
  };

  const checkTeam = (tg: TeamGematria, side: "home" | "away") => {
    checkG(tg.city, side);
    checkG(tg.teamName, side);
    checkG(tg.fullName, side);
    checkG(tg.abbreviation, side);
    for (const alt of tg.alternates) checkG(alt, side);
    for (const sp of tg.starPlayers) checkG(sp, side);
    if (tg.goalie) checkG(tg.goalie, side);
    if (tg.coach) checkG(tg.coach, side);
  };

  checkTeam(engineResult.homeGematria, "home");
  checkTeam(engineResult.awayGematria, "away");

  return hits;
}

// ---------------------------------------------------------------------------
// Prompt helpers
// ---------------------------------------------------------------------------

function formatCipherValues(tg: TeamGematria): string {
  const rows = [
    `  City (${tg.city.text}): Ord ${tg.city.ordinal} | Red ${tg.city.reduction} | RevOrd ${tg.city.reverseOrdinal} | RevRed ${tg.city.reverseReduction}`,
    `  Team (${tg.teamName.text}): Ord ${tg.teamName.ordinal} | Red ${tg.teamName.reduction} | RevOrd ${tg.teamName.reverseOrdinal} | RevRed ${tg.teamName.reverseReduction}`,
    `  Full (${tg.fullName.text}): Ord ${tg.fullName.ordinal} | Red ${tg.fullName.reduction} | RevOrd ${tg.fullName.reverseOrdinal} | RevRed ${tg.fullName.reverseReduction}`,
  ];
  if (tg.abbreviation.text) {
    rows.push(
      `  Abbr (${tg.abbreviation.text}): Ord ${tg.abbreviation.ordinal} | Red ${tg.abbreviation.reduction} | RevOrd ${tg.abbreviation.reverseOrdinal} | RevRed ${tg.abbreviation.reverseReduction}`
    );
  }
  for (const sp of tg.starPlayers) {
    rows.push(
      `  Star (${sp.text}): Ord ${sp.ordinal} | Red ${sp.reduction} | RevOrd ${sp.reverseOrdinal} | RevRed ${sp.reverseReduction}`
    );
  }
  if (tg.goalie) {
    rows.push(
      `  Goalie (${tg.goalie.text}): Ord ${tg.goalie.ordinal} | Red ${tg.goalie.reduction} | RevOrd ${tg.goalie.reverseOrdinal} | RevRed ${tg.goalie.reverseReduction}`
    );
  }
  if (tg.coach) {
    rows.push(
      `  Coach (${tg.coach.text}): Ord ${tg.coach.ordinal} | Red ${tg.coach.reduction} | RevOrd ${tg.coach.reverseOrdinal} | RevRed ${tg.coach.reverseReduction}`
    );
  }
  return rows.join("\n");
}

function formatAlignments(aligns: Alignment[]): string {
  if (!aligns.length) return "  (none)";
  return aligns
    .map(
      (a) =>
        `  • [${a.type}] "${a.element}" ${a.cipher}=${a.value} matches ${a.dateMethod}=${a.dateValue} — ${a.description}`
    )
    .join("\n");
}

function formatOdds(odds: ConsolidatedOdds | null): string {
  if (!odds) return "No market odds available.";
  const parts: string[] = [];
  if (odds.moneylineHome != null && odds.moneylineAway != null) {
    parts.push(
      `Moneyline: Home ${odds.moneylineHome > 0 ? "+" : ""}${odds.moneylineHome} / Away ${odds.moneylineAway > 0 ? "+" : ""}${odds.moneylineAway}`
    );
  }
  if (odds.impliedProbHome != null && odds.impliedProbAway != null) {
    parts.push(
      `Implied: Home ${(odds.impliedProbHome * 100).toFixed(1)}% / Away ${(odds.impliedProbAway * 100).toFixed(1)}%`
    );
  }
  if (odds.spreadLine != null) {
    parts.push(`Spread: ${odds.spreadLine}`);
  }
  if (odds.overUnderLine != null) {
    parts.push(
      `O/U: ${odds.overUnderLine}${odds.overOdds != null ? ` (Over ${odds.overOdds > 0 ? "+" : ""}${odds.overOdds})` : ""}${odds.underOdds != null ? ` (Under ${odds.underOdds > 0 ? "+" : ""}${odds.underOdds})` : ""}`
    );
  }
  return parts.length ? parts.join("\n") : "No market odds available.";
}

function buildUserMessage(game: Game, analysis: GameAnalysis, bot?: "A" | "B" | "C", notes?: string, matchedPatterns?: MatchedPattern[]): string {
  const dn = analysis.dateNumerology;
  const moonIll = getMoonIllumination(new Date(game.game_date + "T17:00:00Z"));
  const fullMoon = isFullMoon(game.game_date);

  const sections: string[] = [];

  if (notes?.trim()) {
    sections.push(`=== DECODE JOURNAL (Sean's Notes) ===\n${notes.trim()}`);
  }

  sections.push(
    `=== GAME ===
${game.away_team} @ ${game.home_team}
League: ${game.league} | Date: ${game.game_date}
Venue: ${analysis.venue}
Records: Home ${game.home_record ?? "N/A"} | Away ${game.away_record ?? "N/A"}
Moon: ${(moonIll * 100).toFixed(0)}% illumination${fullMoon ? " (FULL MOON)" : ""}`
  );

  sections.push(
    `=== DATE NUMEROLOGY ===
Full: ${dn.full} | Reduced Year: ${dn.reducedYear} | Single Digits: ${dn.singleDigits}
Short Year: ${dn.shortYear} | Month+Day: ${dn.monthDay}
Root Number: ${dn.rootNumber} | Calendar Day: ${dn.calendarDay} | Calendar Month: ${dn.calendarMonth}${bot === "C" ? `\nDay of Year: ${dn.dayOfYear} | Days Remaining: ${dn.daysRemaining}` : ""}`
  );

  sections.push(
    `=== HOME TEAM CIPHERS (${game.home_team}) ===
${formatCipherValues(analysis.homeGematria)}`
  );
  sections.push(
    `=== HOME TEAM ALIGNMENTS ===
${formatAlignments(analysis.homeAlignments)}`
  );

  sections.push(
    `=== AWAY TEAM CIPHERS (${game.away_team}) ===
${formatCipherValues(analysis.awayGematria)}`
  );
  sections.push(
    `=== AWAY TEAM ALIGNMENTS ===
${formatAlignments(analysis.awayAlignments)}`
  );

  const lockLabel =
    analysis.lockType === "triple"
      ? "TRIPLE LOCK"
      : analysis.lockType === "double"
        ? "DOUBLE LOCK"
        : analysis.lockType === "single"
          ? "SINGLE LOCK"
          : "SKIP";

  sections.push(
    `=== GEMATRIA SUMMARY ===
Lock Type: ${lockLabel}
Home Alignments: ${analysis.homeAlignments.length}
Away Alignments: ${analysis.awayAlignments.length}
Confidence: ${analysis.gematriaConfidence}%
Favored Side: ${analysis.pickedSide === "skip" ? "Neither" : analysis.pickedSide}`
  );

  sections.push(`=== ODDS ===\n${formatOdds(game.polymarket_odds)}`);

  if (bot === "C") {
    const jesuitHits = collectJesuitFlags(analysis);
    if (jesuitHits.length > 0) {
      const lines = jesuitHits.map(
        (h) => `  ✦ ${h.side.toUpperCase()} "${h.element}" ${h.cipher} = ${h.value}`
      );
      sections.push(`=== CONFIRMED JESUIT/MASONIC MARKERS ===\n${lines.join("\n")}`);
    } else {
      sections.push(`=== CONFIRMED JESUIT/MASONIC MARKERS ===\n  (none detected for this game)`);
    }
  }

  if (matchedPatterns && matchedPatterns.length > 0) {
    const lines = matchedPatterns.map((p) => {
      const parts: string[] = [
        `  ▶ [${p.pattern_type}] — Historical Win Rate: ${p.outcome === "hit" ? "HIT" : "MISS"} (${p.confidence_score != null ? p.confidence_score + "% confidence" : "unscored"})`,
      ];
      if (p.teams_involved) parts.push(`    Teams: ${p.teams_involved}`);
      if (p.cipher_values?.length) parts.push(`    Cipher Values: ${p.cipher_values.join(", ")}`);
      if (p.date_numerology?.length) parts.push(`    Date Numbers: ${p.date_numerology.join(", ")}`);
      if (p.notes) parts.push(`    Notes: ${p.notes}`);
      return parts.join("\n");
    });
    sections.push(`=== VALIDATED PATTERN MATCHES ===\nThe following historically validated patterns match tonight's date numerology:\n${lines.join("\n\n")}`);
  }

  return sections.join("\n\n");
}

function buildSystemMessage(settings: GematriaSettings): string {
  const jsonInstructions = `
RESPONSE FORMAT — You must respond with valid JSON only. No markdown, no explanation outside the JSON.
Return an array of trade decision objects. Each object must have:
{
  "action": "bet" | "skip",
  "betType": "moneyline" | "over_under",
  "pick": "<team name or Over/Under X.X>",
  "pickedSide": "home" | "away" | null,
  "odds": <american odds number>,
  "impliedProbability": <0-1>,
  "modelProbability": <0-1>,
  "ev": <expected value as decimal>,
  "units": <1-${settings.max_units_per_bet}>,
  "confidence": <0-100>,
  "reasoning": "<brief reasoning>"
}
If you skip the game entirely, return a single-element array with action "skip".`;

  const parts = [settings.system_prompt, settings.bet_rules, jsonInstructions];
  return parts.filter(Boolean).join("\n\n");
}

// ---------------------------------------------------------------------------
// JSON parsing with fallbacks
// ---------------------------------------------------------------------------

function robustJsonParse(raw: string): TradeDecision[] {
  const trimmed = raw.trim();

  // Try direct parse
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    // continue
  }

  // Strip markdown fences
  const fenceStripped = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(fenceStripped);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    // continue
  }

  // Extract first [ ... ] or { ... } block
  const bracketMatch = fenceStripped.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (bracketMatch) {
    try {
      const parsed = JSON.parse(bracketMatch[1]!);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      // continue
    }
  }

  throw new Error("Failed to parse Claude response as JSON");
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function analyzeGameWithClaude(
  game: Game,
  settings: GematriaSettings,
  bot?: "A" | "B" | "C",
  notes?: string,
  matchedPatterns?: MatchedPattern[]
): Promise<{ analysis: GameAnalysisResult; decisions: TradeDecision[] }> {
  const gameDate = new Date(game.game_date + "T00:00:00");

  const engineResult = analyzeGame({
    gameId: game.id,
    league: game.league,
    date: gameDate,
    homeTeamName: game.home_team,
    awayTeamName: game.away_team,
    venueName: game.venue ?? "",
    homeWins: game.home_wins,
    awayWins: game.away_wins,
    homeLosses: game.home_losses,
    awayLosses: game.away_losses,
  });

  // Full moon boosts confidence: +8 points (capped at 93)
  const fullMoon = isFullMoon(game.game_date);
  const boostedConfidence = fullMoon && engineResult.lockType !== "skip"
    ? Math.min(93, engineResult.gematriaConfidence + 8)
    : engineResult.gematriaConfidence;

  const analysisResult: GameAnalysisResult = {
    lockType: LOCK_MAP[engineResult.lockType],
    confidence: boostedConfidence,
    pickedSide: engineResult.pickedSide === "skip" ? null : engineResult.pickedSide,
    alignmentCount:
      engineResult.homeAlignments.length + engineResult.awayAlignments.length,
  };

  const systemMsg = buildSystemMessage(settings);
  const userMsg = buildUserMessage(game, engineResult, bot, notes, matchedPatterns);

  const client = new Anthropic();
  const response = await client.messages.create({
    model: settings.model,
    max_tokens: 2048,
    system: systemMsg,
    messages: [{ role: "user", content: userMsg }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text content");
  }

  const decisions = robustJsonParse(textBlock.text);

  return { analysis: analysisResult, decisions };
}
