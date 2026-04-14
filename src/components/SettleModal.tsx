"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { PaperTrade } from "@/lib/types";

interface SettleModalProps {
  onClose: () => void;
  onSettled: (result: { settled: number; wins: number; losses: number; dailyPL: number }) => void;
}

function formatOdds(n: number | null): string {
  if (n == null) return "—";
  return n > 0 ? `+${n}` : String(n);
}

export default function SettleModal({ onClose, onSettled }: SettleModalProps) {
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState<Record<string, string>>({});
  const [settling, setSettling] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/trades/live")
      .then((r) => r.json())
      .then((d) => setTrades(d.trades ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function handleSettle() {
    setSettling(true);
    setError("");
    try {
      // Save any entered closing lines first
      const entries = Object.entries(closing).filter(([, v]) => v.trim() !== "");
      if (entries.length > 0) {
        const payload = entries
          .map(([id, v]) => ({ id, closing_line: parseFloat(v) }))
          .filter((e) => !isNaN(e.closing_line));

        if (payload.length > 0) {
          await fetch("/api/trades/clv", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ trades: payload }),
          });
        }
      }

      // Then settle
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

  const enteredCount = Object.values(closing).filter((v) => v.trim() !== "").length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="card w-full max-w-lg max-h-[85vh] overflow-y-auto relative">
        <button onClick={onClose} className="absolute top-3 right-3 text-muted hover:text-text">
          <X size={16} />
        </button>

        <h2 className="text-xs font-semibold uppercase tracking-wider mb-1 pr-6">Settle Bets</h2>
        <p className="text-[10px] text-muted mb-4">
          Optionally enter the closing line for each bet to track CLV. Leave blank to settle without CLV.
        </p>

        {loading ? (
          <p className="text-xs text-muted text-center py-8">Loading pending bets…</p>
        ) : trades.length === 0 ? (
          <p className="text-xs text-muted text-center py-8">No pending bets to settle.</p>
        ) : (
          <div className="space-y-2 mb-4">
            {trades.map((trade) => {
              const game = trade.game;
              const isMl = trade.bet_type === "moneyline";
              return (
                <div key={trade.id} className="border border-border rounded-lg p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-muted truncate mb-0.5">
                        {game ? `${game.away_team} @ ${game.home_team}` : trade.game_id}
                        {" · "}{game?.league}
                        {" · "}<span className="uppercase">{trade.bot}</span>
                      </div>
                      <div className="text-sm font-medium truncate">{trade.pick}</div>
                      <div className="text-[10px] text-muted mt-0.5">
                        {isMl ? "Moneyline" : "O/U"} · Opening:{" "}
                        <span className="font-[family-name:var(--font-mono)]">
                          {trade.opening_line != null
                            ? isMl ? formatOdds(trade.opening_line) : trade.opening_line
                            : "—"}
                        </span>
                      </div>
                    </div>
                    <div className="flex-shrink-0 w-24">
                      <label className="block text-[10px] text-muted mb-1">
                        Closing {isMl ? "odds" : "line"}
                      </label>
                      <input
                        type="number"
                        step={isMl ? "1" : "0.5"}
                        placeholder={isMl ? "-110" : "215.5"}
                        value={closing[trade.id] ?? ""}
                        onChange={(e) =>
                          setClosing((prev) => ({ ...prev, [trade.id]: e.target.value }))
                        }
                        className="w-full bg-surface border border-border rounded px-2 py-1 text-xs text-text placeholder:text-muted focus:outline-none focus:border-accent/50"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {error && <p className="text-xs text-danger mb-3">{error}</p>}

        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted">
            {enteredCount > 0 ? `${enteredCount} closing line${enteredCount > 1 ? "s" : ""} entered` : "No closing lines entered"}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs text-muted hover:text-text transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSettle}
              disabled={settling || trades.length === 0}
              className="px-4 py-1.5 bg-success/20 border border-success/30 hover:bg-success/30 rounded text-xs font-medium transition-colors disabled:opacity-40"
            >
              {settling ? "Settling…" : "Settle Bets"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
