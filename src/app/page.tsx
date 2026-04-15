"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  Download,
  Sparkles,
  CheckCircle,
  Moon,
  Filter,
  PenLine,
  BookOpen,
  Trophy,
} from "lucide-react";
import LockBadge from "@/components/LockBadge";
import { calculateDateNumerology } from "@/lib/gematria";
import { getTodayET } from "@/lib/date-utils";
import { isFullMoon, getFullMoonName } from "@/lib/moon-phase";
import { getMoonIllumination } from "@/lib/moon-phase";
import type { Game, PaperTrade, DateNumerology } from "@/lib/types";
import Nav from "@/components/Nav";
import GameCard from "@/components/GameCard";
import StatCard from "@/components/StatCard";
import ManualPickModal from "@/components/ManualPickModal";
import GameDetailModal from "@/components/GameDetailModal";
import SettleModal from "@/components/SettleModal";

type League = "ALL" | "NBA" | "NHL" | "MLB";
type BotSelection = "all" | "A" | "B" | "C" | "D";

const BOT_LABELS: Record<BotSelection, string> = {
  all: "All Bots",
  A: "Bot A",
  B: "Bot B",
  C: "Bot C — AJ",
  D: "Bot D — Narrative",
};

export default function Dashboard() {
  const [games, setGames] = useState<Game[]>([]);
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [league, setLeague] = useState<League>("ALL");
  const [selectedBot, setSelectedBot] = useState<BotSelection>("all");
  const [loading, setLoading] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [analyzeProgress, setAnalyzeProgress] = useState<{
    current: number;
    total: number;
    label: string;
  } | null>(null);
  const [showManualModal, setShowManualModal] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [reanalyzingId, setReanalyzingId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const notesSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const today = getTodayET();
  const todayDate = (() => {
    const [y, m, d] = today.split("-").map(Number);
    return new Date(y, m - 1, d);
  })();
  const numerology = calculateDateNumerology(todayDate);
  const fullMoon = isFullMoon(today);
  const moonName = getFullMoonName(today);
  const illumination = Math.round(getMoonIllumination(todayDate) * 100);

  const dayName = todayDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const loadGames = useCallback(async () => {
    try {
      const res = await fetch(`/api/trades/live`);
      if (res.ok) {
        const data = await res.json();
        setTrades(data.trades || []);
      }
    } catch { /* ignore */ }

    try {
      const res = await fetch(`/api/fetch-games?date=${today}&readonly=1`);
      if (res.ok) {
        const data = await res.json();
        if (data.games) setGames(data.games);
      }
    } catch { /* ignore */ }
  }, [today]);

  const loadNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/notes?date=${today}`);
      if (res.ok) {
        const data = await res.json();
        setNotes(data.content ?? "");
      }
    } catch { /* ignore */ }
  }, [today]);

  useEffect(() => {
    loadGames();
    loadNotes();
  }, [loadGames, loadNotes]);

  function handleNotesChange(value: string) {
    setNotes(value);
    if (notesSaveTimer.current) clearTimeout(notesSaveTimer.current);
    notesSaveTimer.current = setTimeout(async () => {
      setNotesSaving(true);
      try {
        await fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: today, content: value }),
        });
      } finally {
        setNotesSaving(false);
      }
    }, 1200);
  }

  async function handleReanalyze(gameId: string) {
    setReanalyzingId(gameId);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot: selectedBot, gameId }),
      });
      if (res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() || "";
        }
      }
      toast.success("Re-analysis complete");
      loadGames();
    } catch (e) {
      toast.error("Re-analyze failed: " + String(e));
    } finally {
      setReanalyzingId(null);
    }
  }

  const filtered = league === "ALL" ? games : games.filter((g) => g.league === league);
  const leagueCounts = {
    ALL: games.length,
    NBA: games.filter((g) => g.league === "NBA").length,
    NHL: games.filter((g) => g.league === "NHL").length,
    MLB: games.filter((g) => g.league === "MLB").length,
  };
  const analyzedCount = games.filter((g) => g.analyzed).length;
  const betCount = trades.length;

  async function handleFetch() {
    setLoading("fetch");
    setStatusMsg("");
    try {
      const res = await fetch("/api/fetch-games", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setStatusMsg(
          `Fetched ${data.total} games (${data.games?.nba ?? 0} NBA, ${data.games?.nhl ?? 0} NHL, ${data.games?.mlb ?? 0} MLB) with ${data.oddsMatched ?? 0} odds matched`
        );
        toast.success(`Fetched ${data.total} games`);
        loadGames();
      } else {
        toast.error(data.error || "Fetch failed");
      }
    } catch (e) {
      toast.error("Fetch failed: " + String(e));
    } finally {
      setLoading(null);
    }
  }

  async function handleAnalyze() {
    setLoading("analyze");
    setStatusMsg("");
    setAnalyzeProgress(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot: selectedBot }),
      });
      if (!res.body) {
        const data = await res.json();
        setStatusMsg(
          `Analyzed ${data.analyzed} games, placed ${data.betsPlaced} bets`
        );
        toast.success(`Placed ${data.betsPlaced} bets`);
        loadGames();
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let lastResult: {
        analyzed: number;
        betsPlaced: number;
        errors?: string[];
        settingsSnapshot?: Record<string, unknown>;
      } = { analyzed: 0, betsPlaced: 0 };
      const gameErrors: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.done) {
              lastResult = ev;
            } else if (ev.total) {
              setAnalyzeProgress({
                current: ev.game,
                total: ev.total,
                label: ev.teams || "",
              });
            } else if (ev.status === "error") {
              gameErrors.push(`${ev.teams}: ${ev.error}`);
            }
          } catch { /* skip bad json */ }
        }
      }

      const allErrors = [...gameErrors, ...(lastResult.errors ?? [])];

      // Build detailed status — show skip reasons if no bets placed
      if (lastResult.betsPlaced === 0 && lastResult.analyzed > 0) {
        const snap = lastResult.settingsSnapshot as Record<string, unknown> | undefined;
        const hints: string[] = [];
        if (allErrors.length > 0) hints.push(`${allErrors.length} Claude error(s) — check model name in Settings`);
        if (snap) {
          if (!snap.auto_bet_triple_locks && !snap.auto_bet_double_locks && !snap.auto_bet_single_locks)
            hints.push("All auto-bet toggles OFF");
          else if (!snap.auto_bet_double_locks && !snap.auto_bet_single_locks)
            hints.push("Only Triple Locks auto-bet");
          hints.push(`Model: ${snap.model} · Min conf: ${snap.min_confidence}%`);
        }
        setStatusMsg(`Analyzed ${lastResult.analyzed} games — 0 bets placed. ${hints.join(" · ")}`);
        toast.error(`0 bets placed — ${hints[0] ?? "check diagnose endpoint"}`);
      } else {
        setStatusMsg(`Analyzed ${lastResult.analyzed} games, placed ${lastResult.betsPlaced} bets`);
        if (lastResult.betsPlaced > 0) toast.success(`Placed ${lastResult.betsPlaced} bets`);
      }

      if (allErrors.length > 0) {
        allErrors.forEach((e) => toast.error(e, { duration: 6000 }));
      }

      loadGames();
    } catch (e) {
      toast.error("Analysis failed: " + String(e));
    } finally {
      setLoading(null);
      setAnalyzeProgress(null);
    }
  }

  function handleSettled({ settled, wins, losses, dailyPL }: { settled: number; wins: number; losses: number; dailyPL: number }) {
    setStatusMsg(`Settled ${settled} bets (${wins}W-${losses}L). P&L: $${dailyPL}`);
    toast.success(`Settled ${settled} bets`);
    loadGames();
  }

  const tradesByGame = new Map<string, PaperTrade[]>();
  trades.forEach((t) => {
    if (!tradesByGame.has(t.game_id)) tradesByGame.set(t.game_id, []);
    tradesByGame.get(t.game_id)!.push(t);
  });

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* Date header */}
        <div className="mb-6">
          <h1 className="text-sm font-medium tracking-widest uppercase text-muted mb-1">
            {dayName}
          </h1>
        </div>

        {/* Numerology strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-6">
          {[
            ["Full Date", numerology.full],
            ["Reduced Year", numerology.reducedYear],
            ["Single Digits", numerology.singleDigits],
            ["Short Year", numerology.shortYear],
            ["Month+Day", numerology.monthDay],
          ].map(([label, val]) => (
            <div key={String(label)} className="card text-center">
              <div className="text-[10px] uppercase tracking-wider text-muted mb-1">
                {label}
              </div>
              <div className="font-[family-name:var(--font-mono)] text-xl font-bold text-accent">
                {val}
              </div>
            </div>
          ))}
          <div className="card text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted mb-1">
              Moon
            </div>
            <div className="flex items-center justify-center gap-1">
              <Moon size={14} className={fullMoon ? "text-warning" : "text-muted"} />
              <span className="font-[family-name:var(--font-mono)] text-sm font-bold">
                {illumination}%
              </span>
            </div>
            {moonName && (
              <div className="text-[10px] text-warning mt-0.5">{moonName}</div>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <StatCard label="Games" value={games.length} />
          <StatCard label="Analyzed" value={analyzedCount} />
          <StatCard label="Bets" value={betCount} />
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <button
            onClick={handleFetch}
            disabled={loading !== null}
            className="card flex items-center justify-center gap-2 py-3 border-accent/30 hover:bg-accent/10 transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          >
            <Download size={16} className={loading === "fetch" ? "animate-spin" : ""} />
            <span className="text-sm font-medium">
              {loading === "fetch" ? "Fetching..." : "Fetch Games"}
            </span>
          </button>
          <button
            onClick={handleAnalyze}
            disabled={loading !== null || games.length === 0}
            className="card flex items-center justify-center gap-2 py-3 bg-accent/20 border-accent/30 hover:bg-accent/30 transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          >
            <Sparkles size={16} className={loading === "analyze" ? "animate-pulse" : ""} />
            <span className="text-sm font-medium">
              {analyzeProgress
                ? `${analyzeProgress.current}/${analyzeProgress.total}...`
                : loading === "analyze"
                  ? "Starting..."
                  : "Analyze & Bet"}
            </span>
          </button>
          <button
            onClick={() => setShowSettleModal(true)}
            disabled={loading !== null || betCount === 0}
            className="card flex items-center justify-center gap-2 py-3 border-success/30 hover:bg-success/10 transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          >
            <CheckCircle size={16} />
            <span className="text-sm font-medium">Settle Bets</span>
          </button>
          <button
            onClick={() => setShowManualModal(true)}
            disabled={games.length === 0}
            className="card flex items-center justify-center gap-2 py-3 border-warning/30 hover:bg-warning/10 transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          >
            <PenLine size={16} />
            <span className="text-sm font-medium">Log Pick</span>
          </button>
        </div>

        {statusMsg && (
          <div className="text-sm text-muted mb-4 text-center">{statusMsg}</div>
        )}

        {/* Bot selector */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-muted uppercase tracking-wider">Bot:</span>
          {(["all", "A", "B", "C", "D"] as BotSelection[]).map((b) => (
            <button
              key={b}
              onClick={() => setSelectedBot(b)}
              className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                selectedBot === b
                  ? "bg-accent/20 text-accent"
                  : "text-muted hover:text-text"
              }`}
            >
              {BOT_LABELS[b]}
            </button>
          ))}
        </div>

        {/* League filter */}
        <div className="flex items-center gap-2 mb-6">
          <Filter size={14} className="text-muted" />
          {(["ALL", "NBA", "NHL", "MLB"] as League[]).map((l) => (
            <button
              key={l}
              onClick={() => setLeague(l)}
              className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                league === l
                  ? "bg-accent/20 text-accent"
                  : "text-muted hover:text-text"
              }`}
            >
              {l} ({leagueCounts[l]})
            </button>
          ))}
        </div>

        {/* Best Pick of the Day */}
        {(() => {
          const BOT_BADGE: Record<string, string> = {
            A: "bg-blue-500/20 text-blue-400",
            B: "bg-cyan-500/20 text-cyan-400",
            C: "bg-purple-500/20 text-purple-400",
          };
          const best = trades.length > 0
            ? trades.reduce((b, t) => (t.confidence ?? 0) > (b.confidence ?? 0) ? t : b)
            : null;
          if (!best) return null;
          const game = best.game;
          return (
            <div className="card border-accent/20 bg-accent/5 mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Trophy size={13} className="text-accent" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">
                  Best Pick of the Day
                </span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${BOT_BADGE[best.bot] ?? ""}`}>
                      BOT {best.bot}
                    </span>
                    <LockBadge lockType={best.lock_type} />
                    {game && (
                      <span className="text-[10px] text-muted">{game.league}</span>
                    )}
                  </div>
                  <div className="text-sm font-semibold text-text">{best.pick}</div>
                  {game && (
                    <div className="text-[10px] text-muted mt-0.5">
                      {game.away_team} at {game.home_team}
                    </div>
                  )}
                  {best.reasoning && (
                    <div className="text-[10px] text-muted mt-1.5 leading-relaxed line-clamp-2">
                      {best.reasoning}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="font-[family-name:var(--font-mono)] text-xs text-muted">
                    {best.odds != null ? (best.odds > 0 ? `+${best.odds}` : String(best.odds)) : "—"}
                  </div>
                  <div className="text-lg font-bold font-[family-name:var(--font-mono)] text-accent">
                    {Math.round(best.confidence ?? 0)}%
                  </div>
                  <div className="text-[9px] text-muted">confidence</div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Game grid */}
        {filtered.length === 0 ? (
          <div className="card text-center py-16">
            <p className="text-muted text-lg mb-2">No games loaded</p>
            <p className="text-muted text-sm">
              Click <strong>Fetch Games</strong> to scan today&apos;s slate
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                trades={tradesByGame.get(game.id) ?? []}
                onReanalyze={() => handleReanalyze(game.id)}
                reanalyzing={reanalyzingId === game.id}
                onClick={() => setSelectedGame(game)}
              />
            ))}
          </div>
        )}

        {/* Decode Journal */}
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen size={14} className="text-muted" />
            <span className="text-xs font-medium uppercase tracking-wider text-muted">
              Decode Journal
            </span>
            {notesSaving && (
              <span className="text-[10px] text-muted animate-pulse">saving…</span>
            )}
          </div>
          <textarea
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            rows={5}
            placeholder={`Notes for ${today} — alignments you spotted, narratives in play, numbers to watch…`}
            className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-text placeholder:text-muted resize-y focus:outline-none focus:border-accent/50 transition-colors"
          />
          <p className="text-[10px] text-muted mt-1">
            Auto-saved · Injected into all bot prompts when Analyze &amp; Bet runs
          </p>
        </div>
      </main>

      {showManualModal && (
        <ManualPickModal
          games={games}
          onClose={() => setShowManualModal(false)}
          onSaved={() => {
            loadGames();
            toast.success("Pick logged");
          }}
        />
      )}

      {selectedGame && (
        <GameDetailModal
          game={selectedGame}
          onClose={() => setSelectedGame(null)}
        />
      )}

      {showSettleModal && (
        <SettleModal
          onClose={() => setShowSettleModal(false)}
          onSettled={handleSettled}
        />
      )}
    </div>
  );
}
