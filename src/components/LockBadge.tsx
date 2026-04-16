"use client";

import { Shield, Lock, Minus, Skull } from "lucide-react";
import type { LockType } from "@/lib/types";

interface LockBadgeProps {
  lockType: LockType | string | null;
  size?: "sm" | "md";
}

const CONFIG: Record<string, { label: string; bg: string; text: string; Icon: typeof Shield }> = {
  triple_lock:   { label: "TRIPLE LOCK",   bg: "bg-accent/20",           text: "text-accent",     Icon: Shield },
  double_lock:   { label: "DOUBLE LOCK",   bg: "bg-blue-500/20",         text: "text-blue-400",   Icon: Lock   },
  single_lock:   { label: "SINGLE",        bg: "bg-zinc-700/40",         text: "text-zinc-400",   Icon: Lock   },
  sacrifice_lock:{ label: "SACRIFICE LOCK",bg: "bg-red-500/20",          text: "text-red-400",    Icon: Skull  },
  no_lock:       { label: "NO LOCK",       bg: "bg-zinc-800/40",         text: "text-zinc-500",   Icon: Minus  },
};

export default function LockBadge({ lockType, size = "sm" }: LockBadgeProps) {
  const cfg = CONFIG[lockType || "no_lock"] || CONFIG.no_lock;
  const textSize = size === "sm" ? "text-[10px]" : "text-xs";
  const iconSize = size === "sm" ? 10 : 12;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold ${textSize} ${cfg.bg} ${cfg.text}`}
    >
      <cfg.Icon size={iconSize} />
      {cfg.label}
    </span>
  );
}
