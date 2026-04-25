"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { BookOpen } from "lucide-react";
import LockBadge from "@/components/LockBadge";
import { calculateDateNumerology, calculateGematria } from "@/lib/gematria";
import { getTodayET } from "@/lib/date-utils";
import { isFullMoon, getFullMoonName } from "@/lib/moon-phase";
import { getMoonIllumination } from "@/lib/moon-phase";
import type { Game, PaperTrade } from "@/lib/types";
import Nav from "@/components/Nav";
import GameCard from "@/components/GameCard";
import ManualPickModal from "@/components/ManualPickModal";
import GameDetailModal from "@/components/GameDetailModal";
import BriefingModal from "@/components/BriefingModal";
import DebriefModal from "@/components/DebriefModal";

type League = "ALL" | "NBA" | "NHL" | "MLB";
type BotSelection = "all" | "A" | "B" | "C" | "D";

const BOT_LABELS: Record<BotSelection, { short: string; method: string }> = {
  all: { short: "ALL",    method: "ALL BOTS"       },
  A:   { short: "A",      method: "BASIC CIPHER"   },
  B:   { short: "B",      method: "HUBBARD 15-STEP" },
  C:   { short: "C",      method: "STRAIT JESUIT"  },
  D:   { short: "D",      method: "NARRATIVE SCOUT" },
};

/* Helper — reduce a number to its numerology root, preserving master numbers */
function reduce(n: number): number {
  while (n > 9 && n !== 11 && n !== 22 && n !== 33) {
    n = String(n).split("").reduce((s, c) => s + Number(c), 0);
  }
  return n;
}

function isMasterNum(n: number) {
  return n === 11 || n === 22 || n === 33;
}

function MasterSpan({ value }: { value: number }) {
  return isMasterNum(value)
    ? <span className="master-num">{value}</span>
    : <span>{value}</span>;
}

/* Flower-of-Life tiling for the hero strip background */
function FlowerOfLifePattern() {
  return (
    <svg
      className="absolute inset-0 w-full h-full"
      style={{ opacity: 0.06, pointerEvents: "none" }}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern id="fol" x="0" y="0" width="58" height="50.2" patternUnits="userSpaceOnUse">
          <circle cx="29" cy="25.1" r="14.5" fill="none" stroke="#D4A574" strokeWidth="0.6" />
          <circle cx="29" cy="10.6" r="14.5" fill="none" stroke="#D4A574" strokeWidth="0.6" />
          <circle cx="29" cy="39.6" r="14.5" fill="none" stroke="#D4A574" strokeWidth="0.6" />
          <circle cx="16.4" cy="18" r="14.5"  fill="none" stroke="#D4A574" strokeWidth="0.6" />
          <circle cx="41.6" cy="18" r="14.5"  fill="none" stroke="#D4A574" strokeWidth="0.6" />
          <circle cx="16.4" cy="32.2" r="14.5" fill="none" stroke="#D4A574" strokeWidth="0.6" />
          <circle cx="41.6" cy="32.2" r="14.5" fill="none" stroke="#D4A574" strokeWidth="0.6" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#fol)" />
    </svg>
  );
}

export default function Dashboard() {
  const [games, setGames]         = useState<Game[]>([]);
  const [trades, setTrades]       = useState<PaperTrade[]>([]);
  const [league, setLeague]       = useState<League>("ALL");
  const [selectedBot, setSelectedBot] = useState<BotSelection>("all");
  const [loading, setLoading]     = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [analyzeProgress, setAnalyzeProgress] = useState<{
    current: number; total: number; label: string;
  } | null>(null);
  const [showManualModal, setShowManualModal]   = useState(false);
  const [selectedGame, setSelectedGame]         = useState<Game | null>(null);
  const [lastSettlement, setLastSettlement]     = useState<{
    settledAt: string; betsPlaced: number | null;
    wins: number | null; losses: number | null; dailyPL: number | null;
  } | null>(null);
  const [showBriefingModal, setShowBriefingModal] = useState(false);
  const [showDebriefModal, setShowDebriefModal]   = useState(false);
  const [reanalyzingId, setReanalyzingId]       = useState<string | null>(null);
  const [notes, setNotes]         = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const notesSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const today     = getTodayET();
  const todayDate = (() => {
    const [y, m, d] = today.split("-").map(Number);
    return new Date(y, m - 1, d);
  })();
  const numerology   = calculateDateNumerology(todayDate);
  const fullMoon     = isFullMoon(today);
  const moonName     = getFullMoonName(today);
  const illumination = Math.round(getMoonIllumination(todayDate) * 100);

  const dayName = todayDate.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  /* ── Hero strip values ── */
  const [yrStr, moStr, dyStr] = today.split("-");
  const heroDate = `${moStr}.${dyStr}.${yrStr}`;
  const numSum   = parseInt(moStr) + parseInt(dyStr) + parseInt(yrStr);
  const dayOfYear  = numerology.dayOfYear;
  const weekOfYear = Math.ceil((dayOfYear + new Date(todayDate.getFullYear(), 0, 1).getDay()) / 7);

  const loadGames = useCallback(async () => {
    try {
      const res = await fetch(`/api/trades/live`);
      if (res.ok) {
        const data = await res.json();
        setTrades(data.trades || []);
        if (data.lastSettlement) setLastSettlement(data.lastSettlement);
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
        const reader  = res.body.getReader();
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

  /* Hero strip counts */
  const lockCount = games.filter(g => g.lock_type === "triple_lock" || g.lock_type === "double_lock").length;
  const leanCount = games.filter(g => g.lock_type === "single_lock").length;
  const betsSet   = new Set(trades.filter(t => t.bet_type !== "analysis").map(t => t.game_id));
  const passCount = games.filter(g => g.analyzed && !betsSet.has(g.id)).length;

  async function handleFetch() {
    setLoading("fetch");
    setStatusMsg("");
    try {
      const res  = await fetch("/api/fetch-games", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setStatusMsg(
          `Fetched ${data.total} games (${data.games?.nba ?? 0} NBA · ${data.games?.nhl ?? 0} NHL · ${data.games?.mlb ?? 0} MLB) · ${data.oddsMatched ?? 0} odds matched`
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
        setStatusMsg(`Analyzed ${data.analyzed} games, placed ${data.betsPlaced} bets`);
        toast.success(`Placed ${data.betsPlaced} bets`);
        loadGames();
        return;
      }
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let lastResult: {
        analyzed: number; betsPlaced: number; errors?: string[];
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
              setAnalyzeProgress({ current: ev.game, total: ev.total, label: ev.teams || "" });
            } else if (ev.status === "error") {
              gameErrors.push(`${ev.teams}: ${ev.error}`);
            }
          } catch { /* skip bad json */ }
        }
      }

      const allErrors = [...gameErrors, ...(lastResult.errors ?? [])];
      if (lastResult.betsPlaced === 0 && lastResult.analyzed > 0) {
        const snap  = lastResult.settingsSnapshot as Record<string, unknown> | undefined;
        const hints: string[] = [];
        if (allErrors.length > 0) hints.push(`${allErrors.length} Claude error(s)`);
        if (snap) {
          if (!snap.auto_bet_triple_locks && !snap.auto_bet_double_locks && !snap.auto_bet_single_locks)
            hints.push("All auto-bet toggles OFF");
          hints.push(`Model: ${snap.model}`);
        }
        setStatusMsg(`Analyzed ${lastResult.analyzed} games — 0 bets. ${hints.join(" · ")}`);
        toast.error(`0 bets placed — ${hints[0] ?? "check settings"}`);
      } else {
        setStatusMsg(`Analyzed ${lastResult.analyzed} games · ${lastResult.betsPlaced} bets placed`);
        if (lastResult.betsPlaced > 0) toast.success(`Placed ${lastResult.betsPlaced} bets`);
      }
      if (allErrors.length > 0) allErrors.forEach((e) => toast.error(e, { duration: 6000 }));
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
      const res  = await fetch("/api/settle", { method: "POST" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Settlement failed");
      if (data.settled === 0) {
        toast.info("No final games to settle yet");
      } else {
        const { wins, losses } = data.results ?? {};
        toast.success(`Settled ${data.settled} bet${data.settled !== 1 ? "s" : ""} (${wins}W-${losses}L)`);
        setStatusMsg(`Settled ${data.settled} bets (${wins}W-${losses}L) · P&L: $${data.dailyPL}`);
      }
      loadGames();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Settlement failed");
    } finally {
      setLoading(null);
    }
  }

  const tradesByGame = new Map<string, PaperTrade[]>();
  trades.forEach((t) => {
    if (!tradesByGame.has(t.game_id)) tradesByGame.set(t.game_id, []);
    tradesByGame.get(t.game_id)!.push(t);
  });

  return (
    <div className="min-h-screen">
      <Nav />

      <main className="mx-auto max-w-7xl px-4 py-6">

        {/* ══════════════════════════════════════════
            HERO STRIP — today's card header
        ══════════════════════════════════════════ */}
        <div
          className="relative flex items-center justify-between px-8 py-6 mb-8 rounded-xl overflow-hidden"
          style={{ minHeight: 200 }}
        >
          {/* Flower of Life tiling background */}
          <FlowerOfLifePattern />
          {/* Amber gradient mesh */}
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(135deg, rgba(28,18,6,0.92) 0%, rgba(11,15,23,0.97) 60%)",
              borderRadius: "inherit",
            }}
          />
          {/* Amber border */}
          <div
            className="absolute inset-0 rounded-xl"
            style={{ border: "1px solid rgba(212,165,116,0.18)" }}
          />

          {/* LEFT — date + numerology decode */}
          <div className="relative z-10">
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 64,
                lineHeight: 1,
                letterSpacing: "0.06em",
                color: "#D4A574",
                fontWeight: 500,
              }}
            >
              {heroDate}
            </div>
            <div
              className="mt-2 flex items-center gap-1.5 flex-wrap"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "#8A8578",
                letterSpacing: "0.05em",
              }}
            >
              <span>
                {moStr}+{dyStr}+{yrStr}={numSum}
              </span>
              <span style={{ color: "#4A4D54" }}>·</span>
              <span style={{ color: isMasterNum(numerology.singleDigits) ? "#C9A961" : "#5FC9D4" }}>
                <MasterSpan value={numerology.singleDigits} />
              </span>
              <span style={{ color: "#4A4D54" }}>·</span>
              <span>DAY {dayOfYear}</span>
              <span style={{ color: "#4A4D54" }}>·</span>
              <span>WK {weekOfYear}</span>
              {fullMoon && (
                <>
                  <span style={{ color: "#4A4D54" }}>·</span>
                  <span style={{ color: "#C9A961" }}>
                    {moonName || "FULL MOON"} {illumination}%
                  </span>
                </>
              )}
            </div>
            {/* Secondary numerology row */}
            <div
              className="mt-1.5 flex items-center gap-1.5"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "#4A4D54",
                letterSpacing: "0.05em",
              }}
            >
              <span>FULL {numerology.full}</span>
              <span>·</span>
              <span>YEAR {numerology.reducedYear}</span>
              <span>·</span>
              <span>MD {numerology.monthDay}</span>
              <span>·</span>
              <span style={{ color: "#8A8578" }}>{dayName.split(",")[0].toUpperCase()}</span>
            </div>
          </div>

          {/* RIGHT — game counts */}
          <div
            className="relative z-10 text-right shrink-0"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {[
              { label: "GAMES",    val: games.length,  color: "#E8E4D8" },
              { label: "LOCKS",    val: lockCount,     color: "#D4A574" },
              { label: "LEAN",     val: leanCount,     color: "#5FC9D4" },
              { label: "PASS",     val: passCount,     color: "#4A4D54" },
            ].map(({ label, val, color }) => (
              <div key={label} className="flex items-baseline justify-end gap-2 mb-1">
                <span style={{ fontSize: 9, letterSpacing: "0.1em", color: "#4A4D54" }}>
                  {label}
                </span>
                <span style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>
                  {val}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ══════════════════════════════════════════
            ACTION BUTTONS
        ══════════════════════════════════════════ */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
          {[
            {
              key: "fetch", label: "Fetch Games",
              onClick: handleFetch,
              disabled: loading !== null,
              accent: "rgba(212,165,116,0.12)", border: "rgba(212,165,116,0.2)",
            },
            {
              key: "analyze",
              label: analyzeProgress
                ? `${analyzeProgress.current}/${analyzeProgress.total}…`
                : "Analyze & Bet",
              onClick: handleAnalyze,
              disabled: loading !== null || games.length === 0,
              accent: "rgba(212,165,116,0.18)", border: "rgba(212,165,116,0.35)",
            },
            {
              key: "settle", label: "Settle Now",
              onClick: handleSettle,
              disabled: loading !== null || trades.filter(t => t.bet_type !== "analysis").length === 0,
              accent: "rgba(212,165,116,0.06)", border: "rgba(30,37,50,1)",
            },
            {
              key: "manual", label: "Log Pick",
              onClick: () => setShowManualModal(true),
              disabled: games.length === 0,
              accent: "rgba(201,169,97,0.08)", border: "rgba(201,169,97,0.2)",
            },
            {
              key: "briefing", label: "Briefing",
              onClick: () => setShowBriefingModal(true),
              disabled: false,
              accent: "rgba(95,201,212,0.08)", border: "rgba(95,201,212,0.2)",
            },
            {
              key: "debrief", label: "Debrief",
              onClick: () => setShowDebriefModal(true),
              disabled: false,
              accent: "rgba(139,38,53,0.1)", border: "rgba(139,38,53,0.25)",
            },
          ].map(({ key, label, onClick, disabled, accent, border }) => (
            <button
              key={key}
              onClick={onClick}
              disabled={disabled}
              className="flex items-center justify-center py-3 px-3 rounded-xl transition-colors disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed text-sm"
              style={{
                background: accent,
                border: `1px solid ${border}`,
                color: "#E8E4D8",
                fontFamily: "var(--font-display)",
                letterSpacing: "0.06em",
                fontSize: 11,
              }}
            >
              <span>{loading === key ? "..." : label}</span>
            </button>
          ))}
        </div>

        {statusMsg && (
          <div
            className="text-[11px] text-ash mb-4 text-center"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {statusMsg}
          </div>
        )}

        {lastSettlement && (
          <div
            className="text-[10px] text-smoke mb-4 text-center"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Last settlement:{" "}
            <span className="text-ash">
              {new Date(lastSettlement.settledAt).toLocaleString("en-US", {
                month: "short", day: "numeric",
                hour: "numeric", minute: "2-digit", hour12: true,
              })}
            </span>
            {lastSettlement.betsPlaced != null && lastSettlement.betsPlaced > 0 && (
              <>
                {" · "}
                <span className="text-amber">{lastSettlement.wins}W</span>
                {"-"}
                <span className="text-blood">{lastSettlement.losses}L</span>
                {" · "}
                <span className={lastSettlement.dailyPL != null && lastSettlement.dailyPL >= 0 ? "text-amber" : "text-blood"}>
                  {lastSettlement.dailyPL != null
                    ? `${lastSettlement.dailyPL >= 0 ? "+" : ""}$${lastSettlement.dailyPL.toFixed(0)}`
                    : "—"}
                </span>
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════
            BOT SELECTOR — tarot-card tabs
        ══════════════════════════════════════════ */}
        <div className="flex items-stretch gap-2 mb-5 overflow-x-auto">
          {(["all", "A", "B", "C", "D"] as BotSelection[]).map((b) => {
            const active = selectedBot === b;
            return (
              <button
                key={b}
                onClick={() => setSelectedBot(b)}
                className="flex flex-col items-center justify-center gap-0.5 px-5 py-3 rounded-xl transition-all duration-[180ms] shrink-0"
                style={{
                  minWidth: 80,
                  background: active ? "rgba(212,165,116,0.1)" : "rgba(20,25,35,0.5)",
                  border: active ? "1px solid rgba(212,165,116,0.55)" : "1px solid #1E2532",
                  boxShadow: active ? "0 0 16px -4px rgba(212,165,116,0.25)" : "none",
                  opacity: active ? 1 : 0.55,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: b === "all" ? 13 : 22,
                    fontWeight: 600,
                    color: active ? "#D4A574" : "#8A8578",
                    letterSpacing: "0.08em",
                    lineHeight: 1,
                  }}
                >
                  {BOT_LABELS[b].short}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    color: active ? "#8A8578" : "#4A4D54",
                    letterSpacing: "0.08em",
                    whiteSpace: "nowrap",
                  }}
                >
                  {BOT_LABELS[b].method}
                </span>
              </button>
            );
          })}
        </div>

        {/* ══════════════════════════════════════════
            LEAGUE FILTER
        ══════════════════════════════════════════ */}
        <div className="flex items-center gap-2 mb-6">
          {(["ALL", "NBA", "NHL", "MLB"] as League[]).map((l) => (
            <button
              key={l}
              onClick={() => setLeague(l)}
              className="text-[11px] font-medium px-3 py-1.5 rounded-full transition-colors"
              style={{
                fontFamily: "var(--font-display)",
                letterSpacing: "0.08em",
                background: league === l ? "rgba(212,165,116,0.12)" : "transparent",
                border: league === l ? "1px solid rgba(212,165,116,0.3)" : "1px solid transparent",
                color: league === l ? "#D4A574" : "#8A8578",
              }}
            >
              {l} ({leagueCounts[l]})
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════
            PRIMARY LOCK CARD
        ══════════════════════════════════════════ */}
        {(() => {
          const realTrades = trades.filter(t => t.bet_type !== "analysis");
          const best = realTrades.length > 0
            ? realTrades.reduce((b, t) => (t.confidence ?? 0) > (b.confidence ?? 0) ? t : b)
            : null;
          if (!best) return null;
          const game = best.game;

          const awayG = game ? calculateGematria(game.away_team) : null;
          const homeG = game ? calculateGematria(game.home_team) : null;

          const CIPHERS: { label: string; key: "ordinal" | "reduction" | "reverseOrdinal" | "reverseReduction" }[] = [
            { label: "EO", key: "ordinal" },
            { label: "FR", key: "reduction" },
            { label: "RO", key: "reverseOrdinal" },
            { label: "RR", key: "reverseReduction" },
          ];
          const ROW_H  = 22;
          const ROW_GAP = 3;
          const stackH = CIPHERS.length * ROW_H + (CIPHERS.length - 1) * ROW_GAP;

          return (
            <div className="mb-6 card-lock">
              {/* ── Header ── */}
              <div className="flex items-center justify-between mb-4">
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.18em", color: "#D4A574" }}>
                  PRIMARY LOCK · {String(1).padStart(2, "0")} / {String(realTrades.length).padStart(2, "0")}
                </span>
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{ fontFamily: "var(--font-display)", letterSpacing: "0.08em", background: "rgba(212,165,116,0.12)", color: "#D4A574" }}
                  >
                    BOT {best.bot}
                  </span>
                  <LockBadge lockType={best.lock_type} />
                  {game && <span className="text-[10px]" style={{ fontFamily: "var(--font-mono)", color: "#8A8578" }}>{game.league}</span>}
                </div>
              </div>

              {/* ── Pick + confidence ── */}
              <div className="flex items-baseline justify-between mb-4">
                <div className="text-sm font-semibold text-bone">{best.pick}</div>
                <div className="text-right shrink-0 ml-3">
                  <div className="text-xs" style={{ fontFamily: "var(--font-mono)", color: "#8A8578" }}>
                    {best.odds != null ? (best.odds > 0 ? `+${best.odds}` : String(best.odds)) : "—"}
                  </div>
                  <div className="text-2xl font-bold" style={{ fontFamily: "var(--font-mono)", color: "#D4A574", fontVariantNumeric: "tabular-nums" }}>
                    {Math.round(best.confidence ?? 0)}%
                  </div>
                  <div className="text-[9px] text-smoke">confidence</div>
                </div>
              </div>

              {/* ── Cipher stack ── */}
              {game && awayG && homeG && (
                <div style={{ position: "relative", marginBottom: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", columnGap: 12 }}>
                    {/* Away cipher column */}
                    <div style={{ display: "flex", flexDirection: "column", gap: ROW_GAP, alignItems: "flex-end" }}>
                      {CIPHERS.map(({ label, key }) => {
                        const av = awayG[key];
                        const match = av === homeG[key];
                        return (
                          <div key={label} style={{ height: ROW_H, display: "flex", alignItems: "center", gap: 5 }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: match ? "#5FC9D4" : "#4A4D54", letterSpacing: "0.1em" }}>{label}</span>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: match ? "#5FC9D4" : "#8A8578" }}>{av}</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Center: team matchup */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: stackH, textAlign: "center", minWidth: 80 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#8A8578", lineHeight: 1.4 }}>{game.away_team}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#4A4D54", margin: "2px 0" }}>@</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#8A8578", lineHeight: 1.4 }}>{game.home_team}</span>
                    </div>

                    {/* Home cipher column */}
                    <div style={{ display: "flex", flexDirection: "column", gap: ROW_GAP, alignItems: "flex-start" }}>
                      {CIPHERS.map(({ label, key }) => {
                        const hv = homeG[key];
                        const match = awayG[key] === hv;
                        return (
                          <div key={label} style={{ height: ROW_H, display: "flex", alignItems: "center", gap: 5 }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: match ? "#5FC9D4" : "#8A8578" }}>{hv}</span>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: match ? "#5FC9D4" : "#4A4D54", letterSpacing: "0.1em" }}>{label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Hairline connectors across matching cipher rows */}
                  <svg
                    aria-hidden="true"
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", height: stackH, pointerEvents: "none", overflow: "visible" }}
                  >
                    {CIPHERS.map(({ label, key }, i) => {
                      if (awayG[key] !== homeG[key]) return null;
                      const y = i * (ROW_H + ROW_GAP) + ROW_H / 2;
                      return (
                        <line key={label} x1="0" y1={y} x2="100%" y2={y} stroke="#5FC9D4" strokeWidth="0.5" strokeOpacity="0.25" />
                      );
                    })}
                  </svg>
                </div>
              )}

              {/* ── Reasoning prose ── */}
              {best.reasoning && (
                <div
                  className="text-[10px] leading-relaxed line-clamp-3"
                  style={{ color: "#8A8578", borderTop: "1px solid rgba(212,165,116,0.1)", paddingTop: 10 }}
                >
                  {best.reasoning}
                </div>
              )}
            </div>
          );
        })()}

        {/* ══════════════════════════════════════════
            GAME GRID
        ══════════════════════════════════════════ */}
        {filtered.length === 0 ? (
          <div
            className="text-center py-20 rounded-xl"
            style={{ border: "1px solid #1E2532", background: "rgba(11,15,23,0.6)" }}
          >
            <p
              className="text-lg mb-2"
              style={{ fontFamily: "var(--font-display)", letterSpacing: "0.08em", color: "#8A8578" }}
            >
              NO GAMES LOADED
            </p>
            <p className="text-sm text-smoke">
              Click <span className="text-amber">Fetch Games</span> to scan today&apos;s slate
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {filtered.map((game, i) => (
              <GameCard
                key={game.id}
                game={game}
                trades={tradesByGame.get(game.id) ?? []}
                onReanalyze={() => handleReanalyze(game.id)}
                reanalyzing={reanalyzingId === game.id}
                onClick={() => setSelectedGame(game)}
                className="card-mount"
                style={{ animationDelay: `${i * 60}ms` } as React.CSSProperties}
              />
            ))}
          </div>
        )}

        {/* ══════════════════════════════════════════
            DECODE JOURNAL
        ══════════════════════════════════════════ */}
        <div className="mt-10">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen size={13} style={{ color: "#8A8578" }} />
            <span
              className="text-[10px] font-medium tracking-widest"
              style={{ fontFamily: "var(--font-display)", color: "#8A8578", letterSpacing: "0.12em" }}
            >
              DECODE JOURNAL
            </span>
            {notesSaving && (
              <span
                className="text-[10px] animate-pulse"
                style={{ fontFamily: "var(--font-mono)", color: "#4A4D54" }}
              >
                saving…
              </span>
            )}
          </div>
          <textarea
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            rows={5}
            placeholder={`Notes for ${today} — alignments you spotted, narratives in play, numbers to watch…`}
            className="w-full rounded-xl px-4 py-3 text-sm resize-y focus:outline-none transition-colors"
            style={{
              background: "#0B0F17",
              border: "1px solid #1E2532",
              color: "#E8E4D8",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
            }}
            onFocus={e => (e.currentTarget.style.borderColor = "rgba(212,165,116,0.4)")}
            onBlur={e  => (e.currentTarget.style.borderColor = "#1E2532")}
          />
          <p
            className="text-[10px] mt-1"
            style={{ fontFamily: "var(--font-mono)", color: "#4A4D54" }}
          >
            Auto-saved · Injected into all bot prompts on analysis
          </p>
        </div>
      </main>

      {showManualModal && (
        <ManualPickModal
          games={games}
          onClose={() => setShowManualModal(false)}
          onSaved={() => { loadGames(); toast.success("Pick logged"); }}
        />
      )}

      {selectedGame && (
        <GameDetailModal
          game={selectedGame}
          onClose={() => setSelectedGame(null)}
        />
      )}

      {showBriefingModal && (
        <BriefingModal onClose={() => setShowBriefingModal(false)} />
      )}

      {showDebriefModal && (
        <DebriefModal onClose={() => setShowDebriefModal(false)} />
      )}
    </div>
  );
}
