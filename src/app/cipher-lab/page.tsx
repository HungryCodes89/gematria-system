"use client";

import { useState, useMemo } from "react";
import Nav from "@/components/Nav";
import {
  calculateGematria,
  calculateDateNumerology,
  type GematriaResult,
  type DateNumerology,
} from "@/lib/gematria";

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const CIPHER_LABELS: { key: keyof Pick<GematriaResult, "ordinal" | "reduction" | "reverseOrdinal" | "reverseReduction">; label: string }[] = [
  { key: "ordinal", label: "Ordinal" },
  { key: "reduction", label: "Reduction" },
  { key: "reverseOrdinal", label: "Reverse Ordinal" },
  { key: "reverseReduction", label: "Reverse Reduction" },
];

const DATE_LABELS: { key: keyof Pick<DateNumerology, "full" | "reducedYear" | "singleDigits" | "shortYear" | "monthDay">; label: string }[] = [
  { key: "full", label: "Full Date" },
  { key: "reducedYear", label: "Reduced Year" },
  { key: "singleDigits", label: "Single Digits" },
  { key: "shortYear", label: "Short Year" },
  { key: "monthDay", label: "Month+Day" },
];

export default function CipherLab() {
  const [text, setText] = useState("");
  const [dateStr, setDateStr] = useState(todayStr);

  const gematria = useMemo(
    () => (text.trim() ? calculateGematria(text) : null),
    [text]
  );

  const dateNumerology = useMemo(() => {
    const [y, m, d] = dateStr.split("-").map(Number);
    if (!y || !m || !d) return null;
    return calculateDateNumerology(new Date(y, m - 1, d));
  }, [dateStr]);

  const matchSet = useMemo(() => {
    if (!gematria || !dateNumerology) return new Set<string>();
    const dateValues = new Set(DATE_LABELS.map((d) => dateNumerology[d.key]));
    const s = new Set<string>();
    for (const c of CIPHER_LABELS) {
      if (dateValues.has(gematria[c.key]) && gematria[c.key] > 0) {
        s.add(`cipher:${c.key}`);
      }
    }
    for (const d of DATE_LABELS) {
      const cipherValues = new Set(CIPHER_LABELS.map((c) => gematria[c.key]));
      if (cipherValues.has(dateNumerology[d.key]) && dateNumerology[d.key] > 0) {
        s.add(`date:${d.key}`);
      }
    }
    return s;
  }, [gematria, dateNumerology]);

  const matches = useMemo(() => {
    if (!gematria || !dateNumerology) return [];
    const list: { cipher: string; cipherVal: number; dateMethod: string; dateVal: number }[] = [];
    for (const c of CIPHER_LABELS) {
      for (const d of DATE_LABELS) {
        if (gematria[c.key] === dateNumerology[d.key] && gematria[c.key] > 0) {
          list.push({
            cipher: c.label,
            cipherVal: gematria[c.key],
            dateMethod: d.label,
            dateVal: dateNumerology[d.key],
          });
        }
      }
    }
    return list;
  }, [gematria, dateNumerology]);

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-sm font-medium tracking-widest uppercase text-muted mb-6">
          Cipher Lab
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left panel — Word/Phrase Decoder */}
          <div className="card">
            <h2 className="text-xs uppercase tracking-wider text-muted mb-4">
              Word / Phrase Decoder
            </h2>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter a word or phrase..."
              className="w-full bg-bg border border-border rounded-lg px-4 py-3 text-text placeholder:text-muted/50 focus:outline-none focus:border-accent transition-colors mb-5"
            />
            <div className="grid grid-cols-2 gap-3">
              {CIPHER_LABELS.map(({ key, label }) => {
                const val = gematria ? gematria[key] : 0;
                const highlighted = matchSet.has(`cipher:${key}`);
                return (
                  <div
                    key={key}
                    className={`card bg-bg text-center transition-all ${
                      highlighted ? "ring-2 ring-accent" : ""
                    }`}
                  >
                    <div className="text-[10px] uppercase tracking-wider text-muted mb-1">
                      {label}
                    </div>
                    <div
                      className={`font-[family-name:var(--font-mono)] text-2xl font-bold ${
                        highlighted ? "text-accent" : "text-text"
                      }`}
                    >
                      {val}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right panel — Date Numerology */}
          <div className="card">
            <h2 className="text-xs uppercase tracking-wider text-muted mb-4">
              Date Numerology
            </h2>
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="w-full bg-bg border border-border rounded-lg px-4 py-3 text-text focus:outline-none focus:border-accent transition-colors mb-5 [color-scheme:dark]"
            />
            <div className="grid grid-cols-2 gap-3">
              {DATE_LABELS.map(({ key, label }) => {
                const val = dateNumerology ? dateNumerology[key] : 0;
                const highlighted = matchSet.has(`date:${key}`);
                return (
                  <div
                    key={key}
                    className={`card bg-bg text-center transition-all ${
                      highlighted ? "ring-2 ring-accent" : ""
                    }`}
                  >
                    <div className="text-[10px] uppercase tracking-wider text-muted mb-1">
                      {label}
                    </div>
                    <div
                      className={`font-[family-name:var(--font-mono)] text-2xl font-bold ${
                        highlighted ? "text-accent" : "text-text"
                      }`}
                    >
                      {val}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Match section */}
        {text.trim() && dateNumerology && (
          <div className="card mt-6">
            <h2 className="text-xs uppercase tracking-wider text-muted mb-3">
              Cipher ↔ Date Matches
            </h2>
            {matches.length === 0 ? (
              <p className="text-muted text-sm">No matches found</p>
            ) : (
              <>
                <p className="text-accent text-sm font-medium mb-3">
                  {matches.length} match{matches.length !== 1 ? "es" : ""} found
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {matches.map((m, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 bg-accent/10 border border-accent/20 rounded-lg px-3 py-2"
                    >
                      <span className="font-[family-name:var(--font-mono)] text-accent font-bold text-lg">
                        {m.cipherVal}
                      </span>
                      <span className="text-xs text-muted">
                        {m.cipher} = {m.dateMethod}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
