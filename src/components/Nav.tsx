"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/live", label: "Live" },
  { href: "/history", label: "History" },
  { href: "/stats", label: "Stats" },
  { href: "/patterns", label: "Patterns" },
  { href: "/performance", label: "Performance" },
  { href: "/settings", label: "Settings" },
  { href: "/cipher-lab", label: "Cipher Lab" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 bg-surface/80 backdrop-blur border-b border-border">
      <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
        <Link href="/" className="text-accent font-bold tracking-[0.3em] uppercase text-sm">
          GEMATRIA
        </Link>
        <div className="flex items-center gap-1">
          {LINKS.map(({ href, label }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                  active
                    ? "bg-accent/20 text-accent"
                    : "text-muted hover:text-text"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
