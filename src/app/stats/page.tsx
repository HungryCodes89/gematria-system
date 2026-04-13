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
}

interface StatsData {
  balance: number;
  roi: number;
  winRate: number;
  record: string;
  totalWagered: number;
  equityCurve: LedgerRow[];
  byLeague: Record<string, GroupStats>;
  byBetType: Record<string, GroupStats>;
  byLockType: Record<string, GroupStats>;
}

function formatPL(pl: number): string {
  if (pl >= 0) return `+$${pl.toLocaleString()}`;
  return `-$${Math.abs(pl).toLocaleString()}`;
}

function BreakdownTable({
  title,
  data,
}: {
  title: string;
  data: Record<string, GroupStats>;
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

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <h1 className="text-sm font-medium tracking-widest uppercase text-muted mb-6">
          Performance Stats
        </h1>

        {/* Top stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
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
        </div>

        {/* Equity curve */}
        <div className="mb-6">
          <EquityCurve data={data?.equityCurve ?? []} />
        </div>

        {/* Breakdown tables */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <BreakdownTable title="By League" data={data?.byLeague ?? {}} />
          <BreakdownTable title="By Lock Type" data={data?.byLockType ?? {}} />
          <BreakdownTable title="By Bet Type" data={data?.byBetType ?? {}} />
        </div>
      </main>
    </div>
  );
}
