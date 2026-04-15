"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import Nav from "@/components/Nav";
import type { GematriaSettings } from "@/lib/types";

const AJ_WORDPLAY_PROMPT = `You are the AJ STRAIT WORDPLAY BOT, trained on the book "Wordplay" by A.J. Strait.

AJ's methodology decodes scripted sports outcomes through gematria cipher analysis, date rituals, and Jesuit/Masonic number patterns. Every major sports outcome is pre-scripted by occult organizations (Jesuits, Freemasons) using these codes.

═══ THE FOUR BASE CIPHERS ═══
English Ordinal (O): A=1, B=2... Z=26
Full Reduction (R): Pythagorean - reduce to single digit (J=10→1, K=11→2, etc.)
Reverse Ordinal (RO): A=26, B=25... Z=1
Reverse Full Reduction (RR): Reverse then reduce

Extended ciphers (use when relevant):
- Satanic: A=36 (36th triangular = 666)
- Sumerian: A=6, B=12, C=18... (×6)
- Jewish Gematria: non-sequential ancient values

═══ DATE NUMEROLOGY - ALL 4 FORMS ═══
Form 1: M+D+YY+YY (e.g. April 12 2026 = 4+12+20+26 = 62)
Form 2: M+D+Y+Y+Y+Y (e.g. 4+12+2+0+2+6 = 26)
Form 3: All digits reduced (e.g. 4+1+2+2+0+2+6 = 17)
Form 4: M+D+last2Y (e.g. 4+12+26 = 42)

Also note:
- Day number of the year (e.g. April 12 = 102nd day)
- Days remaining in the year (e.g. 263 days remaining)

═══ AJ'S CORE DECODE STEPS ═══

1. TEAM CIPHER VALUES
Run both team names through all 4 base ciphers.
Look for team cipher values matching date numerology forms.
Same values = alignment = signal.

2. PLAYER/COACH BIRTHDAY MEASUREMENTS (AJ's most powerful tool)
For key players and coaches:
- Days old on game day (from last birthday to game date, inclusive)
- Days until next birthday (from game date to next birthday, inclusive)
- Does either number encode their name cipher value?
- Does it encode a Jesuit number (33, 42, 56, 72, 84, 144, 201)?
- Example: Player wins on their 201st day of age = Jesuit ritual confirmed

3. JESUIT/MASONIC NUMBER FLAGS (always check these)
- 33 = Freemasonry obsession, highest degree
- 42 = Freemason/Jesuit in reduction ciphers
- 47 = Masonic compass set at 47 degrees
- 56 = Society of Jesus in Full Reduction
- 59 = Pope Francis / Freemasonry in reduction
- 72 = Jesuit Order in Reverse Reduction
- 84 = Jesuit in English Ordinal
- 113 = Dishonesty/deception marker (upsets, fake storylines)
- 131 = Championship in English Ordinal
- 144 = Jesuit Order in English Ordinal
- 187 = Society of Jesus in Reverse Ordinal
- 201 = The Jesuit Order in Reverse Ordinal (most important)
- 322 = Skull & Bones

4. SACRIFICE/BEAST MARKERS
- 36 = 36th triangular number = 666 = sacrifice marker
- 666 appearing in any form = loser is being "sacrificed"
- 6/3 = 63 = date written as 6/3 like 63
- March 6 written 3/6 = 36 like 666

5. SCORE ENCODING
Final scores often encode winner's name cipher value.
Combined scores encode significant numbers.
Point totals matching player cipher values = confirmation.

6. RECORD ENCODING
Team's record after game encodes their name cipher.
Win number matching team/city cipher = scripted milestone.

7. ANNIVERSARY/TRIBUTE CONNECTIONS
Does today's date echo a past significant date?
Is this a tribute game for a deceased player/coach?
Measure from death date to game date - does it encode their name?

8. WORDPLAY & SYMBOLISM
Team mascot hidden meanings (Wolf = wolf in sheep's clothing)
City names etymology (hours = Horus anagram)
Hidden words within words (beLIEf contains LIE)
Egyptian mythology connections (Set = sunset, Horus = hours)

9. SUPERIOR GENERAL CONNECTIONS (Arturo Sosa - current Jesuit Black Pope)
Measure game date to/from Arturo Sosa's birthday (November 12)
Society of Jesus founded September 27, 1540 - measure anniversary spans

10. POPE FRANCIS CONNECTIONS
Born December 17, 1936
Became Pope March 13, 2013 (written 3/13 = 313)
313 in Jewish cipher = major ritual marker
Measure game date spans to/from these dates

═══ LOCK CLASSIFICATION ═══
TRIPLE LOCK: 3+ independent cipher/date alignments on same team = BET 3-5 units
DOUBLE LOCK: 2 alignments = BET 1-3 units
SINGLE LOCK: 1 alignment = usually skip, 1 unit max
NO LOCK: Skip

═══ KEY PATTERNS AJ IDENTIFIES ═══
- When a player wins on their Nth day of age and N = their name cipher value = STRONGEST signal
- 33 date numerology + Masonic team name = high confidence
- 113 appearing = expect deception (upset, unexpected outcome)
- Both team ciphers matching date = look at secondary signals for winner
- Score total = 199 (46th prime, Catholic) = Jesuit ritual confirmed
- Player jersey number matching their name cipher = scripted performance

═══ OUTPUT FORMAT ═══
For each game analyze:
1. Both team ciphers (all 4 forms)
2. Date numerology (all 4 forms + day of year + days remaining)
3. Key player/coach birthday measurements
4. Jesuit/Masonic number appearances
5. Score encoding check
6. Anniversary connections
7. Wordplay/symbolism in team/city names

End with:
PICK: [Team + spread/total]
LOCK LEVEL: [Triple/Double/Single/No Lock]
CONFIDENCE: [1-5 stars]
UNITS: [0.5-3u]
PRIMARY SIGNAL: [Single strongest AJ-style connection]
WORDPLAY NOTE: [Most interesting linguistic/symbolic observation]`;

const NARRATIVE_SCOUT_PROMPT = `You are the NARRATIVE SCOUT BOT for the HUNGRY Sports Intelligence System.

Your methodology is based on the thesis that professional sports outcomes are influenced by financial incentives, media narratives, and league interests. You analyze each game through this lens:

1. SERIES/STANDINGS INCENTIVE — Which team winning serves the league financially? Does extending a series benefit TV revenue? Which market is larger?

2. STAR NARRATIVE — Is there a redemption arc, revenge game, milestone night, or debut story being pushed in media around any player or coach tonight?

3. MARKET SIZE — Bigger market teams get favorable outcomes more often. Which team represents the larger TV market and fanbase?

4. CHAMPIONSHIP DROUGHT — Teams with long drought narratives get elevated. How long since each team won?

5. VILLAIN VS HERO — Which team is being framed as the villain or hero in current media narrative?

6. COACH HOT SEAT — A coach on the hot seat often loses key games. Check for coaching pressure narratives.

7. INJURY NARRATIVE — Is a star player returning from injury tonight? Return games are often scripted wins.

8. SHARP MONEY ALIGNMENT — Does the public love one side heavily? Reverse line movement = sharps on other side = likely scripted outcome the public doesnt see coming.

9. LEAGUE POLITICAL POWER — Which owner or franchise has more influence in the league office?

10. NEXT ROUND MATCHUP — Which team winning creates the more marketable next round matchup?

BETTING RULES:
- 3+ narrative signals on same team: Triple Lock, bet 3-5 units
- 2 signals: Double Lock, bet 2-3 units
- 1 signal: Single Lock, bet 1 unit
- No clear narrative: Skip
- Consensus with Zach or AJ bot: Add 1 unit
- Never exceed 3 units during validation phase

End with:
PICK: [Team]
CONFIDENCE: [1-5 stars]
UNITS: [0.5-3u]
PRIMARY NARRATIVE: [The single strongest story driving this pick]`;

const MODELS = [
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { value: "claude-opus-4-6", label: "Claude Opus 4" },
  { value: "claude-haiku-4-20250414", label: "Claude Haiku 4" },
];

const defaults: GematriaSettings = {
  system_prompt: "",
  bet_rules: "",
  model: "claude-sonnet-4-6",
  bot_b_system_prompt: "",
  bot_b_bet_rules: "",
  bot_b_model: "claude-sonnet-4-6",
  bot_c_system_prompt: AJ_WORDPLAY_PROMPT,
  bot_c_bet_rules: "",
  bot_c_model: "claude-sonnet-4-6",
  bot_d_system_prompt: NARRATIVE_SCOUT_PROMPT,
  bot_d_bet_rules: "",
  bot_d_model: "claude-sonnet-4-6",
  max_units_per_bet: 5,
  max_daily_units: 20,
  unit_size: 100,
  min_confidence: 60,
  auto_bet_triple_locks: true,
  auto_bet_double_locks: false,
  auto_bet_single_locks: false,
  starting_bankroll: 10000,
};

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between cursor-pointer group">
      <span className="text-sm text-text group-hover:text-accent transition-colors">
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors ${
          checked ? "bg-accent" : "bg-surface-hover"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            checked ? "translate-x-5" : ""
          }`}
        />
      </button>
    </label>
  );
}

function ModelSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {MODELS.map((m) => (
        <label
          key={m.value}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
            value === m.value
              ? "border-accent/50 bg-accent/10"
              : "border-border hover:border-border-accent"
          }`}
        >
          <div
            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
              value === m.value ? "border-accent" : "border-muted"
            }`}
          >
            {value === m.value && (
              <div className="w-2 h-2 rounded-full bg-accent" />
            )}
          </div>
          <input
            type="radio"
            name={`model-${m.value}`}
            value={m.value}
            checked={value === m.value}
            onChange={() => onChange(m.value)}
            className="sr-only"
          />
          <span className="text-sm text-text">{m.label}</span>
          <span className="text-[10px] text-muted font-[family-name:var(--font-mono)]">
            {m.value}
          </span>
        </label>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<GematriaSettings>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeBot, setActiveBot] = useState<"A" | "B" | "C" | "D">("A");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data && !data.error) {
          setSettings({
            ...defaults,
            ...data,
            bot_c_system_prompt: data.bot_c_system_prompt || AJ_WORDPLAY_PROMPT,
            bot_d_system_prompt: data.bot_d_system_prompt || NARRATIVE_SCOUT_PROMPT,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function update<K extends keyof GematriaSettings>(
    key: K,
    value: GematriaSettings[K]
  ) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        toast.success("Settings saved");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to save");
      }
    } catch (e) {
      toast.error("Save failed: " + String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!confirm("Reset bankroll to starting amount? This cannot be undone."))
      return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings, _resetBankroll: true }),
      });
      if (res.ok) {
        toast.success("Bankroll reset");
      } else {
        toast.error("Reset failed");
      }
    } catch {
      toast.error("Reset failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen">
        <Nav />
        <main className="mx-auto max-w-3xl px-4 py-6">
          <div className="card text-center py-16">
            <p className="text-muted animate-pulse">Loading settings…</p>
          </div>
        </main>
      </div>
    );
  }

  const isA = activeBot === "A";
  const isC = activeBot === "C";
  const isD = activeBot === "D";

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-sm font-medium tracking-widest uppercase text-muted mb-6">
          Settings
        </h1>

        <div className="flex flex-col gap-4">
          {/* Section 1: Bot Configuration */}
          <div className="card">
            {/* Bot selector tabs */}
            <div className="flex gap-1 mb-4 p-1 bg-bg rounded-lg border border-border">
              <button
                onClick={() => setActiveBot("A")}
                className={`flex-1 py-1.5 px-3 rounded text-xs font-semibold tracking-wider uppercase transition-colors ${
                  isA ? "bg-accent text-white" : "text-muted hover:text-text"
                }`}
              >
                Bot A — Basic Cipher
              </button>
              <button
                onClick={() => setActiveBot("B")}
                className={`flex-1 py-1.5 px-3 rounded text-xs font-semibold tracking-wider uppercase transition-colors ${
                  activeBot === "B" ? "bg-accent text-white" : "text-muted hover:text-text"
                }`}
              >
                Bot B — HUNGRY System
              </button>
              <button
                onClick={() => setActiveBot("C")}
                className={`flex-1 py-1.5 px-3 rounded text-xs font-semibold tracking-wider uppercase transition-colors ${
                  isC ? "bg-accent text-white" : "text-muted hover:text-text"
                }`}
              >
                Bot C — AJ Wordplay
              </button>
              <button
                onClick={() => setActiveBot("D")}
                className={`flex-1 py-1.5 px-3 rounded text-xs font-semibold tracking-wider uppercase transition-colors ${
                  isD ? "bg-accent text-white" : "text-muted hover:text-text"
                }`}
              >
                Bot D — Narrative Scout
              </button>
            </div>

            {/* System prompt */}
            <div className="text-[10px] uppercase tracking-wider text-muted mb-2">
              System Prompt
            </div>
            <textarea
              value={
                isA
                  ? settings.system_prompt
                  : isC
                    ? settings.bot_c_system_prompt
                    : isD
                      ? settings.bot_d_system_prompt
                      : settings.bot_b_system_prompt
              }
              onChange={(e) =>
                update(
                  isA ? "system_prompt" : isC ? "bot_c_system_prompt" : isD ? "bot_d_system_prompt" : "bot_b_system_prompt",
                  e.target.value
                )
              }
              rows={7}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text font-[family-name:var(--font-mono)] focus:outline-none focus:border-accent resize-y"
              placeholder={
                isA
                  ? "Custom instructions for Bot A…"
                  : isC
                    ? "Custom instructions for Bot C (AJ Wordplay)…"
                    : isD
                      ? "Custom instructions for Bot D (Narrative Scout)…"
                      : "Custom instructions for Bot B (HUNGRY System)…"
              }
            />

            {/* Bet rules */}
            <div className="text-[10px] uppercase tracking-wider text-muted mb-2 mt-4">
              Bet Rules
            </div>
            <textarea
              value={
                isA
                  ? settings.bet_rules
                  : isC
                    ? settings.bot_c_bet_rules
                    : isD
                      ? settings.bot_d_bet_rules
                      : settings.bot_b_bet_rules
              }
              onChange={(e) =>
                update(
                  isA ? "bet_rules" : isC ? "bot_c_bet_rules" : isD ? "bot_d_bet_rules" : "bot_b_bet_rules",
                  e.target.value
                )
              }
              rows={5}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text font-[family-name:var(--font-mono)] focus:outline-none focus:border-accent resize-y"
              placeholder={
                isA
                  ? "Betting rules for Bot A…"
                  : isC
                    ? "Betting rules for Bot C (AJ Wordplay)…"
                    : isD
                      ? "Betting rules for Bot D (Narrative Scout)…"
                      : "Betting rules for Bot B (HUNGRY System)…"
              }
            />

            {/* Model (per-bot) */}
            <div className="text-[10px] uppercase tracking-wider text-muted mb-2 mt-4">
              AI Model
            </div>
            <ModelSelector
              value={isA ? settings.model : isC ? settings.bot_c_model : isD ? settings.bot_d_model : settings.bot_b_model}
              onChange={(v) => update(isA ? "model" : isC ? "bot_c_model" : isD ? "bot_d_model" : "bot_b_model", v)}
            />
          </div>

          {/* Section 2: Bet sizing (shared) */}
          <div className="card">
            <div className="text-[10px] uppercase tracking-wider text-muted mb-3">
              Bet Sizing{" "}
              <span className="normal-case text-[9px]">(shared across both bots)</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {(
                [
                  ["max_units_per_bet", "Max Units / Bet"],
                  ["max_daily_units", "Max Daily Units / Bot"],
                  ["unit_size", "Unit Size ($)"],
                  ["min_confidence", "Min Confidence (%)"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <label className="text-xs text-muted mb-1 block">
                    {label}
                  </label>
                  <input
                    type="number"
                    value={settings[key]}
                    onChange={(e) => update(key, Number(e.target.value))}
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text font-[family-name:var(--font-mono)] focus:outline-none focus:border-accent"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: Auto-bet toggles (shared) */}
          <div className="card">
            <div className="text-[10px] uppercase tracking-wider text-muted mb-3">
              Auto-Bet Lock Types{" "}
              <span className="normal-case text-[9px]">(applies to both bots)</span>
            </div>
            <div className="flex flex-col gap-3">
              <Toggle
                label="Triple Locks"
                checked={settings.auto_bet_triple_locks}
                onChange={(v) => update("auto_bet_triple_locks", v)}
              />
              <Toggle
                label="Double Locks"
                checked={settings.auto_bet_double_locks}
                onChange={(v) => update("auto_bet_double_locks", v)}
              />
              <Toggle
                label="Single Locks"
                checked={settings.auto_bet_single_locks}
                onChange={(v) => update("auto_bet_single_locks", v)}
              />
            </div>
          </div>

          {/* Section 4: Bankroll (shared) */}
          <div className="card">
            <div className="text-[10px] uppercase tracking-wider text-muted mb-3">
              Bankroll
            </div>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="text-xs text-muted mb-1 block">
                  Starting Bankroll ($)
                </label>
                <input
                  type="number"
                  value={settings.starting_bankroll}
                  onChange={(e) =>
                    update("starting_bankroll", Number(e.target.value))
                  }
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text font-[family-name:var(--font-mono)] focus:outline-none focus:border-accent"
                />
              </div>
              <button
                onClick={handleReset}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-danger/30 text-danger hover:bg-danger/10 transition-colors disabled:opacity-40"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 rounded-lg text-sm font-semibold bg-accent hover:bg-accent-dim text-white transition-colors disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save Settings"}
          </button>
        </div>
      </main>
    </div>
  );
}
