import type { PaperTrade } from "@/lib/types";
import { calculatePayout } from "@/lib/paper-trading";

type TradeResult = "win" | "loss" | "push" | "void";

/**
 * Extract the side ("over" | "under") and the numeric line from a pick string.
 * Handles: "Over 215.5", "Under 6.5", "over215.5", "215.5 Over", "215.5 Under".
 */
export function parseOverUnderLine(
  pick: string
): { side: "over" | "under"; line: number } | null {
  // "Over 215.5" / "over215.5"
  const fwd = pick.match(/\b(over|under)\s*([\d]+(?:\.[\d]+)?)/i);
  if (fwd) {
    return { side: fwd[1]!.toLowerCase() as "over" | "under", line: parseFloat(fwd[2]!) };
  }
  // "215.5 Over" / "215.5 Under"
  const rev = pick.match(/([\d]+(?:\.[\d]+)?)\s+(over|under)\b/i);
  if (rev) {
    return { side: rev[2]!.toLowerCase() as "over" | "under", line: parseFloat(rev[1]!) };
  }
  return null;
}

/**
 * Determine trade result from final scores.
 * Returns 'void' if scores are null or the bet type can't be resolved.
 */
export function determineTradeResult(
  trade: PaperTrade,
  homeScore: number | null,
  awayScore: number | null
): TradeResult {
  if (homeScore == null || awayScore == null) return "void";

  if (trade.bet_type === "over_under") {
    const parsed = parseOverUnderLine(trade.pick);
    if (!parsed) return "void";
    const total = homeScore + awayScore;
    if (total === parsed.line) return "push";
    if (parsed.side === "over") return total > parsed.line ? "win" : "loss";
    return total < parsed.line ? "win" : "loss";
  }

  // moneyline
  if (trade.picked_side === "home") {
    if (homeScore > awayScore) return "win";
    if (homeScore < awayScore) return "loss";
    return "push";
  }
  if (trade.picked_side === "away") {
    if (awayScore > homeScore) return "win";
    if (awayScore < homeScore) return "loss";
    return "push";
  }

  return "void";
}

/**
 * Calculate dollar P&L for a settled trade.
 */
export function profitLossForSettledTrade(
  trade: PaperTrade,
  result: TradeResult
): number {
  if (result === "push" || result === "void") return 0;
  if (result === "loss") return -trade.stake;
  if (!trade.odds) return 0; // no odds recorded — can't compute payout
  return calculatePayout(trade.stake, trade.odds);
}
