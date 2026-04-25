"use client";

import { useState, useEffect } from "react";
import { X, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import type { GameBreakdown, DebriefStats, GameEntry } from "@/app/api/debrief/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getYesterdayET(): string {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  et.setDate(et.getDate() - 1);
  return `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, "0")}-${String(et.getDate()).padStart(2, "0")}`;
}

function shiftDate(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d!);
  dt.setDate(dt.getDate() + delta);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function getTodayET(): string {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  return `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, "0")}-${String(et.getDate()).padStart(2, "0")}`;
}

// ── Result badge ──────────────────────────────────────────────────────────────

const RESULT_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  win:       { label: "WIN",      color: "#D4A574", bg: "rgba(212,165,116,0.15)" },
  loss:      { label: "LOSS",     color: "#8B2635", bg: "rgba(139,38,53,0.18)"  },
  push:      { label: "PUSH",     color: "#8A8578", bg: "rgba(138,133,120,0.12)" },
  lean_hit:  { label: "HIT",      color: "#5FC9D4", bg: "rgba(95,201,212,0.12)" },
  lean_miss: { label: "MISS",     color: "#4A4D54", bg: "rgba(74,77,84,0.12)"   },
  pass:      { label: "PASS",     color: "#4A4D54", bg: "rgba(74,77,84,0.10)"   },
  pending:   { label: "PENDING",  color: "#4A4D54", bg: "rgba(74,77,84,0.10)"   },
};

function ResultBadge({ result }: { result: GameEntry["result"] }) {
  const s = RESULT_STYLE[result] ?? RESULT_STYLE.pending!;
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: "0.12em",
        color: s.color,
        background: s.bg,
        padding: "1px 5px",
        borderRadius: 3,
      }}
    >
      {s.label}
    </span>
  );
}

// ── Narrative renderer ────────────────────────────────────────────────────────

function inlineMd(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong style='color:#E8E4D8;font-weight:600'>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em style='color:#8A8578;font-style:italic'>$1</em>");
}

function NarrativeContent({ text }: { text: string }) {
  const lines = text.split("\n");
  const els: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith("## ")) {
      els.push(
        <h3
          key={i}
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 9,
            letterSpacing: "0.16em",
            color: "#D4A574",
            marginTop: i === 0 ? 0 : 16,
            marginBottom: 6,
            paddingBottom: 4,
            borderBottom: "1px solid rgba(212,165,116,0.12)",
          }}
        >
          {line.slice(3).toUpperCase()}
        </h3>
      );
    } else if (line.startsWith("- ") || line.startsWith("• ")) {
      els.push(
        <div key={i} style={{ display: "flex", gap: 6, marginBottom: 2 }}>
          <span style={{ color: "#D4A574", fontSize: 11, lineHeight: 1.5, flexShrink: 0 }}>·</span>
          <span
            style={{ fontSize: 11, color: "#8A8578", lineHeight: 1.6 }}
            dangerouslySetInnerHTML={{ __html: inlineMd(line.slice(2)) }}
          />
        </div>
      );
    } else if (line.trim() === "") {
      els.push(<div key={i} style={{ height: 4 }} />);
    } else {
      els.push(
        <p
          key={i}
          style={{ fontSize: 11, color: "#8A8578", lineHeight: 1.6, marginBottom: 2 }}
          dangerouslySetInnerHTML={{ __html: inlineMd(line) }}
        />
      );
    }
  }

  return <div>{els}</div>;
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

function StatsBar({ stats }: { stats: DebriefStats }) {
  const plColor = stats.netPL >= 0 ? "#D4A574" : "#8B2635";
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(6, 1fr)",
        gap: 6,
        padding: "10px 0",
        borderBottom: "1px solid rgba(30,37,50,1)",
        marginBottom: 14,
      }}
    >
      {[
        { label: "W",        val: stats.wins,      color: "#D4A574" },
        { label: "L",        val: stats.losses,    color: "#8B2635" },
        { label: "P",        val: stats.pushes,    color: "#8A8578" },
        { label: "HIT",      val: stats.leanHits,  color: "#5FC9D4" },
        { label: "MISS",     val: stats.leanMisses,color: "#4A4D54" },
        { label: "NET",      val: `${stats.netPL >= 0 ? "+" : ""}$${stats.netPL.toFixed(0)}`, color: plColor },
      ].map(({ label, val, color }) => (
        <div key={label} style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 17, fontWeight: 700, color, lineHeight: 1 }}>
            {val}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "#4A4D54", letterSpacing: "0.1em", marginTop: 2 }}>
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Game card ─────────────────────────────────────────────────────────────────

function GameCard({ game }: { game: GameBreakdown }) {
  const score = game.homeScore != null && game.awayScore != null
    ? `${game.awayScore}–${game.homeScore}`
    : "TBD";

  return (
    <div
      style={{
        background: "rgba(11,15,23,0.6)",
        border: "1px solid #1E2532",
        borderRadius: 10,
        padding: "10px 12px",
        marginBottom: 8,
      }}
    >
      {/* Match header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#E8E4D8" }}>
            {game.awayTeam}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#4A4D54", margin: "0 4px" }}>@</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#E8E4D8" }}>
            {game.homeTeam}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "#D4A574" }}>
            {score}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "#4A4D54", letterSpacing: "0.08em" }}>
            {game.league}
          </span>
        </div>
      </div>

      {/* Entries */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {game.entries.map((e, idx) => (
          <div
            key={idx}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 6px",
              borderRadius: 5,
              background: "rgba(20,25,35,0.4)",
            }}
          >
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "#4A4D54", width: 34, flexShrink: 0 }}>
              BOT {e.bot}
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                color: e.betType === "analysis" ? "#5FC9D4" : "#8A8578",
                letterSpacing: "0.08em",
                width: 28,
                flexShrink: 0,
              }}
            >
              {e.betType === "analysis" ? "LEAN" : "BET"}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#E8E4D8", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {e.pick}
            </span>
            {e.confidence != null && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "#4A4D54", flexShrink: 0 }}>
                {Math.round(e.confidence)}%
              </span>
            )}
            <ResultBadge result={e.result} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface DebriefModalProps {
  onClose: () => void;
}

interface DebriefData {
  date: string;
  narrative: string | null;
  generatedAt: string | null;
  selfHealApplied: boolean;
  stats: DebriefStats;
  games: GameBreakdown[];
  signalUpdates?: number;
}

export default function DebriefModal({ onClose }: DebriefModalProps) {
  const today = getTodayET();
  const [date, setDate] = useState(getYesterdayET());
  const [data, setData] = useState<DebriefData | null>(null);
  const [fetching, setFetching] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadDebrief();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function loadDebrief() {
    setFetching(true);
    setError("");
    try {
      const res = await fetch(`/api/debrief?date=${date}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(String(e));
    } finally {
      setFetching(false);
    }
  }

  async function runDebrief() {
    setRunning(true);
    setError("");
    try {
      const res = await fetch("/api/debrief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  }

  const canGoForward = date < today;
  const hasNarrative = Boolean(data?.narrative);
  const hasGames     = (data?.games?.length ?? 0) > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 680,
          height: "88vh",
          display: "flex",
          flexDirection: "column",
          background: "rgba(14,18,28,0.96)",
          backdropFilter: "blur(20px) saturate(140%)",
          WebkitBackdropFilter: "blur(20px) saturate(140%)",
          border: "1px solid rgba(212,165,116,0.4)",
          borderRadius: 14,
          boxShadow: "0 0 50px -12px rgba(244,184,96,0.2), inset 0 0 0 1px rgba(212,165,116,0.08)",
          padding: "16px 20px",
        }}
      >
        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 10, letterSpacing: "0.2em", color: "#D4A574" }}>
              DEBRIEF
            </span>
            {data?.selfHealApplied && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 8,
                  letterSpacing: "0.1em",
                  color: "#5FC9D4",
                  background: "rgba(95,201,212,0.1)",
                  padding: "1px 6px",
                  borderRadius: 3,
                }}
              >
                {data.signalUpdates != null ? `${data.signalUpdates} SIGNALS UPDATED` : "SELF-HEAL APPLIED"}
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Date nav */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button
                onClick={() => setDate(d => shiftDate(d, -1))}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#8A8578", padding: 2 }}
              >
                <ChevronLeft size={13} />
              </button>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#8A8578", letterSpacing: "0.08em" }}>
                {date}
              </span>
              <button
                onClick={() => canGoForward && setDate(d => shiftDate(d, 1))}
                style={{ background: "none", border: "none", cursor: canGoForward ? "pointer" : "default", color: canGoForward ? "#8A8578" : "#1E2532", padding: 2 }}
                disabled={!canGoForward}
              >
                <ChevronRight size={13} />
              </button>
            </div>

            {/* Run button */}
            <button
              onClick={runDebrief}
              disabled={running || fetching}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontFamily: "var(--font-display)",
                fontSize: 9,
                letterSpacing: "0.12em",
                color: "#E8E4D8",
                background: "rgba(212,165,116,0.1)",
                border: "1px solid rgba(212,165,116,0.3)",
                padding: "4px 10px",
                borderRadius: 6,
                cursor: running || fetching ? "not-allowed" : "pointer",
                opacity: running || fetching ? 0.5 : 1,
              }}
            >
              <RefreshCw size={9} className={running ? "animate-spin" : ""} />
              {running ? "RUNNING…" : hasNarrative ? "RE-RUN" : "RUN DEBRIEF"}
            </button>

            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#4A4D54" }}>
              <X size={15} />
            </button>
          </div>
        </div>

        {/* ── Stats bar ── */}
        {data?.stats && <StatsBar stats={data.stats} />}

        {/* ── Scrollable content ── */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {error && (
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#8B2635", marginBottom: 10 }}>{error}</p>
          )}

          {fetching && !data && (
            <div style={{ textAlign: "center", padding: "60px 0", fontFamily: "var(--font-mono)", fontSize: 11, color: "#4A4D54" }}>
              Loading…
            </div>
          )}

          {!fetching && !running && !hasNarrative && !hasGames && (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <p style={{ fontFamily: "var(--font-display)", fontSize: 10, letterSpacing: "0.16em", color: "#4A4D54" }}>
                NO DATA FOR {date}
              </p>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#4A4D54", marginTop: 6 }}>
                Run debrief after games are settled.
              </p>
            </div>
          )}

          {running && (
            <div style={{ textAlign: "center", padding: "60px 0", fontFamily: "var(--font-mono)", fontSize: 11, color: "#D4A574" }}>
              Generating debrief + updating signal weights…
            </div>
          )}

          {/* Narrative */}
          {hasNarrative && !running && (
            <div
              style={{
                background: "rgba(11,15,23,0.5)",
                border: "1px solid rgba(212,165,116,0.1)",
                borderRadius: 10,
                padding: "14px 16px",
                marginBottom: 16,
              }}
            >
              {data?.generatedAt && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "#4A4D54", letterSpacing: "0.1em", marginBottom: 10 }}>
                  GENERATED {new Date(data.generatedAt).toLocaleString("en-US", {
                    month: "short", day: "numeric",
                    hour: "numeric", minute: "2-digit", hour12: true,
                  }).toUpperCase()}
                </div>
              )}
              <NarrativeContent text={data!.narrative!} />
            </div>
          )}

          {/* Game breakdown */}
          {hasGames && !running && (
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 8, letterSpacing: "0.18em", color: "#4A4D54", marginBottom: 8 }}>
                GAME BREAKDOWN
              </div>
              {data!.games.map(game => (
                <GameCard key={game.gameId} game={game} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
