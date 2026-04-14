"use client";

import { RefreshCw } from "lucide-react";
import type { Game, PaperTrade } from "@/lib/types";
import LockBadge from "./LockBadge";

interface GameCardProps {
  game: Game;
  trade?: PaperTrade;
  onReanalyze?: () => void;
  reanalyzing?: boolean;
  onClick?: () => void;
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
    }) + " ET";
  } catch {
    return "";
  }
}

function formatOdds(odds: number | null): string {
  if (odds == null) return "—";
  return odds > 0 ? `+${odds}` : String(odds);
}

const LEAGUE_COLORS: Record<string, string> = {
  NBA: "bg-orange-500/20 text-orange-400",
  NHL: "bg-blue-500/20 text-blue-400",
  MLB: "bg-red-500/20 text-red-400",
};

export default function GameCard({ game, trade, onReanalyze, reanalyzing, onClick }: GameCardProps) {
  const odds = game.polymarket_odds;
  const statusDisplay =
    game.status === "final"
      ? "FINAL"
      : game.status === "in_progress"
        ? "LIVE"
        : formatTime(game.start_time);

  const statusColor =
    game.status === "in_progress"
      ? "text-warning"
      : game.status === "final"
        ? "text-muted"
        : "text-text";

  return (
    <div
      onClick={onClick}
      className={`card hover:border-border-accent transition-colors ${
        trade ? "border-l-2 border-l-success" : ""
      } ${onClick ? "cursor-pointer" : ""}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${LEAGUE_COLORS[game.league] || ""}`}
          >
            {game.league}
          </span>
          {game.is_primetime && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400">
              PT
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onReanalyze && (
            <button
              onClick={onReanalyze}
              disabled={reanalyzing}
              title="Re-analyze this game"
              className="text-muted hover:text-accent transition-colors disabled:opacity-40"
            >
              <RefreshCw size={11} className={reanalyzing ? "animate-spin" : ""} />
            </button>
          )}
          <span className={`text-xs font-medium ${statusColor}`}>
            {statusDisplay}
          </span>
        </div>
      </div>

      {/* Teams */}
      <div className="text-center mb-2">
        <div className="text-sm text-muted">{game.away_team}</div>
        <div className="text-[10px] text-muted my-0.5">at</div>
        <div className="text-sm font-semibold">{game.home_team}</div>
      </div>

      {/* Score */}
      {(game.status === "in_progress" || game.status === "final") &&
        game.home_score != null && (
          <div className="text-center mb-2">
            <span className="font-[family-name:var(--font-mono)] text-lg font-bold">
              {game.away_score} — {game.home_score}
            </span>
          </div>
        )}

      {/* Venue */}
      {game.venue && (
        <div className="text-[10px] text-muted text-center mb-3 truncate">
          {game.venue}
        </div>
      )}

      {/* Lock badge + confidence */}
      {game.analyzed && (
        <div className="flex items-center justify-center gap-2 mb-2">
          <LockBadge lockType={trade?.lock_type || game.lock_type || "no_lock"} />
          {(trade?.confidence != null || game.gematria_confidence != null) && (
            <span className="text-[10px] text-muted">
              {Math.round(trade?.confidence ?? game.gematria_confidence ?? 0)}%
            </span>
          )}
        </div>
      )}

      {/* Odds */}
      {odds && (odds.moneylineHome != null || odds.overUnderLine != null) && (
        <div className="text-[10px] text-muted text-center mb-2 font-[family-name:var(--font-mono)]">
          {odds.moneylineHome != null && (
            <span>
              ML: {formatOdds(odds.moneylineHome)} / {formatOdds(odds.moneylineAway)}
            </span>
          )}
          {odds.overUnderLine != null && (
            <span className="ml-2">O/U: {odds.overUnderLine}</span>
          )}
        </div>
      )}

      {/* Trade info */}
      {trade && (
        <div className="text-xs text-success text-center font-medium mt-1 pt-2 border-t border-border">
          BET: {trade.pick}, {trade.units}u
        </div>
      )}
    </div>
  );
}
