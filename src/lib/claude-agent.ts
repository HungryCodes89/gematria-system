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

function buildUserMessage(game: Game, analysis: GameAnalysis): string {
  const dn = analysis.dateNumerology;
  const moonIll = getMoonIllumination(new Date(game.game_date + "T17:00:00Z"));
  const fullMoon = isFullMoon(game.game_date);

  const sections: string[] = [];

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
Root Number: ${dn.rootNumber} | Calendar Day: ${dn.calendarDay} | Calendar Month: ${dn.calendarMonth}`
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
  settings: GematriaSettings
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

  const analysisResult: GameAnalysisResult = {
    lockType: LOCK_MAP[engineResult.lockType],
    confidence: engineResult.gematriaConfidence,
    pickedSide: engineResult.pickedSide === "skip" ? null : engineResult.pickedSide,
    alignmentCount:
      engineResult.homeAlignments.length + engineResult.awayAlignments.length,
  };

  const systemMsg = buildSystemMessage(settings);
  const userMsg = buildUserMessage(game, engineResult);

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
