"use client";

import { useState, useEffect, useCallback } from "react";
import Nav from "@/components/Nav";

// ── Types ──────────────────────────────────────────────────────────────────

interface Pattern {
  id: string;
  name: string;
  category: string;
  status: "observed" | "live_tested" | "validated";
  description: string | null;
  live_record: string | null;
  created_at: string;
}

interface LinkedPick {
  id: string;
  pick: string;
  result: string;
  profit_loss: number;
  placed_at: string;
  game?: { away_team: string; home_team: string; game_date: string } | null;
}

// ── Ring definitions (outer → inner) ──────────────────────────────────────

const RINGS = [
  { category: "date_locks",        label: "DATE LOCKS",         radius: 460 },
  { category: "mirror_mechanics",  label: "MIRROR MECHANICS",   radius: 380 },
  { category: "triple_milestones", label: "TRIPLE MILESTONES",  radius: 300 },
  { category: "masonic_jesuit",    label: "MASONIC / JESUIT",   radius: 220 },
  { category: "return_stamps",     label: "RETURN STAMPS",      radius: 140 },
] as const;

const STATUS_COLOR: Record<string, string> = {
  validated:   "#C9A961",
  live_tested: "#D4A574",
  observed:    "#3A8B95",
};

const STATUS_LABEL: Record<string, string> = {
  validated:   "VALIDATED",
  live_tested: "LIVE-TESTED",
  observed:    "OBSERVED",
};

const RESULT_COLOR: Record<string, string> = {
  win:  "#D4A574",
  loss: "#8B2635",
  push: "#8A8578",
  void: "#4A4D54",
};

// ── Helpers ────────────────────────────────────────────────────────────────

function angleFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  }
  return ((h % 360) + 360) % 360;
}

function nodePos(radius: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: radius * Math.sin(rad), y: -radius * Math.cos(rad) };
}

// ── Center mandala (static ornament) ──────────────────────────────────────

function CenterMandala() {
  return (
    <g>
      <defs>
        <filter id="mandala-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g opacity={0.3} filter="url(#mandala-glow)">
        {[60, 40, 20].map((r) => (
          <circle
            key={r} cx={0} cy={0} r={r}
            fill="none" stroke="#D4A574" strokeWidth={0.75}
          />
        ))}
        {Array.from({ length: 12 }, (_, i) => {
          const rad = (i * 30 * Math.PI) / 180;
          return (
            <line
              key={i}
              x1={0} y1={0}
              x2={60 * Math.sin(rad)} y2={-60 * Math.cos(rad)}
              stroke="#D4A574" strokeWidth={0.5}
            />
          );
        })}
        {/* Inner vesica petals */}
        {Array.from({ length: 6 }, (_, i) => {
          const rad = (i * 60 * Math.PI) / 180;
          return (
            <circle
              key={`v${i}`}
              cx={20 * Math.sin(rad)} cy={-20 * Math.cos(rad)} r={20}
              fill="none" stroke="#D4A574" strokeWidth={0.35} strokeOpacity={0.5}
            />
          );
        })}
      </g>
    </g>
  );
}

// ── Glow filters ───────────────────────────────────────────────────────────

function GlowDefs() {
  return (
    <defs>
      <filter id="node-glow-gold" x="-150%" y="-150%" width="400%" height="400%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="node-glow-amber" x="-150%" y="-150%" width="400%" height="400%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="node-glow-cyan" x="-150%" y="-150%" width="400%" height="400%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}

const GLOW_FILTER: Record<string, string> = {
  validated:   "url(#node-glow-gold)",
  live_tested: "url(#node-glow-amber)",
  observed:    "url(#node-glow-cyan)",
};

// ── Main page ──────────────────────────────────────────────────────────────

export default function PatternsPage() {
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredPattern, setHoveredPattern] = useState<Pattern | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const [selectedPattern, setSelectedPattern] = useState<Pattern | null>(null);
  const [linkedPicks, setLinkedPicks] = useState<LinkedPick[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);

  useEffect(() => {
    fetch("/api/patterns-viz")
      .then((r) => r.json())
      .then((d) => setPatterns(d.patterns ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSelectPattern = useCallback(async (p: Pattern) => {
    setSelectedPattern(p);
    setLinkedPicks([]);
    setLoadingLinks(true);
    try {
      const res = await fetch(`/api/patterns-viz?linkedFor=${encodeURIComponent(p.name)}`);
      const d = await res.json();
      setLinkedPicks(d.picks ?? []);
    } finally {
      setLoadingLinks(false);
    }
  }, []);

  const counts = {
    observed:   patterns.filter((p) => p.status === "observed").length,
    live_tested: patterns.filter((p) => p.status === "live_tested").length,
    validated:  patterns.filter((p) => p.status === "validated").length,
  };

  // SVG coordinate space: viewBox centered at (0,0).
  // Outermost ring r=460, labels at r+42=502, ring labels at r+26=486.
  // ViewBox half = 560 gives ~74px margin all around.
  const VB = 560;

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      <Nav />

      {/* ── Header strip ─────────────────────────────────────────────── */}
      <header
        aria-label="Patterns header"
        style={{
          position: "fixed", top: 0, left: 72, right: 0, height: 48, zIndex: 20,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 32px",
          background: "rgba(5,7,11,0.88)",
          backdropFilter: "blur(14px)",
          borderBottom: "1px solid rgba(30,37,50,0.9)",
        }}
      >
        <span style={{
          fontFamily: "var(--font-display)",
          fontSize: 13,
          letterSpacing: "0.15em",
          color: "#D4A574",
          fontWeight: 500,
        }}>
          PATTERNS
        </span>

        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "#8A8578",
          letterSpacing: "0.06em",
        }}>
          {patterns.length}&nbsp;TOTAL
          &nbsp;·&nbsp;
          <span style={{ color: "#3A8B95" }}>{counts.observed}&nbsp;OBSERVED</span>
          &nbsp;·&nbsp;
          <span style={{ color: "#D4A574" }}>{counts.live_tested}&nbsp;LIVE-TESTED</span>
          &nbsp;·&nbsp;
          <span style={{ color: "#C9A961" }}>{counts.validated}&nbsp;VALIDATED</span>
        </span>

        {/* Status legend */}
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          {(["observed", "live_tested", "validated"] as const).map((s) => (
            <span key={s} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{
                display: "inline-block", width: 7, height: 7, borderRadius: "50%",
                background: STATUS_COLOR[s],
              }} />
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 9,
                color: "#4A4D54", letterSpacing: "0.08em",
              }}>
                {STATUS_LABEL[s]}
              </span>
            </span>
          ))}
        </div>
      </header>

      {/* ── Ring composition ─────────────────────────────────────────── */}
      <main
        style={{
          paddingTop: 48,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "auto",
        }}
      >
        {loading ? (
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 10,
            color: "#4A4D54", letterSpacing: "0.1em",
          }}>
            LOADING PATTERNS...
          </span>
        ) : (
          <svg
            viewBox={`${-VB} ${-VB} ${2 * VB} ${2 * VB}`}
            aria-label="Pattern ring system — five concentric rings of pattern nodes"
            style={{
              // Fill available space: viewport width minus sidebar (72px) minus breathing room (48px)
              // Cap at 960px. Enforce 800px minimum before scrolling.
              width:  "min(calc(100vw - 72px - 48px), 960px)",
              height: "min(calc(100vw - 72px - 48px), 960px)",
              minWidth:  800,
              minHeight: 800,
              overflow: "visible",
              display: "block",
            }}
          >
            <GlowDefs />

            {/* ── Atmosphere: radial gradient behind rings ───────────── */}
            <defs>
              <radialGradient id="bg-gradient" cx="50%" cy="50%" r="50%">
                <stop offset="0%"   stopColor="#0B0F17" stopOpacity={0.6} />
                <stop offset="100%" stopColor="#05070B" stopOpacity={0} />
              </radialGradient>
            </defs>
            <circle cx={0} cy={0} r={VB} fill="url(#bg-gradient)" />

            {/* ── Fixed ring category labels (12 o'clock, never rotate) ─ */}
            {RINGS.map((ring) => (
              <text
                key={`lbl-${ring.category}`}
                x={0}
                y={-(ring.radius + 26)}
                textAnchor="middle"
                fill="#8A8578"
                fontSize={11}
                fontFamily="var(--font-mono)"
                letterSpacing={1.5}
                style={{
                  textTransform: "uppercase",
                  userSelect: "none",
                  pointerEvents: "none",
                }}
              >
                {ring.label}
              </text>
            ))}

            {/* ── Rotating group: rings + nodes + connectors ─────────── */}
            {/*    transform-box: view-box so transform-origin: center    */}
            {/*    correctly resolves to the SVG viewport center (0,0).   */}
            <g
              style={{
                animation: "slow-rotate 90s linear infinite",
                transformBox: "view-box" as never,
                transformOrigin: "center",
              }}
            >
              {/* Ring circles */}
              {RINGS.map((ring) => (
                <circle
                  key={`ring-${ring.category}`}
                  cx={0} cy={0} r={ring.radius}
                  fill="none"
                  stroke="#D4A574"
                  strokeWidth={0.6}
                  strokeOpacity={0.18}
                />
              ))}

              {/* Tick marks at every 30° on each ring */}
              {RINGS.map((ring) =>
                Array.from({ length: 12 }, (_, i) => {
                  const rad = (i * 30 * Math.PI) / 180;
                  const inner = ring.radius - 4;
                  const outer = ring.radius + 4;
                  return (
                    <line
                      key={`tick-${ring.category}-${i}`}
                      x1={inner * Math.sin(rad)} y1={-inner * Math.cos(rad)}
                      x2={outer * Math.sin(rad)} y2={-outer * Math.cos(rad)}
                      stroke="#D4A574" strokeWidth={0.4} strokeOpacity={0.12}
                    />
                  );
                })
              )}

              {/* Pattern nodes */}
              {patterns.map((pattern) => {
                const ring = RINGS.find((r) => r.category === pattern.category);
                if (!ring) return null;

                const angleDeg = angleFromId(pattern.id);
                const { x, y } = nodePos(ring.radius, angleDeg);
                const lp = nodePos(ring.radius + 44, angleDeg);
                const color = STATUS_COLOR[pattern.status] ?? "#8A8578";
                const isHovered = hoveredPattern?.id === pattern.id;

                // Connector starts just past the halo (r=14 → 16px from node center)
                const cp = nodePos(ring.radius + 16, angleDeg);

                return (
                  <g key={pattern.id}>
                    {/* Hairline radial connector */}
                    <line
                      x1={cp.x} y1={cp.y}
                      x2={lp.x} y2={lp.y}
                      stroke="#2D3547"
                      strokeWidth={0.75}
                      strokeOpacity={isHovered ? 1.0 : 0.6}
                      style={{ transition: "stroke-opacity 200ms ease-out", pointerEvents: "none" }}
                    />

                    {/* Halo */}
                    <circle
                      cx={x} cy={y}
                      r={isHovered ? 18 : 14}
                      fill={color}
                      fillOpacity={isHovered ? 0.8 : 0.4}
                      style={{ transition: "r 200ms ease-out, fill-opacity 200ms ease-out", pointerEvents: "none" }}
                    />

                    {/* Node — interactive hit target */}
                    <circle
                      cx={x} cy={y}
                      r={isHovered ? 8 : 6}
                      fill={color}
                      filter={GLOW_FILTER[pattern.status]}
                      style={{ cursor: "pointer", transition: "r 200ms ease-out" }}
                      onMouseEnter={(e) => {
                        setHoveredPattern(pattern);
                        setHoverPos({ x: e.clientX, y: e.clientY });
                      }}
                      onMouseLeave={() => setHoveredPattern(null)}
                      onMouseMove={(e) => setHoverPos({ x: e.clientX, y: e.clientY })}
                      onClick={() => handleSelectPattern(pattern)}
                    />

                    {/* Counter-rotating pattern name label.
                        transform-box: fill-box + transform-origin: center
                        makes it rotate around its own bounding box center,
                        cancelling the parent's rotation so text stays horizontal. */}
                    <g
                      style={{
                        animation: "slow-rotate 90s linear infinite reverse",
                        transformBox: "fill-box" as never,
                        transformOrigin: "center",
                        pointerEvents: "none",
                      }}
                    >
                      <text
                        x={lp.x} y={lp.y}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill={isHovered ? "#F4B860" : "#E8E4D8"}
                        fontSize={10}
                        fontFamily="var(--font-mono)"
                        style={{
                          transition: "fill 200ms ease-out",
                          userSelect: "none",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {pattern.name}
                      </text>
                    </g>
                  </g>
                );
              })}
            </g>

            {/* ── Center mandala (never rotates — sits above rings) ───── */}
            <CenterMandala />
          </svg>
        )}
      </main>

      {/* ── Hover tooltip ─────────────────────────────────────────────── */}
      {hoveredPattern && (
        <div
          role="tooltip"
          style={{
            position: "fixed",
            left: Math.min(hoverPos.x + 20, window.innerWidth - 310),
            top:  Math.min(hoverPos.y + 12,  window.innerHeight - 160),
            zIndex: 60,
            background: "rgba(14,18,28,0.96)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(212,165,116,0.35)",
            borderRadius: 8,
            padding: "12px 14px",
            maxWidth: 280,
            pointerEvents: "none",
          }}
        >
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 12,
            color: "#E8E4D8", marginBottom: 6, fontWeight: 500,
          }}>
            {hoveredPattern.name}
          </div>

          <span style={{
            display: "inline-block",
            fontFamily: "var(--font-mono)", fontSize: 9,
            color: STATUS_COLOR[hoveredPattern.status],
            background: STATUS_COLOR[hoveredPattern.status] + "22",
            padding: "2px 7px", borderRadius: 3,
            letterSpacing: "0.1em",
          }}>
            {STATUS_LABEL[hoveredPattern.status]}
          </span>

          {hoveredPattern.description && (
            <div style={{
              fontFamily: "var(--font-ui)", fontSize: 11,
              color: "#8A8578", marginTop: 7, lineHeight: 1.55,
            }}>
              {hoveredPattern.description}
            </div>
          )}

          {hoveredPattern.live_record && (
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 10,
              color: "#D4A574", marginTop: 5,
            }}>
              {hoveredPattern.live_record}
            </div>
          )}
        </div>
      )}

      {/* ── Inspector panel (slide in from right) ─────────────────────── */}
      <aside
        aria-label={selectedPattern ? `Inspector: ${selectedPattern.name}` : "Pattern inspector"}
        aria-hidden={!selectedPattern}
        style={{
          position: "fixed",
          top: 0, right: 0, bottom: 0, width: 320,
          zIndex: 40,
          transform: selectedPattern ? "translateX(0)" : "translateX(100%)",
          transition: "transform 320ms cubic-bezier(0.32,0.72,0,1)",
          background: "rgba(8,11,18,0.97)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderLeft: "1px solid rgba(212,165,116,0.18)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {selectedPattern && (
          <>
            {/* Inspector header */}
            <div style={{ padding: "22px 20px 0", display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontFamily: "var(--font-display)", fontSize: 22,
                  color: "#E8E4D8", lineHeight: 1.2, marginBottom: 10,
                  letterSpacing: "0.03em",
                }}>
                  {selectedPattern.name}
                </div>
                <span style={{
                  display: "inline-block",
                  fontFamily: "var(--font-mono)", fontSize: 9,
                  color: STATUS_COLOR[selectedPattern.status],
                  background: STATUS_COLOR[selectedPattern.status] + "22",
                  padding: "3px 8px", borderRadius: 3,
                  letterSpacing: "0.1em",
                }}>
                  {STATUS_LABEL[selectedPattern.status]}
                </span>
              </div>
              <button
                aria-label="Close inspector"
                onClick={() => setSelectedPattern(null)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "#4A4D54", fontSize: 20, lineHeight: 1,
                  padding: "4px 2px", marginTop: -2,
                  transition: "color 150ms",
                }}
                onMouseEnter={(e) => ((e.target as HTMLElement).style.color = "#8A8578")}
                onMouseLeave={(e) => ((e.target as HTMLElement).style.color = "#4A4D54")}
              >
                ×
              </button>
            </div>

            {/* Description */}
            {selectedPattern.description && (
              <div style={{
                padding: "14px 20px 0",
                fontFamily: "var(--font-ui)", fontSize: 13,
                color: "#8A8578", lineHeight: 1.65,
              }}>
                {selectedPattern.description}
              </div>
            )}

            {/* Live record */}
            {selectedPattern.live_record && (
              <div style={{ padding: "14px 20px 0" }}>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 9,
                  color: "#2D3547", letterSpacing: "0.12em",
                  textTransform: "uppercase", marginBottom: 5,
                }}>
                  Live Record
                </div>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 13,
                  color: "#D4A574", letterSpacing: "0.04em",
                }}>
                  {selectedPattern.live_record}
                </div>
              </div>
            )}

            {/* Divider */}
            <div style={{ margin: "18px 20px 0", borderTop: "1px solid #1A2030" }} />

            {/* Linked picks */}
            <div style={{ padding: "14px 20px 0", flex: 1, overflowY: "auto" }}>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 9,
                color: "#2D3547", letterSpacing: "0.12em",
                textTransform: "uppercase", marginBottom: 10,
              }}>
                Linked Picks
              </div>

              {loadingLinks ? (
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 10,
                  color: "#2D3547", letterSpacing: "0.06em",
                }}>
                  searching...
                </span>
              ) : linkedPicks.length === 0 ? (
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 10,
                  color: "#2D3547", letterSpacing: "0.06em",
                }}>
                  No picks reference this pattern yet.
                </span>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {linkedPicks.map((pick) => (
                    <div
                      key={pick.id}
                      style={{
                        background: "rgba(20,26,38,0.6)",
                        borderRadius: 5,
                        padding: "8px 10px",
                        borderLeft: `2px solid ${RESULT_COLOR[pick.result] ?? "#2D3547"}`,
                      }}
                    >
                      <div style={{
                        display: "flex", justifyContent: "space-between",
                        alignItems: "baseline", marginBottom: 2,
                      }}>
                        <span style={{
                          fontFamily: "var(--font-mono)", fontSize: 10,
                          color: "#E8E4D8",
                        }}>
                          {pick.pick}
                        </span>
                        <span style={{
                          fontFamily: "var(--font-mono)", fontSize: 10,
                          color: RESULT_COLOR[pick.result] ?? "#8A8578",
                          letterSpacing: "0.05em",
                        }}>
                          {pick.result.toUpperCase()}
                        </span>
                      </div>
                      <div style={{
                        display: "flex", justifyContent: "space-between",
                        alignItems: "baseline",
                      }}>
                        <span style={{
                          fontFamily: "var(--font-mono)", fontSize: 9,
                          color: "#3A4050",
                        }}>
                          {pick.game
                            ? `${pick.game.away_team} @ ${pick.game.home_team}`
                            : new Date(pick.placed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                        <span style={{
                          fontFamily: "var(--font-mono)", fontSize: 9,
                          fontVariantNumeric: "tabular-nums",
                          color: pick.profit_loss > 0 ? "#D4A574"
                               : pick.profit_loss < 0 ? "#8B2635"
                               : "#4A4D54",
                        }}>
                          {pick.profit_loss > 0 ? "+" : ""}{pick.profit_loss.toFixed(0)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pad bottom for scroll */}
            <div style={{ height: 24 }} />
          </>
        )}
      </aside>

      {/* Dim overlay behind inspector */}
      {selectedPattern && (
        <div
          aria-hidden
          onClick={() => setSelectedPattern(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 39,
            background: "rgba(0,0,0,0.35)",
            backdropFilter: "blur(2px)",
            animation: "fadeIn 200ms ease-out",
          }}
        />
      )}
    </div>
  );
}
