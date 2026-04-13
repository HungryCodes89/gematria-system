"use client";

import { useState, useEffect, useCallback } from "react";
import type { PaperTrade } from "@/lib/types";
import Nav from "@/components/Nav";
import StatCard from "@/components/StatCard";
import TradeCard from "@/components/TradeCard";

interface Summary {
  total: number;
  wins: number;
  losses: number;
  pushes: number;
  netPL: number;
  roi: number;
  winRate: number;
  totalWagered: number;
}

type DayFilter = "7" | "30" | "all";

export default function HistoryPage() {
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  const [league, setLeague] = useState("");
  const [result, setResult] = useState("");
  const [days, setDays] = useState<DayFilter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (league) params.set("league", league);
      if (result) params.set("result", result);
      if (days !== "all") params.set("days", days);

      const res = await fetch(`/api/trades/history?${params}`);
      const data = await res.json();
      setTrades(data.trades ?? []);
      setSummary(data.summary ?? null);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [league, result, days]);

  useEffect(() => {
    load();
  }, [load]);

  const plColor = (summary?.netPL ?? 0) >= 0 ? "success" : "danger";
  const plPrefix = (summary?.netPL ?? 0) >= 0 ? "+$" : "-$";

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <h1 className="text-sm font-medium tracking-widest uppercase text-muted mb-6">
          Bet History
        </h1>

        {/* Summary row */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
          <StatCard label="Total" value={summary?.total ?? 0} />
          <StatCard label="Wins" value={summary?.wins ?? 0} color="success" />
          <StatCard label="Losses" value={summary?.losses ?? 0} color="danger" />
          <StatCard
            label="P&L"
            value={`${Math.abs(summary?.netPL ?? 0).toLocaleString()}`}
            prefix={plPrefix}
            color={plColor}
          />
          <StatCard
            label="ROI"
            value={`${summary?.roi ?? 0}%`}
            color={plColor}
          />
          <StatCard
            label="Win Rate"
            value={`${summary?.winRate ?? 0}%`}
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {/* League */}
          <select
            value={league}
            onChange={(e) => setLeague(e.target.value)}
            className="bg-surface border border-border rounded-lg text-xs px-3 py-2 text-text focus:outline-none focus:border-accent"
          >
            <option value="">All Leagues</option>
            <option value="NBA">NBA</option>
            <option value="NHL">NHL</option>
            <option value="MLB">MLB</option>
          </select>

          {/* Result */}
          <select
            value={result}
            onChange={(e) => setResult(e.target.value)}
            className="bg-surface border border-border rounded-lg text-xs px-3 py-2 text-text focus:outline-none focus:border-accent"
          >
            <option value="">All Results</option>
            <option value="win">Wins</option>
            <option value="loss">Losses</option>
            <option value="push">Pushes</option>
          </select>

          {/* Days toggle */}
          <div className="flex items-center gap-1">
            {(["7", "30", "all"] as DayFilter[]).map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                  days === d
                    ? "bg-accent/20 text-accent"
                    : "text-muted hover:text-text"
                }`}
              >
                {d === "all" ? "All" : `${d}d`}
              </button>
            ))}
          </div>
        </div>

        {/* Trades */}
        {loading ? (
          <div className="card text-center py-16">
            <p className="text-muted animate-pulse">Loading history…</p>
          </div>
        ) : trades.length === 0 ? (
          <div className="card text-center py-16">
            <p className="text-muted text-lg mb-2">No settled bets</p>
            <p className="text-muted text-sm">
              Settled bets will appear here after games end
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {trades.map((t) => (
              <TradeCard key={t.id} trade={t} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
