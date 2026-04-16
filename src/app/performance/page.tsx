"use client";

import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import { Activity, TrendingUp, TrendingDown, Minus, Flame, Snowflake, RefreshCw } from "lucide-react";
import { SIGNAL_LABELS } from "@/lib/signal-extractor";

type BotId = "A" | "B" | "C" | "D";

interface SignalRow {
  signal_name: string;
  times_fired: number;
  wins: number;
  losses: number;
  pushes: number;
  win_rate: number;
  avg_clv: number;
  weight_score: number;
  last_updated: string;
}

interface BotStats {
  totalBets: number;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number;
  avgClv: number;
  signals: SignalRow[];
  lastFeedback: string | null;
}

interface PerformanceData {
  bots: Record<BotId, BotStats>;
  systemStatus: "active" | "warming" | "cold";
  totalTracked: number;
}

const BOT_NAMES: Record<BotId, string> = {
  A: "Bot A — Gematria Core",
  B: "Bot B — Zach Hubbard",
  C: "Bot C — AJ Wordplay",
  D: "Bot D — Narrative Scout",
};

const BOT_COLORS: Record<BotId, string> = {
  A: "text-blue-400 border-blue-500/30 bg-blue-500/5",
  B: "text-cyan-400 border-cyan-500/30 bg-cyan-500/5",
  C: "text-purple-400 border-purple-500/30 bg-purple-500/5",
  D: "text-orange-400 border-orange-500/30 bg-orange-500/5",
};

type SignalStatus = "hot" | "warm" | "neutral" | "cold" | "frozen" | "new";

function getSignalStatus(row: SignalRow): SignalStatus {
  if (row.times_fired < 5) return "new";
  const wr = row.win_rate;
  if (wr >= 0.62) return "hot";
  if (wr >= 0.54) return "warm";
  if (wr <= 0.36) return "frozen";
  if (wr <= 0.44) return "cold";
  return "neutral";
}

function SignalStatusBadge({ status }: { status: SignalStatus }) {
  if (status === "hot") return <span className="flex items-center gap-1 text-warning text-[10px] font-bold"><Flame size={10} />HOT</span>;
  if (status === "warm") return <span className="flex items-center gap-1 text-success text-[10px]"><TrendingUp size={10} />WARM</span>;
  if (status === "cold") return <span className="flex items-center gap-1 text-danger text-[10px]"><TrendingDown size={10} />COLD</span>;
  if (status === "frozen") return <span className="flex items-center gap-1 text-blue-400 text-[10px] font-bold"><Snowflake size={10} />DEAD</span>;
  if (status === "new") return <span className="text-muted text-[10px]">—</span>;
  return <span className="flex items-center gap-1 text-muted text-[10px]"><Minus size={10} />FLAT</span>;
}

function WinRateBar({ rate, decided }: { rate: number; decided: number }) {
  if (decided === 0) return <div className="h-1 bg-surface-2 rounded-full w-full opacity-30" />;
  const pct = Math.round(rate * 100);
  const color = pct >= 55 ? "bg-success" : pct >= 50 ? "bg-accent" : pct >= 45 ? "bg-warning" : "bg-danger";
  return (
    <div className="h-1 bg-surface rounded-full w-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function BotCard({ bot, stats }: { bot: BotId; stats: BotStats }) {
  const [expanded, setExpanded] = useState(true);
  const decided = stats.wins + stats.losses;
  const winPct = decided > 0 ? Math.round((stats.wins / decided) * 100) : 0;
  const hasSignals = stats.signals.length > 0;
  const colorClass = BOT_COLORS[bot];

  return (
    <div className={`card border ${colorClass} mb-4`}>
      {/* Bot header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between mb-3"
      >
        <div className="flex items-center gap-2">
          <Activity size={14} className="opacity-70" />
          <span className="text-sm font-semibold">{BOT_NAMES[bot]}</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted">
          <span>
            <span className="text-success font-bold">{stats.wins}W</span>
            <span className="text-muted mx-1">-</span>
            <span className="text-danger font-bold">{stats.losses}L</span>
            {stats.pushes > 0 && <span className="text-muted"> ({stats.pushes}P)</span>}
          </span>
          <span className="font-mono text-base font-bold text-text">{winPct}%</span>
          <span className={`text-xs font-mono ${stats.avgClv > 0 ? "text-success" : stats.avgClv < 0 ? "text-danger" : "text-muted"}`}>
            CLV {stats.avgClv > 0 ? "+" : ""}{stats.avgClv.toFixed(1)}%
          </span>
          <span className="text-muted">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded && (
        <>
          {!hasSignals ? (
            <div className="text-xs text-muted text-center py-6 opacity-60">
              No signal data yet — settle more bets to build the learning model.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted border-b border-border">
                    <th className="text-left py-1.5 pr-3 font-medium">Signal</th>
                    <th className="text-right py-1.5 px-2 font-medium">Fired</th>
                    <th className="text-right py-1.5 px-2 font-medium">W/L</th>
                    <th className="text-right py-1.5 px-2 font-medium">Win%</th>
                    <th className="py-1.5 px-2 font-medium w-24">Rate</th>
                    <th className="text-right py-1.5 px-2 font-medium">Avg CLV</th>
                    <th className="text-right py-1.5 px-2 font-medium">Score</th>
                    <th className="text-right py-1.5 pl-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.signals.map((sig) => {
                    const status = getSignalStatus(sig);
                    const label = (SIGNAL_LABELS as Record<string, string>)[sig.signal_name] ?? sig.signal_name;
                    const decided = sig.wins + sig.losses;
                    const rowClass =
                      status === "hot" ? "bg-warning/5" :
                      status === "warm" ? "bg-success/5" :
                      status === "cold" ? "bg-danger/5" :
                      status === "frozen" ? "bg-blue-500/5" : "";

                    return (
                      <tr key={sig.signal_name} className={`border-b border-border/50 ${rowClass}`}>
                        <td className="py-1.5 pr-3 font-medium text-text/90">{label}</td>
                        <td className="text-right py-1.5 px-2 text-muted font-mono">{sig.times_fired}</td>
                        <td className="text-right py-1.5 px-2 font-mono">
                          <span className="text-success">{sig.wins}</span>
                          <span className="text-muted">-</span>
                          <span className="text-danger">{sig.losses}</span>
                        </td>
                        <td className="text-right py-1.5 px-2 font-mono font-bold">
                          {decided > 0 ? `${Math.round(sig.win_rate * 100)}%` : "—"}
                        </td>
                        <td className="py-1.5 px-2">
                          <WinRateBar rate={sig.win_rate} decided={decided} />
                        </td>
                        <td className={`text-right py-1.5 px-2 font-mono text-[10px] ${sig.avg_clv > 0 ? "text-success" : sig.avg_clv < 0 ? "text-danger" : "text-muted"}`}>
                          {sig.avg_clv > 0 ? "+" : ""}{sig.avg_clv.toFixed(1)}%
                        </td>
                        <td className="text-right py-1.5 px-2 font-mono text-[10px] text-muted">
                          {sig.weight_score.toFixed(3)}
                        </td>
                        <td className="text-right py-1.5 pl-2">
                          <SignalStatusBadge status={status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {stats.lastFeedback && (
            <p className="text-[10px] text-muted mt-2">
              Last updated: {new Date(stats.lastFeedback).toLocaleString("en-US", {
                month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
              })}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function PerformancePage() {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/performance");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const statusColors = {
    active: "text-success border-success/30 bg-success/5",
    warming: "text-warning border-warning/30 bg-warning/5",
    cold: "text-muted border-border bg-surface",
  };
  const statusLabels = {
    active: "Self-Learning Active",
    warming: "Warming Up",
    cold: "No Data Yet",
  };

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-sm font-semibold uppercase tracking-widest text-muted mb-1">
              Bot Performance
            </h1>
            <p className="text-xs text-muted/70">
              Signal weights auto-update after each settlement. Proven patterns are injected into bot prompts.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {data && (
              <div className={`flex items-center gap-1.5 text-[10px] font-medium px-3 py-1.5 rounded-full border ${statusColors[data.systemStatus]}`}>
                <span className={`w-1.5 h-1.5 rounded-full inline-block ${
                  data.systemStatus === "active" ? "bg-success animate-pulse" :
                  data.systemStatus === "warming" ? "bg-warning animate-pulse" : "bg-muted"
                }`} />
                {statusLabels[data.systemStatus]}
                {data.totalTracked > 0 && <span className="text-muted ml-1">({data.totalTracked} bets)</span>}
              </div>
            )}
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 text-[10px] text-muted hover:text-accent px-3 py-1.5 rounded border border-border hover:border-accent/30 transition-colors disabled:opacity-40"
            >
              <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="text-xs text-danger mb-4">{error}</div>
        )}

        {loading && !data && (
          <div className="flex items-center justify-center py-24 text-muted text-sm">
            <RefreshCw size={14} className="animate-spin mr-2" /> Loading performance data…
          </div>
        )}

        {data && (
          <>
            {/* Summary row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {(["A", "B", "C", "D"] as BotId[]).map((bot) => {
                const s = data.bots[bot];
                const decided = s.wins + s.losses;
                const winPct = decided > 0 ? Math.round((s.wins / decided) * 100) : 0;
                return (
                  <div key={bot} className={`card border text-center ${BOT_COLORS[bot]}`}>
                    <div className="text-[10px] uppercase tracking-wider opacity-70 mb-1">Bot {bot}</div>
                    <div className="font-mono text-2xl font-bold">{winPct}%</div>
                    <div className="text-[10px] text-muted mt-0.5">{s.wins}W-{s.losses}L · {s.totalBets} bets</div>
                    <div className={`text-[10px] font-mono mt-1 ${s.avgClv > 0 ? "text-success" : s.avgClv < 0 ? "text-danger" : "text-muted"}`}>
                      CLV {s.avgClv > 0 ? "+" : ""}{s.avgClv.toFixed(1)}%
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Per-bot signal tables */}
            {(["A", "B", "C", "D"] as BotId[]).map((bot) => (
              <BotCard key={bot} bot={bot} stats={data.bots[bot]} />
            ))}

            {/* Legend */}
            <div className="card mt-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-2">Legend</p>
              <div className="flex flex-wrap gap-4 text-[10px] text-muted">
                <span><span className="text-warning font-bold">🔥 HOT</span> — Win% ≥ 62% (min 5 bets)</span>
                <span><span className="text-success">↑ WARM</span> — Win% 54-61%</span>
                <span><span className="text-muted">— FLAT</span> — Win% 45-53%</span>
                <span><span className="text-danger">↓ COLD</span> — Win% 37-44%</span>
                <span><span className="text-blue-400 font-bold">❄ DEAD</span> — Win% ≤ 36%</span>
                <span><span className="text-muted">— new</span> — &lt;5 bets fired</span>
              </div>
              <p className="text-[10px] text-muted mt-2">
                <strong className="text-text">Score</strong> = win_rate × (1 + avg_clv/100).
                Top 5 signals per bot (min 5 fires) are injected into Claude prompts as proven patterns.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
