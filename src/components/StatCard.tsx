"use client";

interface StatCardProps {
  label: string;
  value: string | number;
  prefix?: string;
  color?: "default" | "success" | "danger" | "warning";
}

export default function StatCard({ label, value, prefix, color = "default" }: StatCardProps) {
  const colorClass =
    color === "success"
      ? "text-success"
      : color === "danger"
        ? "text-danger"
        : color === "warning"
          ? "text-warning"
          : "text-text";

  return (
    <div className="card text-center">
      <div className="text-[10px] uppercase tracking-wider text-muted mb-1">
        {label}
      </div>
      <div className={`stat-value ${colorClass}`}>
        {prefix}
        {value}
      </div>
    </div>
  );
}
