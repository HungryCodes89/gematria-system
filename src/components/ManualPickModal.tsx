"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { Game } from "@/lib/types";

interface ManualPickModalProps {
  games: Game[];
  onClose: () => void;
  onSaved: () => void;
}

export default function ManualPickModal({ games, onClose, onSaved }: ManualPickModalProps) {
  const [gameId, setGameId] = useState(games[0]?.id ?? "");
  const [bot, setBot] = useState<"A" | "B" | "C" | "D">("A");
  const [betType, setBetType] = useState<"moneyline" | "over_under">("moneyline");
  const [pick, setPick] = useState("");
  const [pickedSide, setPickedSide] = useState<"home" | "away" | "">("");
  const [odds, setOdds] = useState("");
  const [units, setUnits] = useState("1");
  const [reasoning, setReasoning] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedGame = games.find((g) => g.id === gameId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!gameId || !pick || !odds || !units) {
      setError("Fill in all required fields.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/trades/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId,
          bot,
          betType,
          pick,
          pickedSide: betType === "moneyline" ? (pickedSide || null) : null,
          odds: parseInt(odds),
          units: parseFloat(units),
          reasoning,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Failed to save pick");
        return;
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="card w-full max-w-md relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-muted hover:text-text"
        >
          <X size={16} />
        </button>

        <h2 className="text-sm font-semibold tracking-wide uppercase mb-4">
          Log Manual Pick
        </h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Game select */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted mb-1">
              Game *
            </label>
            <select
              value={gameId}
              onChange={(e) => setGameId(e.target.value)}
              className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text"
            >
              {games.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.away_team} @ {g.home_team} ({g.league})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Bot */}
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-muted mb-1">
                Bot *
              </label>
              <select
                value={bot}
                onChange={(e) => setBot(e.target.value as "A" | "B" | "C" | "D")}
                className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text"
              >
                <option value="A">Bot A — Basic</option>
                <option value="B">Bot B — HUNGRY</option>
                <option value="C">Bot C — AJ</option>
                <option value="D">Bot D — Narrative Scout</option>
              </select>
            </div>

            {/* Bet type */}
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-muted mb-1">
                Type *
              </label>
              <select
                value={betType}
                onChange={(e) => setBetType(e.target.value as "moneyline" | "over_under")}
                className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text"
              >
                <option value="moneyline">Moneyline</option>
                <option value="over_under">Total (O/U)</option>
              </select>
            </div>
          </div>

          {/* Pick */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted mb-1">
              {betType === "over_under" ? 'Pick (e.g. "Over 215.5") *' : "Pick (team name) *"}
            </label>
            <input
              type="text"
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              placeholder={betType === "over_under" ? "Over 215.5" : selectedGame?.home_team ?? "Team name"}
              className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text placeholder:text-muted"
            />
          </div>

          {/* Side (moneyline only) */}
          {betType === "moneyline" && (
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-muted mb-1">
                Side
              </label>
              <select
                value={pickedSide}
                onChange={(e) => setPickedSide(e.target.value as "home" | "away" | "")}
                className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text"
              >
                <option value="">— select —</option>
                <option value="home">Home ({selectedGame?.home_team})</option>
                <option value="away">Away ({selectedGame?.away_team})</option>
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {/* Odds */}
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-muted mb-1">
                Odds (American) *
              </label>
              <input
                type="number"
                value={odds}
                onChange={(e) => setOdds(e.target.value)}
                placeholder="-110"
                className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text placeholder:text-muted"
              />
            </div>

            {/* Units */}
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-muted mb-1">
                Units *
              </label>
              <input
                type="number"
                min="0.5"
                max="5"
                step="0.5"
                value={units}
                onChange={(e) => setUnits(e.target.value)}
                className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text"
              />
            </div>
          </div>

          {/* Reasoning */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted mb-1">
              Reasoning
            </label>
            <textarea
              value={reasoning}
              onChange={(e) => setReasoning(e.target.value)}
              rows={2}
              placeholder="Why this pick..."
              className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text placeholder:text-muted resize-none"
            />
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2 bg-accent/20 border border-accent/30 hover:bg-accent/30 rounded text-sm font-medium transition-colors disabled:opacity-40"
          >
            {saving ? "Saving…" : "Log Pick"}
          </button>
        </form>
      </div>
    </div>
  );
}
