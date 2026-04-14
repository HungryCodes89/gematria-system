"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { PaperTrade } from "@/lib/types";
import LockBadge from "./LockBadge";

interface TradeCardProps {
  trade: PaperTrade;
}

const RESULT_STYLES: Record<string, string> = {
  pending: "border-l-warning",
  win: "border-l-success",
  loss: "border-l-danger",
  push: "border-l-zinc-500",
  void: "border-l-zinc-700",
};

const RESULT_BADGES: Record<string, { label: string; cls: string }> = {
  pending: { label: "PENDING", cls: "bg-warning/20 text-warning" },
  win: { label: "WIN", cls: "bg-success/20 text-success" },
  loss: { label: "LOSS", cls: "bg-danger/20 text-danger" },
  push: { label: "PUSH", cls: "bg-zinc-600/20 text-zinc-400" },
  void: { label: "VOID", cls: "bg-zinc-700/20 text-zinc-500" },
};

function formatOdds(odds: number | null): string {
  if (odds == null) return "—";
  return odds > 0 ? `+${odds}` : String(odds);
}

function formatPL(pl: number): string {
  if (pl === 0) return "$0";
  return pl > 0 ? `+$${pl.toFixed(0)}` : `-$${Math.abs(pl).toFixed(0)}`;
}

function formatClv(clv: number): string {
  return clv >= 0 ? `+${clv.toFixed(2)}` : clv.toFixed(2);
}

export default function TradeCard({ trade }: TradeCardProps) {
  const [expanded, setExpanded] = useState(false);
  const game = trade.game;
  const resultStyle = RESULT_STYLES[trade.result] || "";
  const badge = RESULT_BADGES[trade.result] || RESULT_BADGES.pending;

  const dateStr = trade.placed_at
    ? new Date(trade.placed_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "";

  return (
    <div className={`card border-l-2 ${resultStyle}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-muted bg-surface">
              {game?.league || ""}
            </span>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                trade.bot === "B"
                  ? "bg-accent/20 text-accent"
                  : trade.bot === "C"
                  ? "bg-purple-500/20 text-purple-400"
                  : "bg-surface text-muted"
              }`}
            >
              BOT {trade.bot || "A"}
            </span>
            <span className="text-xs text-muted">{dateStr}</span>
          </div>
          <div className="text-sm mb-1">
            {game
              ? `${game.away_team} at ${game.home_team}`
              : trade.game_id}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{trade.pick}</span>
            <LockBadge lockType={trade.lock_type} />
          </div>
        </div>
        <div className="text-right">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>
            {badge.label}
          </span>
          <div className="mt-2 font-[family-name:var(--font-mono)] text-xs text-muted">
            {formatOdds(trade.odds)}
          </div>
          <div className="font-[family-name:var(--font-mono)] text-sm font-bold">
            {trade.result === "pending" ? `$${trade.stake}` : ""}
            {trade.result !== "pending" && (
              <span className={trade.profit_loss >= 0 ? "text-success" : "text-danger"}>
                {formatPL(trade.profit_loss)}
              </span>
            )}
          </div>
          {trade.clv_percent != null && (
            <div
              className={`font-[family-name:var(--font-mono)] text-[10px] mt-0.5 ${
                trade.clv_percent >= 0 ? "text-success" : "text-danger"
              }`}
            >
              CLV {formatClv(trade.clv_percent)}
            </div>
          )}
        </div>
      </div>

      {trade.reasoning && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-[10px] text-muted mt-2 hover:text-text transition-colors"
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {expanded ? "Hide reasoning" : "Show reasoning"}
        </button>
      )}
      {expanded && trade.reasoning && (
        <div className="mt-2 text-xs text-muted leading-relaxed border-t border-border pt-2">
          {trade.reasoning}
        </div>
      )}
    </div>
  );
}
