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
} from "lucide-react";
import { calculateDateNumerology } from "@/lib/gematria";
import { getTodayET } from "@/lib/date-utils";
import { isFullMoon, getFullMoonName } from "@/lib/moon-phase";
import { getMoonIllumination } from "@/lib/moon-phase";
import type { Game, PaperTrade, DateNumerology } from "@/lib/types";
import Nav from "@/components/Nav";
import GameCard from "@/components/GameCard";
import StatCard from "@/components/StatCard";
import ManualPickModal from "@/components/ManualPickModal";

type League = "ALL" | "NBA" | "NHL" | "MLB";
type BotSelection = "all" | "A" | "B" | "C";

const BOT_LABELS: Record<BotSelection, string> = {
  all: "All Bots",
  A: "Bot A",
  B: "Bot B",
  C: "Bot C — AJ",
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

  async function handleSettle() {
    setLoading("settle");
    setStatusMsg("");
    try {
      const res = await fetch("/api/settle", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setStatusMsg(
          `Settled ${data.settled} bets (${data.results?.wins ?? 0}W-${data.results?.losses ?? 0}L). P&L: $${data.dailyPL ?? 0}`
        );
        toast.success(`Settled ${data.settled} bets`);
        loadGames();
      } else {
        toast.error(data.error || "Settlement failed");
      }
    } catch (e) {
      toast.error("Settlement failed: " + String(e));
    } finally {
      setLoading(null);
    }
  }

  const tradeMap = new Map<string, PaperTrade>();
  trades.forEach((t) => tradeMap.set(t.game_id, t));

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
            onClick={handleSettle}
            disabled={loading !== null || betCount === 0}
            className="card flex items-center justify-center gap-2 py-3 border-success/30 hover:bg-success/10 transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          >
            <CheckCircle size={16} />
            <span className="text-sm font-medium">
              {loading === "settle" ? "Settling..." : "Settle Bets"}
            </span>
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
          {(["all", "A", "B", "C"] as BotSelection[]).map((b) => (
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
                trade={tradeMap.get(game.id)}
                onReanalyze={() => handleReanalyze(game.id)}
                reanalyzing={reanalyzingId === game.id}
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
    </div>
  );
}
