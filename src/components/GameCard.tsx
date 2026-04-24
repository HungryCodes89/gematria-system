"use client";

import { useState } from "react";
import { RefreshCw, ChevronDown, ChevronUp, Zap } from "lucide-react";
import type { Game, PaperTrade, BookOddsLine } from "@/lib/types";
import LockBadge from "./LockBadge";

interface GameCardProps {
  game: Game;
  trades?: PaperTrade[];
  onReanalyze?: () => void;
  reanalyzing?: boolean;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

const BOT_BADGE: Record<string, string> = {
  A: "bg-fog/80 text-ash",
  B: "bg-cipher/10 text-cipher",
  C: "bg-amber/10 text-amber",
  D: "bg-gold/10 text-gold",
};

const LEAGUE_COLORS: Record<string, string> = {
  NBA: "bg-amber/15 text-amber",
  NHL: "bg-cipher/15 text-cipher",
  MLB: "bg-blood/15 text-blood",
};

const BOOK_ORDER = ["Pinnacle", "DraftKings", "FanDuel", "BetMGM", "Caesars"];

function formatOdds(odds: number | null): string {
  if (odds == null) return "—";
  return odds > 0 ? `+${odds}` : String(odds);
}

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

/* Wax-seal sigil for Tier-1 lock cards */
function LockSigil({ lockType }: { lockType: string }) {
  const numeral = lockType === "triple_lock" ? "III" : "II";
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="none"
      style={{ color: "#D4A574" }}
    >
      <circle cx="14" cy="14" r="12" stroke="currentColor" strokeWidth="0.75" strokeOpacity="0.5" />
      <circle cx="14" cy="14" r="9"  stroke="currentColor" strokeWidth="1"    strokeOpacity="0.7" />
      <circle cx="14" cy="14" r="5.5" stroke="currentColor" strokeWidth="1.25" />
      <text
        x="14" y="18"
        textAnchor="middle"
        fill="currentColor"
        fontSize="5.5"
        fontFamily="var(--font-display)"
        letterSpacing="1"
        fontWeight="600"
      >
        {numeral}
      </text>
    </svg>
  );
}

function BookLinesTable({
  books,
  homeTeam,
  awayTeam,
}: {
  books: Record<string, BookOddsLine>;
  homeTeam: string;
  awayTeam: string;
}) {
  const homeShort = homeTeam.split(" ").pop() ?? homeTeam;
  const awayShort = awayTeam.split(" ").pop() ?? awayTeam;
  const orderedBooks = BOOK_ORDER.filter((b) => books[b]);
  const extraBooks = Object.keys(books).filter((b) => !BOOK_ORDER.includes(b));
  const allBooks = [...orderedBooks, ...extraBooks];

  if (allBooks.length === 0) return null;

  return (
    <div className="mt-2 pt-2 border-t border-fog/50">
      <div className="text-[9px] uppercase tracking-wider text-ash mb-1.5">
        Book Lines
      </div>
      <table className="w-full text-[10px]" style={{ fontFamily: "var(--font-mono)" }}>
        <thead>
          <tr className="text-ash">
            <th className="text-left font-normal pb-0.5">Book</th>
            <th className="text-right font-normal pb-0.5">{awayShort}</th>
            <th className="text-right font-normal pb-0.5">{homeShort}</th>
            <th className="text-right font-normal pb-0.5">O/U</th>
          </tr>
        </thead>
        <tbody>
          {allBooks.map((bookName) => {
            const line = books[bookName];
            return (
              <tr key={bookName} className="border-t border-fog/30">
                <td className="py-0.5 text-ash">{bookName}</td>
                <td className="py-0.5 text-right text-bone">{formatOdds(line.moneylineAway)}</td>
                <td className="py-0.5 text-right text-bone">{formatOdds(line.moneylineHome)}</td>
                <td className="py-0.5 text-right text-ash">
                  {line.overUnderLine ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function GameCard({
  game,
  trades = [],
  onReanalyze,
  reanalyzing,
  onClick,
  className = "",
  style,
}: GameCardProps) {
  const [showBooks, setShowBooks] = useState(false);

  const odds = game.polymarket_odds;
  const realBets  = trades.filter((t) => t.bet_type !== "analysis");
  const passLeans = trades.filter((t) => t.bet_type === "analysis");
  const hasBets  = realBets.length > 0;
  const hasLeans = passLeans.length > 0;

  /* ── Tier determination ── */
  const lockType = (realBets[0]?.lock_type ?? game.lock_type ?? "no_lock") as string;
  const isLockTier = lockType === "triple_lock" || lockType === "double_lock";
  const isLeanTier = !isLockTier && (lockType === "single_lock" || hasBets || hasLeans || game.analyzed);
  const isPassTier = !isLockTier && !isLeanTier;
  const isSacrifice = lockType === "sacrifice_lock";

  const cardClass = isLockTier
    ? "card-lock"
    : isLeanTier
      ? "card-lean"
      : "card-pass";

  /* ── Status ── */
  const statusDisplay =
    game.status === "final"      ? "FINAL" :
    game.status === "in_progress"? "LIVE"  :
    formatTime(game.start_time);

  const statusColor =
    game.status === "in_progress" ? "text-gold" :
    game.status === "final"       ? "text-ash"  : "text-bone";

  /* ── Best available lines ── */
  const showBestML = odds?.bestMoneylineHome != null || odds?.moneylineHome != null;
  const homeML = odds?.bestMoneylineHome ?? odds?.moneylineHome ?? null;
  const awayML = odds?.bestMoneylineAway ?? odds?.moneylineAway ?? null;
  const ouLine = odds?.bestOverLine ?? odds?.overUnderLine ?? null;
  const bestHomeBook = odds?.bestBookHome;
  const bestAwayBook = odds?.bestBookAway;
  const hasBooks = odds?.books != null && Object.keys(odds.books).length > 0;

  /* ── Sharp money badges ── */
  const sharpBetTeam  = odds?.sharpHome ? game.home_team : odds?.sharpAway ? game.away_team : null;
  const sharpFadeTeam = odds?.sharpHome ? game.away_team : odds?.sharpAway ? game.home_team : null;
  const sharpGapRaw   = odds?.sharpHome ? odds?.mlGapHome : odds?.sharpAway ? odds?.mlGapAway : null;
  const sharpGap      = sharpGapRaw != null ? Math.abs(sharpGapRaw) : null;
  const shortName     = (n: string) => n.split(" ").pop() ?? n;

  /* ── Lock-tier header strip ── */
  const lockHeaderColor = isLockTier
    ? "text-amber"
    : isLeanTier && hasBets
      ? "text-amber"
      : "text-ash";

  return (
    <div
      onClick={onClick}
      style={style}
      className={`${cardClass} ${isLockTier ? "md:col-span-2" : ""} ${onClick ? "cursor-pointer" : ""} ${className}`}
    >
      {/* ── Header row ── */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 flex-wrap">

          {/* Tier-1 wax seal */}
          {isLockTier && (
            <LockSigil lockType={lockType} />
          )}

          {/* Tier-2 cyan dot */}
          {isLeanTier && (
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: "#5FC9D4", boxShadow: "0 0 6px #5FC9D4" }}
            />
          )}

          {/* Sacrifice triangle for pass-tier */}
          {isPassTier && isSacrifice && (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="#8B2635" opacity={0.8}>
              <path d="M5 1 L9 9 L1 9 Z" />
            </svg>
          )}

          {/* League badge */}
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${LEAGUE_COLORS[game.league] ?? ""}`}
            style={{ fontFamily: "var(--font-display)", letterSpacing: "0.08em" }}
          >
            {game.league}
          </span>

          {game.is_primetime && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gold/15 text-gold"
              style={{ fontFamily: "var(--font-display)", letterSpacing: "0.06em" }}
            >
              PT
            </span>
          )}

          {/* Sharp money — BET (amber arrow) */}
          {!isPassTier && sharpBetTeam && (
            <span
              title={`${odds?.sharpBook ?? "Sharp book"} implied prob gap: +${sharpGap?.toFixed(1) ?? "?"}% over ${odds?.softBook ?? "soft book"}`}
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5"
              style={{ background: "rgba(212,165,116,0.15)", color: "#D4A574", fontFamily: "var(--font-mono)" }}
            >
              <Zap size={7} />
              {`BET ${shortName(sharpBetTeam)}${sharpGap != null ? ` +${sharpGap.toFixed(1)}%` : ""}`}
            </span>
          )}

          {/* Sharp money — FADE (blood) */}
          {!isPassTier && sharpFadeTeam && (
            <span
              title={`Fade ${sharpFadeTeam} — public money, sharps against`}
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5"
              style={{ background: "rgba(139,38,53,0.2)", color: "#C04050", fontFamily: "var(--font-mono)" }}
            >
              <Zap size={7} />
              {`FADE ${shortName(sharpFadeTeam)}${sharpGap != null ? ` ${sharpGap.toFixed(1)}%` : ""}`}
            </span>
          )}

          {/* O/U sharp */}
          {!isPassTier && !sharpBetTeam && odds?.sharpOU && (
            <span
              title={`Sharp money on the ${odds.sharpOU}`}
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5"
              style={{ background: "rgba(201,169,97,0.15)", color: "#C9A961", fontFamily: "var(--font-mono)" }}
            >
              <Zap size={7} />
              {`SHARP ${odds.sharpOU.toUpperCase()}`}
            </span>
          )}
        </div>

        {/* Status + reanalyze */}
        <div className="flex items-center gap-2 shrink-0">
          {onReanalyze && (
            <button
              onClick={(e) => { e.stopPropagation(); onReanalyze(); }}
              disabled={reanalyzing}
              title="Re-analyze"
              className="text-ash hover:text-amber transition-colors disabled:opacity-40"
            >
              <RefreshCw size={11} className={reanalyzing ? "animate-spin" : ""} />
            </button>
          )}
          <span
            className={`text-xs font-medium ${statusColor}`}
            style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}
          >
            {statusDisplay}
          </span>
        </div>
      </div>

      {/* ── Teams ── */}
      <div className="text-center mb-2">
        <div
          className={`${isLockTier ? "text-base" : "text-sm"} text-ash`}
          style={isLockTier ? { fontFamily: "var(--font-display)", letterSpacing: "0.06em", color: "#8A8578" } : {}}
        >
          {game.away_team}
        </div>
        <div className="text-[10px] text-smoke my-0.5">at</div>
        <div
          className={`${isLockTier ? "text-lg font-semibold" : "text-sm font-semibold"} text-bone`}
          style={isLockTier ? { fontFamily: "var(--font-display)", letterSpacing: "0.06em" } : {}}
        >
          {game.home_team}
        </div>
      </div>

      {/* ── Score ── */}
      {(game.status === "in_progress" || game.status === "final") &&
        game.home_score != null && (
          <div className="text-center mb-2">
            <span
              className="text-lg font-bold"
              style={{ fontFamily: "var(--font-mono)", color: "#E8E4D8" }}
            >
              {game.away_score} — {game.home_score}
            </span>
          </div>
        )}

      {/* ── Venue ── */}
      {game.venue && (
        <div className="text-[10px] text-ash text-center mb-3 truncate">
          {game.venue}
        </div>
      )}

      {/* ── Lock badge + confidence ── */}
      {game.analyzed && (
        <div className="flex items-center justify-center gap-2 mb-2">
          <LockBadge lockType={realBets[0]?.lock_type || game.lock_type || "no_lock"} />
          {(realBets[0]?.confidence != null || game.gematria_confidence != null) && (
            <span className="text-[10px] text-ash" style={{ fontFamily: "var(--font-mono)" }}>
              {Math.round(realBets[0]?.confidence ?? game.gematria_confidence ?? 0)}%
            </span>
          )}
        </div>
      )}

      {/* ── Best available lines ── */}
      {showBestML && (
        <div
          className="text-[10px] text-center mb-1"
          style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}
        >
          <div className="text-ash">
            {bestAwayBook && (
              <span className="text-[9px] text-cipher mr-0.5">
                {bestAwayBook.slice(0, 3).toUpperCase()}
              </span>
            )}
            <span className="text-bone">{formatOdds(awayML)}</span>
            <span className="text-smoke mx-1">/</span>
            {bestHomeBook && (
              <span className="text-[9px] text-cipher mr-0.5">
                {bestHomeBook.slice(0, 3).toUpperCase()}
              </span>
            )}
            <span className="text-bone">{formatOdds(homeML)}</span>
            {ouLine != null && (
              <span className="ml-2 text-ash">O/U {ouLine}</span>
            )}
          </div>
          {odds?.bestMoneylineHome != null && (
            <div className="text-[9px] text-smoke mt-0.5">best available</div>
          )}
        </div>
      )}

      {/* ── Expandable book comparison ── */}
      {hasBooks && (
        <div onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setShowBooks(!showBooks)}
            className="flex items-center gap-1 text-[10px] text-ash hover:text-bone transition-colors mx-auto mt-1"
          >
            {showBooks ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            {showBooks ? "Hide lines" : "All books"}
          </button>
          {showBooks && odds?.books && (
            <BookLinesTable
              books={odds.books}
              homeTeam={game.home_team}
              awayTeam={game.away_team}
            />
          )}
        </div>
      )}

      {/* ── Bot picks + leans ── */}
      {(hasBets || hasLeans) && (
        <div className="mt-2 pt-2 border-t border-fog/50 space-y-1">
          {realBets.map((t) => (
            <div key={t.id} className="flex items-center gap-1.5 text-xs justify-center">
              <span
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${BOT_BADGE[t.bot] ?? "bg-fog text-ash"}`}
                style={{ fontFamily: "var(--font-display)", letterSpacing: "0.06em" }}
              >
                {t.bot}
              </span>
              <span
                className="text-amber font-medium truncate"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {t.pick} · {t.units}u
              </span>
            </div>
          ))}
          {passLeans.map((t) => (
            <div key={t.id} className="flex items-center gap-1.5 text-xs justify-center opacity-40">
              <span
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${BOT_BADGE[t.bot] ?? "bg-fog text-ash"}`}
                style={{ fontFamily: "var(--font-display)", letterSpacing: "0.06em" }}
              >
                {t.bot}
              </span>
              <span className="text-ash truncate" style={{ fontFamily: "var(--font-mono)" }}>
                {t.pick} · pass
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Tier-1 WIN DIRECTION strip ── */}
      {isLockTier && hasBets && (
        <div
          className="mt-3 pt-2 border-t flex items-center justify-center gap-4 text-[9px]"
          style={{
            borderColor: "rgba(212,165,116,0.25)",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.08em",
            color: "#D4A574",
          }}
        >
          <span>WIN · {realBets[0].pick.split(" ").slice(-1)[0]?.toUpperCase()}</span>
          <span style={{ color: "#8A8578" }}>·</span>
          <span>{realBets[0].units}u</span>
          {realBets[0].confidence != null && (
            <>
              <span style={{ color: "#8A8578" }}>·</span>
              <span>{Math.round(realBets[0].confidence)}% CONF</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
