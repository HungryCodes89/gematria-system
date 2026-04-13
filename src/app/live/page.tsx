"use client";

import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { PaperTrade, Game } from "@/lib/types";
import Nav from "@/components/Nav";
import StatCard from "@/components/StatCard";
import LockBadge from "@/components/LockBadge";

interface Bankroll {
  balance: number;
  atRisk: number;
  pendingCount: number;
  potentialWin: number;
}

interface GameComparison {
  gameId: string;
  game: Game;
  botA: PaperTrade[];
  botB: PaperTrade[];
  botC: PaperTrade[];
}

const LEAGUE_COLORS: Record<string, string> = {
  NBA: "bg-orange-500/20 text-orange-400",
  NHL: "bg-blue-500/20 text-blue-400",
  MLB: "bg-red-500/20 text-red-400",
};

function formatTime(iso: string | null): string {
  if (!iso) return "";
  try {
    return (
      new Date(iso).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York",
      }) + " ET"
    );
  } catch {
    return "";
  }
}

function formatOdds(odds: number | null): string {
  if (odds == null) return "—";
  return odds > 0 ? `+${odds}` : String(odds);
}

function BotPickCard({ trade }: { trade: PaperTrade }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="space-y-1">
      <div className="text-sm font-semibold text-text">{trade.pick}</div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <LockBadge lockType={trade.lock_type} />
        <span className="text-[10px] font-[family-name:var(--font-mono)] text-muted">
          {formatOdds(trade.odds)}
        </span>
        <span className="text-[10px] text-muted">
          {trade.units}u · ${trade.stake}
        </span>
      </div>
      {trade.confidence != null && (
        <div className="text-[10px] text-muted">
          {Math.round(trade.confidence)}% confidence
        </div>
      )}
      {trade.reasoning && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-[10px] text-muted hover:text-text transition-colors mt-1"
          >
            {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            {expanded ? "Hide" : "Reasoning"}
          </button>
          {expanded && (
            <div className="text-[11px] text-muted leading-relaxed border-l-2 border-border pl-2 mt-1">
              {trade.reasoning}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function NoBet() {
  return <div className="text-xs text-muted italic">No bet — Skip</div>;
}

function ComparisonCard({ comp }: { comp: GameComparison }) {
  const game = comp.game;
  const statusDisplay =
    game.status === "final"
      ? "FINAL"
      : game.status === "in_progress"
        ? "LIVE"
        : formatTime(game.start_time);

  // Check if bots agree on their primary pick (only count bots that placed a bet)
  const activePicks = [comp.botA[0]?.pick, comp.botB[0]?.pick, comp.botC[0]?.pick].filter(Boolean);
  const agree = activePicks.length > 1 && activePicks.every((p) => p === activePicks[0]);
  const diverge = activePicks.length > 1 && !agree;

  return (
    <div className="card">
      {/* Game header */}
      <div className="flex items-center justify-between mb-1">
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${LEAGUE_COLORS[game.league] || ""}`}
        >
          {game.league}
        </span>
        <div className="flex items-center gap-2">
          {agree && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/20 text-success font-semibold">
              AGREE
            </span>
          )}
          {diverge && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-warning/20 text-warning font-semibold">
              SPLIT
            </span>
          )}
          <span className="text-xs text-muted">{statusDisplay}</span>
        </div>
      </div>

      <div className="text-sm text-center font-medium mb-3">
        {game.away_team}{" "}
        <span className="text-muted text-xs">at</span>{" "}
        {game.home_team}
      </div>

      {/* Three-column comparison */}
      <div className="grid grid-cols-3 gap-2 border-t border-border pt-3">
        {/* Bot A */}
        <div>
          <div className="text-[10px] font-bold tracking-widest uppercase text-muted mb-2">
            Bot A
            <span className="normal-case font-normal ml-1 hidden sm:inline">· Basic</span>
          </div>
          {comp.botA.length === 0 ? (
            <NoBet />
          ) : (
            <div className="space-y-3">
              {comp.botA.map((t) => (
                <BotPickCard key={t.id} trade={t} />
              ))}
            </div>
          )}
        </div>

        {/* Bot B */}
        <div className="border-l border-border pl-2">
          <div className="text-[10px] font-bold tracking-widest uppercase text-accent mb-2">
            Bot B
            <span className="normal-case font-normal text-muted ml-1 hidden sm:inline">· HUNGRY</span>
          </div>
          {comp.botB.length === 0 ? (
            <NoBet />
          ) : (
            <div className="space-y-3">
              {comp.botB.map((t) => (
                <BotPickCard key={t.id} trade={t} />
              ))}
            </div>
          )}
        </div>

        {/* Bot C */}
        <div className="border-l border-border pl-2">
          <div className="text-[10px] font-bold tracking-widest uppercase text-warning mb-2">
            Bot C
            <span className="normal-case font-normal text-muted ml-1 hidden sm:inline">· AJ</span>
          </div>
          {comp.botC.length === 0 ? (
            <NoBet />
          ) : (
            <div className="space-y-3">
              {comp.botC.map((t) => (
                <BotPickCard key={t.id} trade={t} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
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

  // Group trades by game for side-by-side comparison
  const comparisons: GameComparison[] = (() => {
    const map = new Map<string, GameComparison>();
    for (const trade of trades) {
      if (!trade.game) continue;
      if (!map.has(trade.game_id)) {
        map.set(trade.game_id, {
          gameId: trade.game_id,
          game: trade.game,
          botA: [],
          botB: [],
          botC: [],
        });
      }
      const comp = map.get(trade.game_id)!;
      if (trade.bot === "A") comp.botA.push(trade);
      else if (trade.bot === "B") comp.botB.push(trade);
      else if (trade.bot === "C") comp.botC.push(trade);
    }
    return Array.from(map.values());
  })();

  const botACount = trades.filter((t) => t.bot === "A").length;
  const botBCount = trades.filter((t) => t.bot === "B").length;
  const botCCount = trades.filter((t) => t.bot === "C").length;

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-4xl px-4 py-6">
        <h1 className="text-sm font-medium tracking-widest uppercase text-muted mb-6">
          Live Bets — Bot Comparison
        </h1>

        {/* Bankroll strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
          <StatCard
            label="Balance"
            value={`$${(bankroll?.balance ?? 10000).toLocaleString()}`}
          />
          <StatCard
            label="At Risk"
            value={`$${(bankroll?.atRisk ?? 0).toLocaleString()}`}
            color="danger"
          />
          <StatCard label="Bot A" value={botACount} />
          <StatCard label="Bot B" value={botBCount} color="success" />
          <StatCard label="Bot C" value={botCCount} color="warning" />
        </div>

        {/* Comparison list */}
        {loading ? (
          <div className="card text-center py-16">
            <p className="text-muted animate-pulse">Loading bets…</p>
          </div>
        ) : comparisons.length === 0 ? (
          <div className="card text-center py-16">
            <p className="text-muted text-lg mb-2">No pending bets</p>
            <p className="text-muted text-sm">
              Run <strong>Analyze &amp; Bet</strong> from the dashboard to place
              bets
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {comparisons.map((comp) => (
              <ComparisonCard key={comp.gameId} comp={comp} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
