"use client";

import { useState, useEffect } from "react";
import type { LedgerRow } from "@/lib/types";
import Nav from "@/components/Nav";
import StatCard from "@/components/StatCard";
import EquityCurve from "@/components/EquityCurve";

interface GroupStats {
  total: number;
  wins: number;
  losses: number;
  pl: number;
  winRate: number;
  roi: number;
  avgClv: number | null;
}

interface StatsData {
  balance: number;
  roi: number;
  winRate: number;
  record: string;
  totalWagered: number;
  avgClv: number | null;
  equityCurve: LedgerRow[];
  byLeague: Record<string, GroupStats>;
  byBetType: Record<string, GroupStats>;
  byLockType: Record<string, GroupStats>;
  byBot: Record<string, GroupStats>;
  byPrimetime: Record<string, GroupStats>;
}

function formatPL(pl: number): string {
  if (pl >= 0) return `+$${pl.toLocaleString()}`;
  return `-$${Math.abs(pl).toLocaleString()}`;
}

function formatClv(clv: number | null): string {
  if (clv == null) return "—";
  return clv >= 0 ? `+${clv.toFixed(2)}` : clv.toFixed(2);
}

const BOT_BADGE: Record<string, string> = {
  "Bot A": "bg-blue-500/20 text-blue-400",
  "Bot B": "bg-cyan-500/20 text-cyan-400",
  "Bot C": "bg-purple-500/20 text-purple-400",
  "Bot D": "bg-orange-500/20 text-orange-400",
};

const MEDALS = ["🥇", "🥈", "🥉"];

function ClvLeaderboard({ byBot }: { byBot: Record<string, GroupStats> }) {
  const ranked = Object.entries(byBot)
    .filter(([, s]) => s.avgClv != null)
    .sort((a, b) => (b[1].avgClv ?? -Infinity) - (a[1].avgClv ?? -Infinity));

  if (ranked.length === 0) return null;

  return (
    <div className="card">
      <div className="text-[10px] uppercase tracking-wider text-muted mb-3">
        CLV Leaderboard — Bot Rankings
      </div>
      <div className="space-y-2">
        {ranked.map(([name, s], i) => (
          <div
            key={name}
            className={`flex items-center gap-3 p-2 rounded-lg ${i === 0 ? "bg-success/5 border border-success/10" : "bg-surface/50"}`}
          >
            <span className="text-base w-5 shrink-0">{MEDALS[i] ?? `#${i + 1}`}</span>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${BOT_BADGE[name] ?? "bg-surface text-muted"}`}
            >
              {name}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`font-[family-name:var(--font-mono)] text-sm font-bold ${
                    (s.avgClv ?? 0) >= 0 ? "text-success" : "text-danger"
                  }`}
                >
                  {formatClv(s.avgClv)} avg CLV
                </span>
                <span className="text-[10px] text-muted">
                  {s.wins}-{s.losses} · {s.winRate}% win · {s.roi >= 0 ? "+" : ""}{s.roi}% ROI
                </span>
              </div>
            </div>
            <span className="text-[10px] text-muted shrink-0">{s.total} bets</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BreakdownTable({
  title,
  data,
  showClv = false,
}: {
  title: string;
  data: Record<string, GroupStats>;
  showClv?: boolean;
}) {
  const entries = Object.entries(data).sort((a, b) => b[1].pl - a[1].pl);

  if (entries.length === 0) {
    return (
      <div className="card">
        <div className="text-[10px] uppercase tracking-wider text-muted mb-3">
          {title}
        </div>
        <p className="text-xs text-muted">No data</p>
      </div>
    );
  }

  return (
    <div className="card overflow-x-auto">
      <div className="text-[10px] uppercase tracking-wider text-muted mb-3">
        {title}
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted text-left">
            <th className="pb-2 font-medium">Name</th>
            <th className="pb-2 font-medium text-right">Bets</th>
            <th className="pb-2 font-medium text-right">W-L</th>
            <th className="pb-2 font-medium text-right">Win%</th>
            <th className="pb-2 font-medium text-right">P&L</th>
            <th className="pb-2 font-medium text-right">ROI</th>
            {showClv && <th className="pb-2 font-medium text-right">Avg CLV</th>}
          </tr>
        </thead>
        <tbody>
          {entries.map(([name, s]) => (
            <tr key={name} className="border-t border-border">
              <td className="py-2 font-medium text-text">{name}</td>
              <td className="py-2 text-right font-[family-name:var(--font-mono)] text-muted">
                {s.total}
              </td>
              <td className="py-2 text-right font-[family-name:var(--font-mono)] text-muted">
                {s.wins}-{s.losses}
              </td>
              <td className="py-2 text-right font-[family-name:var(--font-mono)]">
                {s.winRate}%
              </td>
              <td
                className={`py-2 text-right font-[family-name:var(--font-mono)] font-semibold ${
                  s.pl >= 0 ? "text-success" : "text-danger"
                }`}
              >
                {formatPL(s.pl)}
              </td>
              <td
                className={`py-2 text-right font-[family-name:var(--font-mono)] ${
                  s.roi >= 0 ? "text-success" : "text-danger"
                }`}
              >
                {s.roi}%
              </td>
              {showClv && (
                <td
                  className={`py-2 text-right font-[family-name:var(--font-mono)] ${
                    s.avgClv == null
                      ? "text-muted"
                      : s.avgClv >= 0
                      ? "text-success"
                      : "text-danger"
                  }`}
                >
                  {formatClv(s.avgClv)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function StatsPage() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/trades/stats")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen">
        <Nav />
        <main className="mx-auto max-w-6xl px-4 py-6">
          <div className="card text-center py-16">
            <p className="text-muted animate-pulse">Loading stats…</p>
          </div>
        </main>
      </div>
    );
  }

  const plColor = (data?.balance ?? 10000) >= 10000 ? "success" : "danger";
  const clvColor =
    data?.avgClv == null ? undefined : data.avgClv >= 0 ? "success" : "danger";

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <h1 className="text-sm font-medium tracking-widest uppercase text-muted mb-6">
          Performance Stats
        </h1>

        {/* Top stats */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-6">
          <StatCard
            label="Balance"
            value={`$${(data?.balance ?? 10000).toLocaleString()}`}
            color={plColor}
          />
          <StatCard label="Record" value={data?.record ?? "0W-0L"} />
          <StatCard label="Win Rate" value={`${data?.winRate ?? 0}%`} />
          <StatCard
            label="ROI"
            value={`${data?.roi ?? 0}%`}
            color={(data?.roi ?? 0) >= 0 ? "success" : "danger"}
          />
          <StatCard
            label="Wagered"
            value={`$${(data?.totalWagered ?? 0).toLocaleString()}`}
          />
          <StatCard
            label="Avg CLV"
            value={data?.avgClv != null ? `${formatClv(data.avgClv)}` : "—"}
            color={clvColor}
          />
        </div>

        {/* Equity curve */}
        <div className="mb-6">
          <EquityCurve data={data?.equityCurve ?? []} />
        </div>

        {/* Breakdown tables */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <BreakdownTable title="By League" data={data?.byLeague ?? {}} showClv />
          <BreakdownTable title="By Lock Type" data={data?.byLockType ?? {}} showClv />
          <BreakdownTable title="By Bet Type" data={data?.byBetType ?? {}} showClv />
        </div>

        {/* CLV section */}
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-wider text-muted mb-2">
            Closing Line Value (CLV)
          </div>
          <p className="text-[10px] text-muted mb-3">
            Positive CLV = you beat the closing line (sharp money agrees with you). Negative = line moved against your pick after placement.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <BreakdownTable title="CLV by Bot" data={data?.byBot ?? {}} showClv />
          <BreakdownTable title="CLV by Primetime" data={data?.byPrimetime ?? {}} showClv />
        </div>

        <ClvLeaderboard byBot={data?.byBot ?? {}} />
      </main>
    </div>
  );
}
