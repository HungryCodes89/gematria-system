"use client";

import { useEffect, useState } from "react";
import { X, Shield, Lock, Minus, TrendingUp } from "lucide-react";
import type { Game, PaperTrade } from "@/lib/types";

interface GameDetailModalProps {
  game: Game;
  onClose: () => void;
}

const BOT_LABELS: Record<string, string> = {
  A: "Bot A — Basic",
  B: "Bot B — HUNGRY",
  C: "Bot C — AJ",
  D: "Bot D — Narrative",
};

const BOT_COLORS: Record<string, string> = {
  A: "bg-zinc-700/50 text-zinc-300",
  B: "bg-accent/20 text-accent",
  C: "bg-purple-500/20 text-purple-400",
  D: "bg-orange-500/20 text-orange-400",
};

const LOCK_CONFIG: Record<string, { label: string; color: string; Icon: typeof Shield }> = {
  triple_lock: { label: "TRIPLE LOCK", color: "text-accent", Icon: Shield },
  double_lock: { label: "DOUBLE LOCK", color: "text-blue-400", Icon: Lock },
  single_lock: { label: "SINGLE LOCK", color: "text-zinc-400", Icon: Lock },
  no_lock:     { label: "NO LOCK",     color: "text-zinc-500", Icon: Minus },
  manual:      { label: "MANUAL",      color: "text-warning",  Icon: TrendingUp },
};

function formatOdds(odds: number | null): string {
  if (odds == null) return "—";
  return odds > 0 ? `+${odds}` : String(odds);
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
    }) + " ET";
  } catch { return ""; }
}

export default function GameDetailModal({ game, onClose }: GameDetailModalProps) {
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/trades/game/${game.id}`)
      .then((r) => r.json())
      .then((d) => setTrades(d.trades ?? []))
      .finally(() => setLoading(false));
  }, [game.id]);

  const lockKey = game.lock_type ?? "no_lock";
  const lockCfg = LOCK_CONFIG[lockKey] ?? LOCK_CONFIG.no_lock;
  const LockIcon = lockCfg.Icon;

  const statusLabel =
    game.status === "final" ? "FINAL" :
    game.status === "in_progress" ? "LIVE" :
    formatTime(game.start_time);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto relative">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-muted hover:text-text"
        >
          <X size={16} />
        </button>

        {/* Header */}
        <div className="mb-4 pr-6">
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              game.league === "NBA" ? "bg-orange-500/20 text-orange-400" :
              game.league === "NHL" ? "bg-blue-500/20 text-blue-400" :
              "bg-red-500/20 text-red-400"
            }`}>
              {game.league}
            </span>
            {game.is_primetime && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400">
                PRIMETIME
              </span>
            )}
            <span className="text-xs text-muted ml-auto">{statusLabel}</span>
          </div>

          <div className="text-center mb-1">
            <div className="text-sm text-muted">{game.away_team}</div>
            <div className="text-[10px] text-muted my-0.5">@</div>
            <div className="text-base font-semibold">{game.home_team}</div>
          </div>

          {(game.status === "in_progress" || game.status === "final") && game.home_score != null && (
            <div className="text-center mb-1">
              <span className="font-[family-name:var(--font-mono)] text-xl font-bold">
                {game.away_score} — {game.home_score}
              </span>
            </div>
          )}

          {game.venue && (
            <div className="text-[10px] text-muted text-center">{game.venue}</div>
          )}
        </div>

        {/* Engine Assessment */}
        {game.analyzed && (
          <div className="border border-border rounded-lg p-3 mb-4">
            <div className="text-[10px] uppercase tracking-wider text-muted mb-2">
              Gematria Engine
            </div>
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-1.5 font-semibold text-sm ${lockCfg.color}`}>
                <LockIcon size={14} />
                {lockCfg.label}
              </div>
              {game.gematria_confidence != null && game.gematria_confidence > 0 && (
                <span className="text-xs text-muted">
                  {game.gematria_confidence}% confidence
                </span>
              )}
            </div>
          </div>
        )}

        {/* Trades */}
        {loading ? (
          <div className="text-xs text-muted text-center py-6">Loading analysis…</div>
        ) : trades.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-muted">
              {game.analyzed ? "Analyzed — no picks placed" : "Not yet analyzed"}
            </p>
            {!game.analyzed && (
              <p className="text-xs text-muted mt-1">
                Run analysis to see bot leans and reasoning for this game
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Real bets first */}
            {trades.filter(t => t.bet_type !== "analysis").map((trade) => (
              <div key={trade.id} className="border border-border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${BOT_COLORS[trade.bot] ?? BOT_COLORS.A}`}>
                    {BOT_LABELS[trade.bot] ?? `Bot ${trade.bot}`}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    trade.result === "win"  ? "bg-success/20 text-success" :
                    trade.result === "loss" ? "bg-danger/20 text-danger" :
                    trade.result === "push" ? "bg-warning/20 text-warning" :
                    "bg-zinc-700/40 text-zinc-400"
                  }`}>
                    {(trade.result ?? "tracked").toUpperCase()}
                  </span>
                </div>
                <div className="flex items-baseline gap-3 mb-2 flex-wrap">
                  <span className="font-semibold text-sm text-text">{trade.pick}</span>
                  <span className="text-xs text-muted">{trade.bet_type === "over_under" ? "O/U" : "ML"}</span>
                  <span className="font-[family-name:var(--font-mono)] text-xs text-text">
                    {formatOdds(trade.odds)}
                  </span>
                  <span className="text-xs text-muted">{trade.units}u</span>
                  {trade.confidence != null && (
                    <span className="text-xs text-muted">{Math.round(trade.confidence)}% conf</span>
                  )}
                  {trade.result !== "pending" && trade.profit_loss != null && (
                    <span className={`text-xs font-semibold ml-auto ${trade.profit_loss >= 0 ? "text-success" : "text-danger"}`}>
                      {trade.profit_loss >= 0 ? "+" : ""}${trade.profit_loss.toFixed(2)}
                    </span>
                  )}
                </div>
                {trade.reasoning && (
                  <div className="bg-black/20 rounded p-2.5">
                    <div className="text-[10px] uppercase tracking-wider text-muted mb-1.5">Reasoning</div>
                    <p className="text-xs text-muted leading-relaxed whitespace-pre-wrap">{trade.reasoning}</p>
                  </div>
                )}
              </div>
            ))}

            {/* Pass leans — always shown, marked clearly */}
            {trades.filter(t => t.bet_type === "analysis").map((trade) => (
              <div key={trade.id} className="border border-border/50 rounded-lg p-3 opacity-80">
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${BOT_COLORS[trade.bot] ?? BOT_COLORS.A}`}>
                    {BOT_LABELS[trade.bot] ?? `Bot ${trade.bot}`}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-800/60 text-zinc-500">
                    PASS
                  </span>
                </div>
                <div className="flex items-baseline gap-3 mb-2 flex-wrap">
                  <span className="font-semibold text-sm text-muted">
                    Lean: {trade.pick}
                  </span>
                  {trade.confidence != null && (
                    <span className="text-xs text-muted">{Math.round(trade.confidence)}% signal</span>
                  )}
                  {trade.lock_type && trade.lock_type !== "no_lock" && (
                    <span className="text-xs text-zinc-600 uppercase">{trade.lock_type.replace("_", " ")}</span>
                  )}
                </div>
                {trade.reasoning && (
                  <div className="bg-black/10 rounded p-2.5">
                    <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-1.5">Analysis</div>
                    <p className="text-xs text-zinc-500 leading-relaxed whitespace-pre-wrap">{trade.reasoning}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
