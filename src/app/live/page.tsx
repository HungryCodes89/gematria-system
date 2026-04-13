"use client";

import { useState, useEffect } from "react";
import type { PaperTrade } from "@/lib/types";
import Nav from "@/components/Nav";
import StatCard from "@/components/StatCard";
import TradeCard from "@/components/TradeCard";

interface Bankroll {
  balance: number;
  atRisk: number;
  pendingCount: number;
  potentialWin: number;
}

export default function LivePage() {
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [bankroll, setBankroll] = useState<Bankroll | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/trades/live")
      .then((r) => r.json())
      .then((data) => {
        setTrades(data.trades ?? []);
        setBankroll(data.bankroll ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <h1 className="text-sm font-medium tracking-widest uppercase text-muted mb-6">
          Live Bets
        </h1>

        {/* Bankroll strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard
            label="Balance"
            value={`$${(bankroll?.balance ?? 10000).toLocaleString()}`}
          />
          <StatCard
            label="At Risk"
            value={`$${(bankroll?.atRisk ?? 0).toLocaleString()}`}
            color="danger"
          />
          <StatCard
            label="Pending"
            value={bankroll?.pendingCount ?? 0}
          />
          <StatCard
            label="Potential Win"
            value={`$${(bankroll?.potentialWin ?? 0).toLocaleString()}`}
            color="success"
          />
        </div>

        {/* Trade list */}
        {loading ? (
          <div className="card text-center py-16">
            <p className="text-muted animate-pulse">Loading live bets…</p>
          </div>
        ) : trades.length === 0 ? (
          <div className="card text-center py-16">
            <p className="text-muted text-lg mb-2">No pending bets</p>
            <p className="text-muted text-sm">
              Run <strong>Analyze &amp; Bet</strong> from the dashboard to place bets
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
