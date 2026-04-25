import type { Metadata } from "next";
import {
  Cinzel,
  Cormorant_Garamond,
  Inter_Tight,
  JetBrains_Mono,
} from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const cinzel = Cinzel({
  subsets: ["latin"],
  variable: "--font-cinzel",
  weight: ["400", "500", "600", "700"],
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-cormorant",
  style: ["normal", "italic"],
  weight: ["300", "400", "500", "600"],
});

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  weight: ["300", "400", "500", "600"],
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "GEMATRIA — Cipher Betting System",
  description: "Gematria numerology betting calculator for NBA, NHL, and MLB",
};

/* ── Flower of Life — 19 circles (2-ring), mathematically precise ──
   R = circle radius = distance between adjacent centers.
   Ring 0: origin. Ring 1: 6 at distance R. Ring 2: 12 at distance 2R or R√3.
   ViewBox: −2.5R to +2.5R in both axes ≈ −300 to 300 with R=120. */
function FlowerOfLife() {
  const R = 120;
  const s3 = 103.92; // R * √3 / 2, precomputed for R=120

  const circles: [number, number][] = [
    // Ring 0
    [0, 0],
    // Ring 1
    [R, 0], [R / 2, s3], [-R / 2, s3],
    [-R, 0], [-R / 2, -s3], [R / 2, -s3],
    // Ring 2
    [2 * R, 0], [3 * R / 2, s3], [R, 2 * s3],
    [0, 2 * s3], [-R, 2 * s3], [-3 * R / 2, s3],
    [-2 * R, 0], [-3 * R / 2, -s3], [-R, -2 * s3],
    [0, -2 * s3], [R, -2 * s3], [3 * R / 2, -s3],
  ];

  const vb = 2.6 * R; // viewBox half-size

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <svg
        viewBox={`${-vb} ${-vb} ${2 * vb} ${2 * vb}`}
        style={{
          width: "min(92vw, 820px)",
          height: "min(92vw, 820px)",
          opacity: 0.065,
        }}
        aria-hidden="true"
      >
        {/* All 19 Flower of Life circles */}
        {circles.map(([cx, cy], i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={R}
            fill="none"
            stroke="#D4A574"
            strokeWidth={i === 0 ? 0.9 : 0.65}
          />
        ))}
        {/* Outer enclosing circle */}
        <circle
          cx={0} cy={0} r={2.15 * R}
          fill="none"
          stroke="#D4A574"
          strokeWidth="0.5"
          strokeOpacity="0.55"
        />
        {/* Inner vesica grid — connecting center to ring-1 centers */}
        {circles.slice(1, 7).map(([cx, cy], i) => (
          <line
            key={`l${i}`}
            x1={0} y1={0} x2={cx} y2={cy}
            stroke="#D4A574"
            strokeWidth="0.35"
            strokeOpacity="0.4"
          />
        ))}
      </svg>
    </div>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${cinzel.variable} ${cormorant.variable} ${interTight.variable} ${jetbrains.variable}`}
    >
      <body className="min-h-screen antialiased">
        {/* Sacred geometry — persists across all pages */}
        <FlowerOfLife />
        {/* Page content sits above geometry */}
        <div style={{ position: "relative", zIndex: 1 }}>
          {children}
        </div>
        <Toaster
          position="top-right"
          theme="dark"
          toastOptions={{
            style: {
              background: "#0B0F17",
              border: "1px solid #1E2532",
              color: "#E8E4D8",
              fontFamily: "var(--font-jetbrains), monospace",
              fontSize: "12px",
            },
          }}
        />
      </body>
    </html>
  );
}
