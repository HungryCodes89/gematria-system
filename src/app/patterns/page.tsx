"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, TrendingUp, CheckCircle, XCircle } from "lucide-react";
import Nav from "@/components/Nav";

const PATTERN_TYPES = [
  "Return Stamp",
  "Sacrifice Marker",
  "Triple Milestone",
  "Birthday Measurement",
  "Jesuit Number",
  "Mirror Mechanic",
  "H2H Gap",
  "Other",
] as const;

type PatternType = (typeof PATTERN_TYPES)[number];

interface ValidatedPattern {
  id: string;
  pattern_type: PatternType;
  cipher_values: number[];
  date_numerology: number[];
  sport: string | null;
  teams_involved: string | null;
  outcome: "hit" | "miss";
  notes: string | null;
  confidence_score: number | null;
  created_at: string;
}

interface WinRate {
  hits: number;
  total: number;
  winRate: number;
}

const SPORT_OPTIONS = ["NBA", "NHL", "MLB", "Any"];

const OUTCOME_COLORS: Record<string, string> = {
  hit: "bg-success/20 text-success",
  miss: "bg-danger/20 text-danger",
};

function WinRateBar({ rate }: { rate: number }) {
  const color = rate >= 60 ? "bg-success" : rate >= 40 ? "bg-warning" : "bg-danger";
  return (
    <div className="w-full bg-border rounded-full h-1.5 mt-1">
      <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${rate}%` }} />
    </div>
  );
}

export default function PatternsPage() {
  const [patterns, setPatterns] = useState<ValidatedPattern[]>([]);
  const [winRates, setWinRates] = useState<Record<string, WinRate>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Form state
  const [patternType, setPatternType] = useState<PatternType>("Return Stamp");
  const [sport, setSport] = useState("NBA");
  const [teamsInvolved, setTeamsInvolved] = useState("");
  const [outcome, setOutcome] = useState<"hit" | "miss">("hit");
  const [confidenceScore, setConfidenceScore] = useState("70");
  const [cipherValuesRaw, setCipherValuesRaw] = useState("");
  const [dateNumerologyRaw, setDateNumerologyRaw] = useState("");
  const [notes, setNotes] = useState("");

  const loadPatterns = useCallback(async () => {
    try {
      const res = await fetch("/api/patterns");
      if (res.ok) {
        const data = await res.json();
        setPatterns(data.patterns ?? []);
        setWinRates(data.winRates ?? {});
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPatterns();
  }, [loadPatterns]);

  function parseNumbers(raw: string): number[] {
    return raw
      .split(/[,\s]+/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pattern_type: patternType,
          cipher_values: parseNumbers(cipherValuesRaw),
          date_numerology: parseNumbers(dateNumerologyRaw),
          sport: sport === "Any" ? null : sport,
          teams_involved: teamsInvolved || null,
          outcome,
          notes: notes || null,
          confidence_score: confidenceScore ? parseInt(confidenceScore, 10) : null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Failed to save");
        return;
      }
      // Reset form
      setTeamsInvolved("");
      setCipherValuesRaw("");
      setDateNumerologyRaw("");
      setNotes("");
      setConfidenceScore("70");
      setShowForm(false);
      loadPatterns();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  const totalPatterns = patterns.length;
  const totalHits = patterns.filter((p) => p.outcome === "hit").length;
  const overallWinRate = totalPatterns > 0 ? Math.round((totalHits / totalPatterns) * 100) : 0;

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-sm font-medium tracking-widest uppercase text-muted mb-0.5">
              Pattern Library
            </h1>
            <p className="text-xs text-muted">
              {totalPatterns} patterns — {overallWinRate}% overall hit rate
            </p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="card flex items-center gap-2 px-3 py-1.5 border-accent/30 hover:bg-accent/10 transition-colors text-xs font-medium cursor-pointer"
          >
            <Plus size={14} />
            Log Pattern
          </button>
        </div>

        {/* Log Pattern Form */}
        {showForm && (
          <div className="card mb-6 border-accent/20">
            <h2 className="text-xs font-semibold uppercase tracking-wider mb-4">
              Log Validated Pattern
            </h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {/* Pattern Type */}
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-muted mb-1">
                    Pattern Type *
                  </label>
                  <select
                    value={patternType}
                    onChange={(e) => setPatternType(e.target.value as PatternType)}
                    className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text"
                  >
                    {PATTERN_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                {/* Sport */}
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-muted mb-1">
                    Sport
                  </label>
                  <select
                    value={sport}
                    onChange={(e) => setSport(e.target.value)}
                    className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text"
                  >
                    {SPORT_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                {/* Outcome */}
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-muted mb-1">
                    Outcome *
                  </label>
                  <select
                    value={outcome}
                    onChange={(e) => setOutcome(e.target.value as "hit" | "miss")}
                    className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text"
                  >
                    <option value="hit">Hit</option>
                    <option value="miss">Miss</option>
                  </select>
                </div>
              </div>

              {/* Teams */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-muted mb-1">
                  Teams Involved
                </label>
                <input
                  type="text"
                  value={teamsInvolved}
                  onChange={(e) => setTeamsInvolved(e.target.value)}
                  placeholder="e.g. Lakers vs Celtics"
                  className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text placeholder:text-muted"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Cipher Values */}
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-muted mb-1">
                    Cipher Values (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={cipherValuesRaw}
                    onChange={(e) => setCipherValuesRaw(e.target.value)}
                    placeholder="33, 42, 56"
                    className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text placeholder:text-muted"
                  />
                </div>

                {/* Date Numerology */}
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-muted mb-1">
                    Date Numerology (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={dateNumerologyRaw}
                    onChange={(e) => setDateNumerologyRaw(e.target.value)}
                    placeholder="57, 31, 23"
                    className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text placeholder:text-muted"
                  />
                </div>
              </div>

              {/* Confidence + Notes */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-muted mb-1">
                    Confidence Score
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={confidenceScore}
                    onChange={(e) => setConfidenceScore(e.target.value)}
                    className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] uppercase tracking-wider text-muted mb-1">
                    Notes
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="What triggered this pattern..."
                    className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text placeholder:text-muted resize-none"
                  />
                </div>
              </div>

              {error && <p className="text-xs text-danger">{error}</p>}

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-1.5 text-xs text-muted hover:text-text transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 bg-accent/20 border border-accent/30 hover:bg-accent/30 rounded text-xs font-medium transition-colors disabled:opacity-40"
                >
                  {saving ? "Saving…" : "Save Pattern"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Win Rate Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {PATTERN_TYPES.map((type) => {
            const wr = winRates[type] ?? { hits: 0, total: 0, winRate: 0 };
            return (
              <div key={type} className="card">
                <div className="text-[10px] uppercase tracking-wider text-muted mb-1 truncate">
                  {type}
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="font-[family-name:var(--font-mono)] text-lg font-bold text-accent">
                    {wr.winRate}%
                  </span>
                  <span className="text-[10px] text-muted">
                    {wr.hits}/{wr.total}
                  </span>
                </div>
                <WinRateBar rate={wr.winRate} />
              </div>
            );
          })}
        </div>

        {/* Pattern Table */}
        {loading ? (
          <div className="card text-center py-12 text-muted text-sm">Loading patterns…</div>
        ) : patterns.length === 0 ? (
          <div className="card text-center py-16">
            <TrendingUp size={24} className="text-muted mx-auto mb-2" />
            <p className="text-muted text-sm mb-1">No patterns logged yet</p>
            <p className="text-muted text-xs">Click Log Pattern to start building your library</p>
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted uppercase tracking-wider">
                  <th className="text-left py-2 pr-3 font-medium">Type</th>
                  <th className="text-left py-2 pr-3 font-medium">Sport</th>
                  <th className="text-left py-2 pr-3 font-medium">Teams</th>
                  <th className="text-left py-2 pr-3 font-medium">Outcome</th>
                  <th className="text-left py-2 pr-3 font-medium">Cipher Values</th>
                  <th className="text-left py-2 pr-3 font-medium">Date Nums</th>
                  <th className="text-left py-2 pr-3 font-medium">Conf</th>
                  <th className="text-left py-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {patterns.map((p) => (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-white/2 transition-colors">
                    <td className="py-2 pr-3 font-medium text-text">{p.pattern_type}</td>
                    <td className="py-2 pr-3 text-muted">{p.sport ?? "—"}</td>
                    <td className="py-2 pr-3 text-muted max-w-[120px] truncate">
                      {p.teams_involved ?? "—"}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${OUTCOME_COLORS[p.outcome]}`}>
                        {p.outcome === "hit" ? (
                          <span className="flex items-center gap-0.5">
                            <CheckCircle size={9} /> HIT
                          </span>
                        ) : (
                          <span className="flex items-center gap-0.5">
                            <XCircle size={9} /> MISS
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-2 pr-3 font-[family-name:var(--font-mono)] text-muted">
                      {p.cipher_values?.length > 0 ? p.cipher_values.join(", ") : "—"}
                    </td>
                    <td className="py-2 pr-3 font-[family-name:var(--font-mono)] text-muted">
                      {p.date_numerology?.length > 0 ? p.date_numerology.join(", ") : "—"}
                    </td>
                    <td className="py-2 pr-3 text-muted">
                      {p.confidence_score != null ? `${p.confidence_score}%` : "—"}
                    </td>
                    <td className="py-2 text-muted">
                      {new Date(p.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
