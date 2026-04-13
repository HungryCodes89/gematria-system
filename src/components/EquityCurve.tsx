"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";
import type { LedgerRow } from "@/lib/types";

interface EquityCurveProps {
  data: LedgerRow[];
  startBalance?: number;
}

export default function EquityCurve({ data, startBalance = 10000 }: EquityCurveProps) {
  if (data.length === 0) {
    return (
      <div className="card text-center py-12">
        <p className="text-muted">No ledger data yet</p>
      </div>
    );
  }

  const formatted = data.map((d) => ({
    date: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    balance: Number(d.balance),
    pl: Number(d.daily_pl),
  }));

  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wider text-muted mb-4">Equity Curve</div>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={formatted}>
          <defs>
            <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "#71717a" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#71717a" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`}
          />
          <Tooltip
            contentStyle={{
              background: "#12121a",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "#71717a" }}
            formatter={(val: unknown, name: unknown) => [
              `$${Number(val ?? 0).toLocaleString()}`,
              String(name) === "balance" ? "Balance" : "Daily P&L",
            ]}
          />
          <ReferenceLine
            y={startBalance}
            stroke="#71717a"
            strokeDasharray="4 4"
            strokeWidth={1}
          />
          <Area
            type="monotone"
            dataKey="balance"
            stroke="#a78bfa"
            strokeWidth={2}
            fill="url(#balGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
