"use client";

import { useEffect, useState } from "react";
import { X, CheckCircle, AlertCircle, Clock } from "lucide-react";
import type { PreviewItem } from "@/app/api/settle/preview/route";

interface SettleModalProps {
  onClose: () => void;
  onSettled: (result: { settled: number; wins: number; losses: number; dailyPL: number }) => void;
}

function formatOdds(n: number | null): string {
  if (n == null) return "—";
  return n > 0 ? `+${n}` : String(n);
}

function resultBadge(result: PreviewItem["autoResult"], gameStatus: PreviewItem["gameStatus"]) {
  if (gameStatus === "in") {
    return <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-accent/20 text-accent">Live</span>;
  }
  if (gameStatus === "pre" || gameStatus === "unknown") {
    return <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-muted/20 text-muted">Not Final</span>;
  }
  if (result === "win")
    return <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-success/20 text-success">Win</span>;
  if (result === "loss")
    return <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-danger/20 text-danger">Loss</span>;
  if (result === "push")
    return <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-warning/20 text-warning">Push</span>;
  return <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-muted/20 text-muted">Void</span>;
}

export default function SettleModal({ onClose, onSettled }: SettleModalProps) {
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [settling, setSettling] = useState(false);
  // Manual closing line overrides keyed by trade id
  const [manualClosing, setManualClosing] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/settle/preview")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setItems(data.items ?? []);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const readyToSettle = items.filter((i) => i.gameStatus === "post");
  const notFinal = items.filter((i) => i.gameStatus !== "post");

  async function handleConfirmSettle() {
    setSettling(true);
    setError("");
    try {
      // Build closing lines map: use auto-fetched, fall back to manual entry
      const closingPayload = items
        .map((item) => {
          const cl =
            manualClosing[item.trade.id] !== undefined
              ? parseFloat(manualClosing[item.trade.id] ?? "")
              : item.closingLine;
          return cl != null && !isNaN(Number(cl))
            ? { id: item.trade.id, closing_line: Number(cl) }
            : null;
        })
        .filter(Boolean) as { id: string; closing_line: number }[];

      // Save closing lines first
      if (closingPayload.length > 0) {
        await fetch("/api/trades/clv", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trades: closingPayload }),
        });
      }

      // Settle
      const res = await fetch("/api/settle", { method: "POST" });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Settlement failed");
        return;
      }
      onSettled({
        settled: data.settled,
        wins: data.results?.wins ?? 0,
        losses: data.results?.losses ?? 0,
        dailyPL: data.dailyPL ?? 0,
      });
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSettling(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="card w-full max-w-2xl max-h-[88vh] overflow-y-auto relative">
        <button onClick={onClose} className="absolute top-3 right-3 text-muted hover:text-text">
          <X size={16} />
        </button>

        <h2 className="text-xs font-semibold uppercase tracking-wider mb-1 pr-6">Settle Bets</h2>

        {loading ? (
          <p className="text-xs text-muted text-center py-12 animate-pulse">
            Fetching final scores and closing lines…
          </p>
        ) : error ? (
          <p className="text-xs text-danger py-8 text-center">{error}</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted text-center py-8">No pending bets to settle.</p>
        ) : (
          <>
            {/* Summary banner */}
            <div className="flex gap-4 mb-4 text-[10px]">
              <span className="text-success flex items-center gap-1">
                <CheckCircle size={11} />
                {readyToSettle.length} ready to settle
              </span>
              {notFinal.length > 0 && (
                <span className="text-muted flex items-center gap-1">
                  <Clock size={11} />
                  {notFinal.length} game{notFinal.length > 1 ? "s" : ""} not final
                </span>
              )}
            </div>

            {/* Bet rows */}
            <div className="space-y-2 mb-5">
              {items.map((item) => {
                const { trade, homeScore, awayScore, gameStatus, autoResult, closingLine, clvPercent } = item;
                const game = trade.game;
                const isMl = trade.bet_type === "moneyline";
                const isPending = gameStatus !== "post";
                const hasAutoClosing = closingLine != null && manualClosing[trade.id] === undefined;
                const manualVal = manualClosing[trade.id];

                return (
                  <div
                    key={trade.id}
                    className={`border rounded-lg p-3 ${isPending ? "border-border opacity-60" : "border-border"}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Game info */}
                        <div className="text-[10px] text-muted truncate mb-0.5">
                          {game ? `${game.away_team} @ ${game.home_team}` : trade.game_id}
                          {" · "}{game?.league}
                          {" · "}<span className="uppercase">{trade.bot}</span>
                        </div>
                        {/* Pick */}
                        <div className="text-sm font-medium truncate">{trade.pick}</div>
                        {/* Score + result */}
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {resultBadge(autoResult, gameStatus)}
                          {gameStatus === "post" && homeScore != null && (
                            <span className="text-[10px] text-muted font-[family-name:var(--font-mono)]">
                              {game ? `${game.away_team} ${awayScore} – ${homeScore} ${game.home_team}` : `${awayScore}–${homeScore}`}
                            </span>
                          )}
                          {gameStatus === "in" && (
                            <span className="text-[10px] text-muted font-[family-name:var(--font-mono)]">
                              {awayScore}–{homeScore}
                            </span>
                          )}
                        </div>
                        {/* CLV */}
                        {clvPercent != null && !manualVal && (
                          <div className="text-[10px] text-muted mt-0.5">
                            CLV:{" "}
                            <span className={clvPercent > 0 ? "text-success" : clvPercent < 0 ? "text-danger" : "text-muted"}>
                              {clvPercent > 0 ? "+" : ""}{clvPercent}%
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Closing line column */}
                      <div className="flex-shrink-0 w-28 text-right">
                        <div className="text-[10px] text-muted mb-1 flex items-center justify-end gap-1">
                          {hasAutoClosing ? (
                            <><CheckCircle size={9} className="text-success" /> Auto-fetched</>
                          ) : (
                            <><AlertCircle size={9} className="text-muted" /> Manual</>
                          )}
                        </div>
                        <div className="text-[10px] text-muted mb-1">
                          Closing {isMl ? "odds" : "line"}
                        </div>
                        <input
                          type="number"
                          step={isMl ? "1" : "0.5"}
                          placeholder={hasAutoClosing ? (isMl ? formatOdds(closingLine) : String(closingLine)) : (isMl ? "-110" : "215.5")}
                          value={manualVal ?? (hasAutoClosing ? String(closingLine) : "")}
                          onChange={(e) =>
                            setManualClosing((prev) => ({ ...prev, [trade.id]: e.target.value }))
                          }
                          className="w-full bg-surface border border-border rounded px-2 py-1 text-xs text-text placeholder:text-muted focus:outline-none focus:border-accent/50"
                        />
                        {isMl && (
                          <div className="text-[10px] text-muted mt-0.5 text-right">
                            Open: {formatOdds(trade.opening_line)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {error && <p className="text-xs text-danger mb-3">{error}</p>}

            {/* Actions */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted">
                {readyToSettle.length === 0
                  ? "No games are final yet"
                  : `${readyToSettle.length} bet${readyToSettle.length > 1 ? "s" : ""} will be settled`}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-1.5 text-xs text-muted hover:text-text transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmSettle}
                  disabled={settling || readyToSettle.length === 0}
                  className="px-4 py-1.5 bg-success/20 border border-success/30 hover:bg-success/30 rounded text-xs font-medium transition-colors disabled:opacity-40"
                >
                  {settling ? "Settling…" : `Confirm & Settle ${readyToSettle.length > 0 ? readyToSettle.length : ""} Bet${readyToSettle.length !== 1 ? "s" : ""}`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
