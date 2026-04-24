"use client";

import { Shield, Lock, Minus, Skull } from "lucide-react";
import type { LockType } from "@/lib/types";

interface LockBadgeProps {
  lockType: LockType | string | null;
  size?: "sm" | "md";
}

const CONFIG: Record<string, { label: string; bg: string; text: string; Icon: typeof Shield }> = {
  triple_lock:    { label: "TRIPLE LOCK",    bg: "bg-amber/20",      text: "text-amber",     Icon: Shield },
  double_lock:    { label: "DOUBLE LOCK",    bg: "bg-amber/10",      text: "text-amber",     Icon: Lock   },
  single_lock:    { label: "SINGLE",         bg: "bg-fog/60",        text: "text-ash",       Icon: Lock   },
  sacrifice_lock: { label: "SACRIFICE",      bg: "bg-blood/20",      text: "text-blood",     Icon: Skull  },
  no_lock:        { label: "NO LOCK",        bg: "bg-fog/40",        text: "text-smoke",     Icon: Minus  },
};

export default function LockBadge({ lockType, size = "sm" }: LockBadgeProps) {
  const cfg = CONFIG[lockType || "no_lock"] ?? CONFIG.no_lock;
  const textSize = size === "sm" ? "text-[10px]" : "text-xs";
  const iconSize = size === "sm" ? 10 : 12;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold tracking-wide ${textSize} ${cfg.bg} ${cfg.text}`}
    >
      <cfg.Icon size={iconSize} />
      {cfg.label}
    </span>
  );
}
