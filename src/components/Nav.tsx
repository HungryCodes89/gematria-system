"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

/* ── Custom sacred-geometry SVG icons (1.5px stroke, no fill) ── */

function EyeHorusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 10 Q10 3 18 10 Q10 17 2 10Z" />
      <circle cx="10" cy="10" r="2.5" />
      <line x1="10" y1="14" x2="10" y2="17.5" />
      <line x1="7.5" y1="16.5" x2="10" y2="17.5" />
      <line x1="12.5" y1="16.5" x2="10" y2="17.5" />
    </svg>
  );
}

function ConcentricIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="10" cy="10" r="2" />
      <circle cx="10" cy="10" r="5" />
      <circle cx="10" cy="10" r="8.5" />
    </svg>
  );
}

function FlowerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.25">
      <circle cx="10" cy="10" r="3.2" />
      <circle cx="10" cy="4.8" r="3.2" />
      <circle cx="10" cy="15.2" r="3.2" />
      <circle cx="4.5" cy="7.4" r="3.2" />
      <circle cx="15.5" cy="7.4" r="3.2" />
      <circle cx="4.5" cy="12.6" r="3.2" />
      <circle cx="15.5" cy="12.6" r="3.2" />
    </svg>
  );
}

function HourglassIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 2h10" />
      <path d="M5 18h10" />
      <path d="M6 2 L14 10 L6 18" />
      <path d="M14 2 L6 10 L14 18" />
    </svg>
  );
}

function TriangleInSquareIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="2.5" width="15" height="15" rx="1" />
      <path d="M10 5.5 L15 14.5 L5 14.5 Z" />
    </svg>
  );
}

function CipherGridIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="2" y="2" width="4.5" height="4.5" rx="0.5" />
      <rect x="7.75" y="2" width="4.5" height="4.5" rx="0.5" />
      <rect x="13.5" y="2" width="4.5" height="4.5" rx="0.5" />
      <rect x="2" y="7.75" width="4.5" height="4.5" rx="0.5" />
      <rect x="7.75" y="7.75" width="4.5" height="4.5" rx="0.5" />
      <rect x="13.5" y="7.75" width="4.5" height="4.5" rx="0.5" />
      <rect x="2" y="13.5" width="4.5" height="4.5" rx="0.5" />
      <rect x="7.75" y="13.5" width="4.5" height="4.5" rx="0.5" />
      <rect x="13.5" y="13.5" width="4.5" height="4.5" rx="0.5" />
    </svg>
  );
}

function SaturnIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="10" cy="10" r="4" />
      <ellipse cx="10" cy="10" rx="9" ry="3" transform="rotate(-20 10 10)" />
    </svg>
  );
}

function SparklineIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2,14 6,8 10,11 14,5 18,9" />
    </svg>
  );
}

const LINKS = [
  { href: "/",            label: "Today",       Icon: EyeHorusIcon    },
  { href: "/live",        label: "Live",        Icon: ConcentricIcon  },
  { href: "/patterns",    label: "Patterns",    Icon: FlowerIcon      },
  { href: "/history",     label: "History",     Icon: HourglassIcon   },
  { href: "/stats",       label: "Stats",       Icon: SparklineIcon   },
  { href: "/performance", label: "Performance", Icon: TriangleInSquareIcon },
  { href: "/cipher-lab",  label: "Cipher Lab",  Icon: CipherGridIcon  },
  { href: "/settings",    label: "Settings",    Icon: SaturnIcon      },
];

function useLiveClock() {
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
  );
  useEffect(() => {
    const id = setInterval(() => {
      setTime(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }));
    }, 30_000);
    return () => clearInterval(id);
  }, []);
  return time;
}

function dayNum(): number {
  const d = new Date();
  return d.getDate() + d.getMonth() + 1 + d.getFullYear();
}

function reduce(n: number): number {
  while (n > 9 && n !== 11 && n !== 22 && n !== 33) {
    n = String(n).split("").reduce((s, c) => s + Number(c), 0);
  }
  return n;
}

export default function Nav() {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  const clock = useLiveClock();
  const dayReduced = reduce(dayNum());

  return (
    <nav
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      style={{ width: expanded ? 240 : 72 }}
      className="fixed left-0 top-0 bottom-0 z-50 flex flex-col overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
      aria-label="Main navigation"
    >
      {/* Glass panel */}
      <div
        className="absolute inset-0"
        style={{
          background: "rgba(11, 15, 23, 0.92)",
          backdropFilter: "blur(16px) saturate(140%)",
          WebkitBackdropFilter: "blur(16px) saturate(140%)",
          borderRight: "1px solid rgba(232, 228, 216, 0.07)",
        }}
      />

      {/* Content */}
      <div className="relative flex flex-col h-full">
        {/* Logo mark */}
        <div className="h-16 flex items-center px-[22px] shrink-0 overflow-hidden">
          <span
            style={{
              fontFamily: "var(--font-display)",
              letterSpacing: "0.12em",
              fontSize: 11,
              fontWeight: 600,
              color: "#D4A574",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            {expanded ? "GEMATRIA" : "G"}
          </span>
        </div>

        {/* Links */}
        <ul className="flex flex-col gap-0.5 px-2 flex-1 overflow-hidden">
          {LINKS.map(({ href, label, Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className="relative flex items-center gap-3.5 h-11 px-3 rounded-lg overflow-hidden transition-colors duration-[180ms]"
                  style={{
                    color: active ? "#D4A574" : "#8A8578",
                    background: active ? "rgba(212, 165, 116, 0.08)" : "transparent",
                  }}
                  onMouseEnter={e => {
                    if (!active) (e.currentTarget as HTMLElement).style.color = "#E8E4D8";
                  }}
                  onMouseLeave={e => {
                    if (!active) (e.currentTarget as HTMLElement).style.color = "#8A8578";
                  }}
                >
                  {/* Active bar */}
                  {active && (
                    <span
                      className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r"
                      style={{ background: "#D4A574" }}
                    />
                  )}
                  {/* Icon */}
                  <span className="shrink-0 w-5 flex items-center justify-center">
                    <Icon />
                  </span>
                  {/* Label */}
                  <span
                    className="text-xs font-medium whitespace-nowrap overflow-hidden transition-opacity duration-200"
                    style={{
                      opacity: expanded ? 1 : 0,
                      fontFamily: "var(--font-ui)",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Bottom status block */}
        <div
          className="shrink-0 mx-2 mb-3 px-3 py-2.5 rounded-lg overflow-hidden"
          style={{
            background: "rgba(30, 37, 50, 0.5)",
            fontFamily: "var(--font-mono)",
          }}
        >
          <div
            className="text-[9px] whitespace-nowrap overflow-hidden transition-opacity duration-200"
            style={{
              color: "#8A8578",
              opacity: expanded ? 1 : 0,
              letterSpacing: "0.06em",
            }}
          >
            {clock}
          </div>
          <div
            className="text-[10px] mt-0.5 whitespace-nowrap overflow-hidden transition-opacity duration-200"
            style={{
              color: "#D4A574",
              opacity: expanded ? 1 : 0,
            }}
          >
            DAY·{dayReduced}
          </div>
          {/* Collapsed: just a dot */}
          {!expanded && (
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: "#D4A574", opacity: 0.6 }}
            />
          )}
        </div>
      </div>
    </nav>
  );
}
