// ── Game (DB row) ──

export interface Game {
  id: string;
  league: "NBA" | "NHL" | "MLB";
  game_date: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  status: "scheduled" | "pre" | "in_progress" | "final";
  venue: string | null;
  start_time: string | null;
  home_record: string | null;
  away_record: string | null;
  home_wins: number;
  away_wins: number;
  home_losses: number | null;
  away_losses: number | null;
  polymarket_odds: ConsolidatedOdds | null;
  is_full_moon: boolean;
  is_primetime: boolean;
  analyzed: boolean;
  lock_type: string | null;
  gematria_confidence: number | null;
  created_at?: string;
  updated_at?: string;
}

// ── Odds (cached on game row as JSONB) ──

export interface BookOddsLine {
  moneylineHome: number | null;
  moneylineAway: number | null;
  overUnderLine: number | null;
  overOdds: number | null;
  underOdds: number | null;
}

export interface ConsolidatedOdds {
  // Polymarket base
  moneylineHome: number | null;
  moneylineAway: number | null;
  spreadLine: number | null;
  spreadHomeOdds: number | null;
  spreadAwayOdds: number | null;
  overUnderLine: number | null;
  overOdds: number | null;
  underOdds: number | null;
  impliedProbHome: number | null;
  impliedProbAway: number | null;
  // The Odds API — per-book lines and best available
  books?: Record<string, BookOddsLine> | null;
  bestMoneylineHome?: number | null;
  bestMoneylineAway?: number | null;
  bestBookHome?: string | null;
  bestBookAway?: string | null;
  bestOverOdds?: number | null;
  bestUnderOdds?: number | null;
  bestOverLine?: number | null;
  pinnacleMoneylineHome?: number | null;
  pinnacleMoneylineAway?: number | null;
  pinnacleOverUnderLine?: number | null;
  // Sharp money indicator (sharpest book vs softest book by vig)
  sharpHome?: boolean | null;
  sharpAway?: boolean | null;
  sharpOU?: 'over' | 'under' | null;
  sharpBook?: string | null;  // which book is the sharp reference (lowest vig)
  softBook?: string | null;   // which book is the soft reference (highest vig)
  pinnacleImpliedHome?: number | null;  // sharp-book implied prob
  pinnacleImpliedAway?: number | null;
  dkImpliedHome?: number | null;        // soft-book implied prob
  dkImpliedAway?: number | null;
  mlGapHome?: number | null;
  mlGapAway?: number | null;
  ouGap?: number | null;
}

// ── Trade Decision (Claude output) ──

export interface TradeDecision {
  action: "bet" | "skip";
  betType: "moneyline" | "over_under";
  pick: string;
  pickedSide: "home" | "away" | null;
  odds: number;
  impliedProbability: number;
  modelProbability: number;
  ev: number;
  units: number;
  confidence: number;
  reasoning: string;
}

// ── Paper Trade (DB row) ──

export interface PaperTrade {
  id: string;
  game_id: string;
  bot: "A" | "B" | "C" | "D";
  bet_type: "moneyline" | "over_under" | "analysis";
  pick: string;
  picked_side: "home" | "away" | null;
  odds: number | null;
  implied_probability: number | null;
  model_probability: number | null;
  ev: number | null;
  units: number;
  stake: number;
  potential_profit: number | null;
  result: "pending" | "win" | "loss" | "push" | "void" | "pass";
  profit_loss: number;
  confidence: number | null;
  lock_type: string | null;
  reasoning: string | null;
  opening_line: number | null;
  closing_line: number | null;
  clv_percent: number | null;
  strategy_version: string;
  placed_at: string;
  settled_at: string | null;
  game?: Game;
}

// ── Bankroll Ledger Row ──

export interface LedgerRow {
  id: string;
  date: string;
  balance: number;
  daily_pl: number;
  wins: number;
  losses: number;
  bets_placed: number;
}

// ── Gematria Settings (singleton) ──

export interface GematriaSettings {
  // Bot A (basic cipher)
  system_prompt: string;
  bet_rules: string;
  model: string;
  // Bot B (HUNGRY System)
  bot_b_system_prompt: string;
  bot_b_bet_rules: string;
  bot_b_model: string;
  // Bot C (AJ Wordplay)
  bot_c_system_prompt: string;
  bot_c_bet_rules: string;
  bot_c_model: string;
  // Bot D (Narrative Scout)
  bot_d_system_prompt: string;
  bot_d_bet_rules: string;
  bot_d_model: string;
  // Shared sizing / limits
  max_units_per_bet: number;
  max_daily_units: number;
  unit_size: number;
  min_confidence: number;
  auto_bet_triple_locks: boolean;
  auto_bet_double_locks: boolean;
  auto_bet_single_locks: boolean;
  starting_bankroll: number;
}

// ── Analysis Engine Output ──

export type LockType =
  | "triple_lock"
  | "double_lock"
  | "single_lock"
  | "sacrifice_lock"
  | "no_lock";

export interface Alignment {
  type: string;
  cipherName: string;
  cipherValue: number;
  dateMethod: string;
  dateValue: number;
  weight?: number;
}

export interface TeamGematria {
  teamName: string;
  fullName: string;
  city: string;
  abbreviation: string;
  cipherValues: Record<string, number>;
  alignments: Alignment[];
  alignmentCount: number;
}

export interface GameAnalysis {
  gameId: string;
  league: string;
  date: Date;
  homeTeam: TeamGematria;
  awayTeam: TeamGematria;
  lockType: LockType;
  gematriaConfidence: number;
  pickedSide: "home" | "away" | null;
  alignmentCount: number;
  homeAlignmentCount: number;
  awayAlignmentCount: number;
}

// ── Gematria Types ──

export interface GematriaResult {
  ordinal: number;
  reduction: number;
  reverseOrdinal: number;
  reverseReduction: number;
}

export interface DateNumerology {
  fullDate: number;
  reducedYear: number;
  singleDigits: number;
  shortYear: number;
  monthDay: number;
}

// ── Bot Reconciliation ──

export interface BotDecision {
  bot: "A" | "B" | "C" | "D";
  lock_type: LockType;
  bet_type: "moneyline" | "over_under";
  pick: string;
  picked_side: "home" | "away" | null;
  odds: number;
  implied_probability: number;
  model_probability: number;
  ev: number;
  units: number;
  confidence: number;
  reasoning: string;
}

export interface ReconciledDecision extends BotDecision {
  convergence_count: number;
  convergent_bots: ("A" | "B" | "C" | "D")[];
  sizing_note: string | null;
}
