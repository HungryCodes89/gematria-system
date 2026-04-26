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
import { extractPreAnalysisSignals, type PreAnalysisData, type SignalName } from "@/lib/signal-extractor";

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

export interface ProvenPattern {
  signal_name: string;
  times_fired: number;
  wins: number;
  losses: number;
  win_rate: number;
  avg_clv: number;
  weight_score: number;
}

export interface SacrificePattern {
  signal_name: string;
  triple_lock_fires: number;
  sacrifice_outcomes: number;
  lock_outcomes: number;
  sacrifice_rate: number;
}

const SACRIFICE_RATE_THRESHOLD = 0.60; // signal must show ≥60% sacrifice rate
const SACRIFICE_MIN_FIRES = 3;         // must have appeared on ≥3 triple lock games
const SACRIFICE_SIGNAL_COUNT = 2;      // need ≥2 qualifying signals to trigger flip

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface GameAnalysisResult {
  lockType: TypesLockType;
  confidence: number;
  pickedSide: "home" | "away" | null;
  alignmentCount: number;
  sacrificeLock?: boolean;
  sacrificeSignals?: SacrificePattern[];
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

function formatSacrificeAlert(
  engineFavoredTeam: string,
  opponent: string,
  engineFavoredSide: "home" | "away",
  signals: SacrificePattern[]
): string {
  const signalLines = signals.map((s) => {
    const rate = Math.round(s.sacrifice_rate * 100);
    return `  ⚠ ${s.signal_name.replace(/_/g, ' ').toUpperCase()} — ${rate}% sacrifice rate (${s.triple_lock_fires} triple lock games)`;
  });
  const opponentSide = engineFavoredSide === "home" ? "away" : "home";
  return `=== SACRIFICE LOCK DETECTED — READ CAREFULLY ===
Pattern analysis reveals high sacrifice probability on this Triple Lock game.
In gematria, a sacrifice occurs when the numerologically scripted team is encoded as the OFFERING — they lose, not win. The alignments mark them for defeat.

SACRIFICE SIGNALS ACTIVE:
${signalLines.join("\n")}

THE SCRIPTED SACRIFICE: ${engineFavoredTeam} (${engineFavoredSide} team — engine-favored)
THE RECOMMENDED BET:    ${opponent} (${opponentSide} team — fade the sacrifice)

INSTRUCTION: Bet AGAINST the Triple Lock team. Analyze ${opponent} as your pick.
In your JSON response:
  "pick": "${opponent}"
  "pickedSide": "${opponentSide}"
  "reasoning": start with "SACRIFICE LOCK: ..." and explain the sacrifice signals
Set confidence based on the strength of the sacrifice evidence above.`;
}

function formatSharpMoneySection(odds: ConsolidatedOdds | null, homeTeam: string, awayTeam: string): string | null {
  if (!odds) return null
  const {
    sharpHome, sharpAway, sharpOU,
    sharpBook, softBook,
    pinnacleImpliedHome, pinnacleImpliedAway,
    dkImpliedHome, dkImpliedAway,
    mlGapHome, mlGapAway, ouGap, pinnacleOverUnderLine,
  } = odds

  const hasSharp = sharpHome || sharpAway || sharpOU
  if (!hasSharp) return null

  const sharp = sharpBook ?? 'Pinnacle'
  const soft = softBook ?? 'DraftKings'
  const lines: string[] = []
  const pct = (n: number | null | undefined) => n != null ? `${(n * 100).toFixed(1)}%` : 'N/A'

  if (sharpHome && mlGapHome != null) {
    lines.push(
      `  ⚡ SHARP HOME (${homeTeam}): ${sharp} ${pct(pinnacleImpliedHome)} vs ${soft} ${pct(dkImpliedHome)} — gap +${(mlGapHome * 100).toFixed(1)}%`
    )
  }

  if (sharpAway && mlGapAway != null) {
    lines.push(
      `  ⚡ SHARP AWAY (${awayTeam}): ${sharp} ${pct(pinnacleImpliedAway)} vs ${soft} ${pct(dkImpliedAway)} — gap +${(mlGapAway * 100).toFixed(1)}%`
    )
  }

  if (sharpOU && ouGap != null && pinnacleOverUnderLine != null) {
    const softOU = Math.round((pinnacleOverUnderLine - ouGap) * 10) / 10
    lines.push(
      `  ⚡ SHARP ${sharpOU.toUpperCase()}: ${sharp} O/U ${pinnacleOverUnderLine} vs ${soft} ${softOU} — gap ${ouGap > 0 ? '+' : ''}${ouGap}`
    )
  }

  return `=== SHARP MONEY INDICATOR ===
${sharp} (low-vig/sharp book) line differs significantly from ${soft} (recreational book).
A meaningful gap indicates professional bettors have moved the ${sharp} line — treat as an informed market signal.
${lines.join('\n')}

Factor sharp action into your narrative and market analysis when deciding side and sizing.`
}

function formatProvenPatterns(patterns: ProvenPattern[]): string {
  const lines = patterns.map((p) => {
    const winPct = Math.round(p.win_rate * 100);
    const clvStr = p.avg_clv > 0 ? `+${p.avg_clv.toFixed(1)}%` : `${p.avg_clv.toFixed(1)}%`;
    const label = p.signal_name.replace(/_/g, ' ').toUpperCase();
    return `  ★ ${label} — ${winPct}% win rate (${p.wins}W-${p.losses}L, ${p.times_fired} bets) | Avg CLV: ${clvStr}`;
  });
  return `=== PROVEN PATTERNS (Your Historical Edge) ===
These signals have the highest verified win rate from past settled bets. Weight your analysis toward conditions where these patterns fire:
${lines.join("\n")}`;
}

function buildUserMessage(
  game: Game,
  analysis: GameAnalysis,
  bot?: "A" | "B" | "C" | "D",
  notes?: string,
  matchedPatterns?: MatchedPattern[],
  provenPatterns?: ProvenPattern[],
  sacrificeLock?: boolean,
  sacrificeSignals?: SacrificePattern[],
  h2hContext?: string,
): string {
  const moonIll = getMoonIllumination(new Date(game.game_date + "T17:00:00Z"));
  const fullMoon = isFullMoon(game.game_date);

  // ── Bot D (Narrative Scout) ──────────────────────────────────────────────
  // Receives ONLY: team names, league, date, start time, venue, records, odds.
  // No gematria numbers of any kind — no ciphers, no numerology, no alignment
  // counts, no lock type, no pattern cipher values. Bot D derives everything
  // from its own narrative/market/political methodology.
  if (bot === "D") {
    const sections: string[] = [];
    if (notes?.trim()) {
      sections.push(`=== DECODE JOURNAL (Sean's Notes) ===\n${notes.trim()}`);
    }
    sections.push(
      `=== GAME ===
${game.away_team} @ ${game.home_team}
League: ${game.league} | Date: ${game.game_date}${game.start_time ? ` | Time: ${game.start_time}` : ""}
Venue: ${analysis.venue}
Records: Home ${game.home_record ?? "N/A"} | Away ${game.away_record ?? "N/A"}
Moon: ${(moonIll * 100).toFixed(0)}% illumination${fullMoon ? " (FULL MOON)" : ""}`
    );
    if (game.is_playoff) {
      const gameSuffix = game.series_game_number ? `, Game ${game.series_game_number} of 7` : "";
      const roundLabel = game.playoff_round ? `${game.playoff_round}${gameSuffix}` : `Playoffs${gameSuffix}`;
      const seriesLine = game.series_record ? ` | Series: ${game.series_record}` : "";
      sections.push(`=== PLAYOFF CONTEXT ===\n${game.league} Playoffs — ${roundLabel}${seriesLine}`);
    }
    if (h2hContext) sections.push(h2hContext);
    sections.push(`=== ODDS ===\n${formatOdds(game.polymarket_odds)}`);
    const sharpSection = formatSharpMoneySection(game.polymarket_odds, game.home_team, game.away_team);
    if (sharpSection) sections.push(sharpSection);
    if (provenPatterns && provenPatterns.length > 0) {
      sections.push(formatProvenPatterns(provenPatterns));
    }
    if (sacrificeLock && sacrificeSignals && analysis.pickedSide && analysis.pickedSide !== "skip") {
      const engineFavored = analysis.pickedSide === "home" ? game.home_team : game.away_team;
      const opponent = analysis.pickedSide === "home" ? game.away_team : game.home_team;
      sections.push(formatSacrificeAlert(engineFavored, opponent, analysis.pickedSide as "home" | "away", sacrificeSignals));
    }
    return sections.join("\n\n");
  }

  // ── Bots A / B / C ───────────────────────────────────────────────────────
  const dn = analysis.dateNumerology;
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

  if (game.is_playoff) {
    const gameSuffix = game.series_game_number ? `, Game ${game.series_game_number} of 7` : "";
    const roundLabel = game.playoff_round ? `${game.playoff_round}${gameSuffix}` : `Playoffs${gameSuffix}`;
    const seriesLine = game.series_record ? ` | Series: ${game.series_record}` : "";
    sections.push(`=== PLAYOFF CONTEXT ===\n${game.league} Playoffs — ${roundLabel}${seriesLine}`);
  }

  if (h2hContext) sections.push(h2hContext);

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

  // Only Bot A gets the engine's Favored Side — B/C must reach their own
  // conclusion from their own methodology, not be anchored by the engine's pick.
  sections.push(
    `=== GEMATRIA ENGINE SUMMARY ===
Lock Type: ${lockLabel}
Home Alignments: ${analysis.homeAlignments.length}
Away Alignments: ${analysis.awayAlignments.length}
Confidence: ${analysis.gematriaConfidence}%${bot === "A" ? `\nFavored Side: ${analysis.pickedSide === "skip" ? "Neither" : analysis.pickedSide}` : ""}`
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

  if (provenPatterns && provenPatterns.length > 0) {
    sections.push(formatProvenPatterns(provenPatterns));
  }

  if (sacrificeLock && sacrificeSignals && analysis.pickedSide && analysis.pickedSide !== "skip") {
    const engineFavored = analysis.pickedSide === "home" ? game.home_team : game.away_team;
    const opponent = analysis.pickedSide === "home" ? game.away_team : game.home_team;
    sections.push(formatSacrificeAlert(engineFavored, opponent, analysis.pickedSide as "home" | "away", sacrificeSignals));
  }

  return sections.join("\n\n");
}

function buildSystemMessage(settings: GematriaSettings): string {
  const jsonInstructions = `
LOCK TIER TAXONOMY — Three conviction levels, each triggers different system behavior:

  "bet" + lock_type "triple_lock" — Highest conviction. 3+ cipher/pattern alignments converging. Your strongest call. Full position.
  "bet" + lock_type "double_lock" — Solid conviction. Clear cipher logic, 2+ alignments. Confident pick. Normal position.
  "lean" — Moderate signal. You see a directional edge but alignment is weaker, fewer pattern hits, or conviction doesn't justify a full position. Return action "lean" — the system will track this pick and measure your hit rate, but will NOT place a bet. Only use lean when you would genuinely take the bet at a smaller size if forced — not as a fallback when you're unsure. A lean is a real read, just less of it.
  "skip" — Signal below lean threshold. You have no meaningful directional read. Still include full reasoning explaining what you saw and why it didn't reach lean threshold.

RESPONSE FORMAT — You must respond with valid JSON only. No markdown, no explanation outside the JSON.
Return an array of trade decision objects. Each object must have:
{
  "action": "bet" | "lean" | "skip",
  "betType": "moneyline" | "over_under",
  "pick": "<team name or Over/Under X.X — required even on lean/skip, use your directional read>",
  "pickedSide": "home" | "away" | null,
  "odds": <american odds number or 0 if skipping>,
  "impliedProbability": <0-1>,
  "modelProbability": <0-1>,
  "ev": <expected value as decimal>,
  "units": <1-${settings.max_units_per_bet} if action is "bet", 0.5-1 if action is "lean", 0 if skipping>,
  "confidence": <0-100>,
  "reasoning": "<full analysis: signals observed, cipher hits, what the numbers say, directional read, and WHY this is a bet vs lean vs skip>"
}
IMPORTANT: Never leave reasoning empty. Never use "lean" as a hedge when you genuinely have no read — that is what "skip" is for. Lean means real signal at lower intensity.`;

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
  bot?: "A" | "B" | "C" | "D",
  notes?: string,
  matchedPatterns?: MatchedPattern[],
  provenPatterns?: ProvenPattern[],
  sacrificePatterns?: SacrificePattern[],
  h2hContext?: string,
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

  // ── Sacrifice detection ───────────────────────────────────────────────────
  // Only runs on Triple Lock games when we have historical sacrifice pattern data.
  let detectedSacrificeLock = false;
  let matchedSacrificeSignals: SacrificePattern[] = [];

  if (
    engineResult.lockType === "triple" &&
    bot &&
    sacrificePatterns &&
    sacrificePatterns.length > 0 &&
    engineResult.pickedSide !== "skip"
  ) {
    const allAlignments = [...engineResult.homeAlignments, ...engineResult.awayAlignments];
    const pickedSide = engineResult.pickedSide as "home" | "away";
    const pickedOdds = (() => {
      const o = game.polymarket_odds;
      if (!o) return null;
      return pickedSide === "home" ? o.moneylineHome : o.moneylineAway;
    })();

    const preData: PreAnalysisData = {
      pickedSide,
      fullMoon,
      pickedOdds,
      alignmentCount: allAlignments.length,
      alignmentCiphers: allAlignments.map((a) => a.cipher),
      alignmentValues: allAlignments.map((a) => a.value),
      alignmentTypes: allAlignments.map((a) => a.type),
    };

    const preSignals = new Set<string>(extractPreAnalysisSignals(preData));

    matchedSacrificeSignals = sacrificePatterns.filter(
      (p) =>
        preSignals.has(p.signal_name) &&
        p.sacrifice_rate >= SACRIFICE_RATE_THRESHOLD &&
        p.triple_lock_fires >= SACRIFICE_MIN_FIRES
    );

    if (matchedSacrificeSignals.length >= SACRIFICE_SIGNAL_COUNT) {
      detectedSacrificeLock = true;
      analysisResult.lockType = "sacrifice_lock";
      analysisResult.sacrificeLock = true;
      analysisResult.sacrificeSignals = matchedSacrificeSignals;
      console.log(
        `[sacrifice] Detected on ${game.away_team} @ ${game.home_team} for Bot ${bot} — ${matchedSacrificeSignals.length} signals (${matchedSacrificeSignals.map((s) => s.signal_name).join(", ")})`
      );
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  const systemMsg = buildSystemMessage(settings);
  const userMsg = buildUserMessage(
    game, engineResult, bot, notes, matchedPatterns, provenPatterns,
    detectedSacrificeLock, matchedSacrificeSignals.length > 0 ? matchedSacrificeSignals : undefined,
    h2hContext,
  );

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

  if (bot === "D") {
    // Log raw response so we can see exactly what Claude returns for Bot D
    console.log(`[claude-agent] Bot D raw response (${textBlock.text.length} chars): ${textBlock.text.substring(0, 800)}`);
  }

  const decisions = robustJsonParse(textBlock.text);

  if (bot === "D") {
    console.log(`[claude-agent] Bot D parsed ${decisions.length} decision(s): ${JSON.stringify(decisions.map(d => ({ action: d.action, pick: d.pick, confidence: d.confidence, odds: d.odds })))}`);
  }

  return { analysis: analysisResult, decisions };
}
