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
}

const BOT_BADGE: Record<string, string> = {
  A: "bg-blue-500/20 text-blue-400",
  B: "bg-cyan-500/20 text-cyan-400",
  C: "bg-purple-500/20 text-purple-400",
};

const LEAGUE_COLORS: Record<string, string> = {
  NBA: "bg-orange-500/20 text-orange-400",
  NHL: "bg-blue-500/20 text-blue-400",
  MLB: "bg-red-500/20 text-red-400",
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
    <div className="mt-2 pt-2 border-t border-border">
      <div className="text-[9px] uppercase tracking-wider text-muted mb-1.5">
        Book Lines
      </div>
      <table className="w-full text-[10px] font-[family-name:var(--font-mono)]">
        <thead>
          <tr className="text-muted">
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
              <tr key={bookName} className="border-t border-border/50">
                <td className="py-0.5 text-muted">{bookName}</td>
                <td className="py-0.5 text-right">{formatOdds(line.moneylineAway)}</td>
                <td className="py-0.5 text-right">{formatOdds(line.moneylineHome)}</td>
                <td className="py-0.5 text-right text-muted">
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
}: GameCardProps) {
  const [showBooks, setShowBooks] = useState(false);
  const odds = game.polymarket_odds;
  const realBets = trades.filter((t) => t.bet_type !== "analysis");
  const passLeans = trades.filter((t) => t.bet_type === "analysis");
  const hasBets = realBets.length > 0;
  const hasLeans = passLeans.length > 0;

  const statusDisplay =
    game.status === "final"
      ? "FINAL"
      : game.status === "in_progress"
        ? "LIVE"
        : formatTime(game.start_time);

  const statusColor =
    game.status === "in_progress"
      ? "text-warning"
      : game.status === "final"
        ? "text-muted"
        : "text-text";

  // Best available: prefer The Odds API best, fall back to polymarket
  const showBestML =
    odds?.bestMoneylineHome != null || odds?.moneylineHome != null;
  const homeML = odds?.bestMoneylineHome ?? odds?.moneylineHome ?? null;
  const awayML = odds?.bestMoneylineAway ?? odds?.moneylineAway ?? null;
  const ouLine = odds?.bestOverLine ?? odds?.overUnderLine ?? null;
  const bestHomeBook = odds?.bestBookHome;
  const bestAwayBook = odds?.bestBookAway;

  const hasBooks =
    odds?.books != null && Object.keys(odds.books).length > 0;

  const sharpSide = odds?.sharpHome
    ? game.home_team.split(" ").pop()
    : odds?.sharpAway
      ? game.away_team.split(" ").pop()
      : null;
  const sharpLabel = sharpSide
    ? `SHARP ${sharpSide}`
    : odds?.sharpOU
      ? `SHARP ${odds.sharpOU.toUpperCase()}`
      : null;

  return (
    <div
      onClick={onClick}
      className={`card hover:border-border-accent transition-colors ${
        hasBets ? "border-l-2 border-l-success" : ""
      } ${onClick ? "cursor-pointer" : ""}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${LEAGUE_COLORS[game.league] || ""}`}
          >
            {game.league}
          </span>
          {game.is_primetime && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400">
              PT
            </span>
          )}
          {sharpLabel && (
            <span
              title={`Sharp action: ${odds?.sharpBook ?? 'sharp book'} vs ${odds?.softBook ?? 'soft book'} implied prob gap ≥3%`}
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 flex items-center gap-0.5"
            >
              <Zap size={8} />
              {sharpLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onReanalyze && (
            <button
              onClick={(e) => { e.stopPropagation(); onReanalyze(); }}
              disabled={reanalyzing}
              title="Re-analyze this game"
              className="text-muted hover:text-accent transition-colors disabled:opacity-40"
            >
              <RefreshCw size={11} className={reanalyzing ? "animate-spin" : ""} />
            </button>
          )}
          <span className={`text-xs font-medium ${statusColor}`}>
            {statusDisplay}
          </span>
        </div>
      </div>

      {/* Teams */}
      <div className="text-center mb-2">
        <div className="text-sm text-muted">{game.away_team}</div>
        <div className="text-[10px] text-muted my-0.5">at</div>
        <div className="text-sm font-semibold">{game.home_team}</div>
      </div>

      {/* Score */}
      {(game.status === "in_progress" || game.status === "final") &&
        game.home_score != null && (
          <div className="text-center mb-2">
            <span className="font-[family-name:var(--font-mono)] text-lg font-bold">
              {game.away_score} — {game.home_score}
            </span>
          </div>
        )}

      {/* Venue */}
      {game.venue && (
        <div className="text-[10px] text-muted text-center mb-3 truncate">
          {game.venue}
        </div>
      )}

      {/* Lock badge + confidence */}
      {game.analyzed && (
        <div className="flex items-center justify-center gap-2 mb-2">
          <LockBadge lockType={trades[0]?.lock_type || game.lock_type || "no_lock"} />
          {(trades[0]?.confidence != null || game.gematria_confidence != null) && (
            <span className="text-[10px] text-muted">
              {Math.round(trades[0]?.confidence ?? game.gematria_confidence ?? 0)}%
            </span>
          )}
        </div>
      )}

      {/* Best available lines */}
      {showBestML && (
        <div className="text-[10px] text-center mb-1 font-[family-name:var(--font-mono)]">
          <div className="text-muted">
            {bestAwayBook && (
              <span className="text-[9px] text-success mr-0.5">
                {bestAwayBook.slice(0, 3).toUpperCase()}
              </span>
            )}
            <span>{formatOdds(awayML)}</span>
            <span className="text-muted mx-1">/</span>
            {bestHomeBook && (
              <span className="text-[9px] text-success mr-0.5">
                {bestHomeBook.slice(0, 3).toUpperCase()}
              </span>
            )}
            <span>{formatOdds(homeML)}</span>
            {ouLine != null && (
              <span className="ml-2 text-muted">O/U {ouLine}</span>
            )}
          </div>
          {odds?.bestMoneylineHome != null && (
            <div className="text-[9px] text-muted mt-0.5">best available</div>
          )}
        </div>
      )}

      {/* Expandable book comparison */}
      {hasBooks && (
        <div onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setShowBooks(!showBooks)}
            className="flex items-center gap-1 text-[10px] text-muted hover:text-text transition-colors mx-auto mt-1"
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

      {/* Bot picks + leans */}
      {(hasBets || hasLeans) && (
        <div className="mt-2 pt-2 border-t border-border space-y-1">
          {realBets.map((t) => (
            <div key={t.id} className="flex items-center gap-1.5 text-xs justify-center">
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${BOT_BADGE[t.bot] ?? "bg-surface text-muted"}`}>
                {t.bot}
              </span>
              <span className="text-success font-medium truncate">
                {t.pick} · {t.units}u
              </span>
            </div>
          ))}
          {passLeans.map((t) => (
            <div key={t.id} className="flex items-center gap-1.5 text-xs justify-center opacity-50">
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${BOT_BADGE[t.bot] ?? "bg-surface text-muted"}`}>
                {t.bot}
              </span>
              <span className="text-muted truncate">
                {t.pick} · pass
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
