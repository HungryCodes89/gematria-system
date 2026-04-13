import type { GematriaSettings } from "@/lib/types";

/**
 * Check whether a new bet is allowed given current bankroll state and limits.
 */
export function canPlaceBet(
  balance: number,
  todayUnits: number,
  units: number,
  settings: GematriaSettings
): boolean {
  const stake = calculateStake(units, settings.unit_size);
  if (balance < stake) return false;
  if (todayUnits + units > settings.max_daily_units) return false;
  if (units > settings.max_units_per_bet) return false;
  return true;
}

/**
 * Simple stake calculation: units × unit size.
 */
export function calculateStake(units: number, unitSize: number): number {
  return units * unitSize;
}

/**
 * Calculate win amount from American odds.
 * Positive odds (e.g. +150): stake × (odds / 100)
 * Negative odds (e.g. -130): stake × (100 / |odds|)
 */
export function calculatePayout(stake: number, odds: number): number {
  if (odds > 0) return stake * (odds / 100);
  return stake * (100 / Math.abs(odds));
}
