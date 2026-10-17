"use client";

// Efficiency bars — estimated budget vs actual spend, both data public (no auth gate).
// Estimated bar is line-colored; actual bar is phos (green) under budget, red over budget.

import type { MilestoneStatus } from "@/types/compute-fund";

type Props = {
  estimatedTokens: number;
  actualTokens: number | null;
  status: MilestoneStatus;
  className?: string;
};

export default function TokenEfficiencyBar({ estimatedTokens, actualTokens, status, className = "" }: Props) {
  const max = Math.max(estimatedTokens, actualTokens ?? 0) || 1;
  const estPct = Math.round((estimatedTokens / max) * 100);
  const actPct = actualTokens == null ? null : Math.round((actualTokens / max) * 100);
  const actual = actualTokens ?? 0;
  const savedPct = Math.round(((estimatedTokens - actual) / estimatedTokens) * 100);
  const overPct = Math.round(((actual - estimatedTokens) / estimatedTokens) * 100);
  const under = status === "complete" && actualTokens != null && actual < estimatedTokens;
  const over = actualTokens != null && actual > estimatedTokens;

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center gap-2">
        <div className="vbar w-28">
          <i style={{ background: "var(--line)", width: `${estPct}%` }} />
        </div>
        <span className="mono text-[10px] uppercase tracking-[0.14em] text-dim">EST</span>
        <span className="mono text-[10px] text-amber">{estimatedTokens.toLocaleString("en-US")}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="vbar w-28">
          <i
            style={{ background: over ? "var(--red)" : "var(--phos)", width: `${actPct ?? 0}%` }}
          />
        </div>
        <span className="mono text-[10px] uppercase tracking-[0.14em] text-dim">ACT</span>
        <span className={`mono text-[10px] ${over ? "text-red" : "text-phos"}`}>
          {actualTokens == null ? "—" : actual.toLocaleString("en-US")}
        </span>
      </div>
      {under && (
        <span className="mono inline-block border border-phos px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-phos">
          Team saved {savedPct}% — leftover tokens rewarded
        </span>
      )}
      {over && (
        <span className="mono inline-block border border-red px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-red">
          Project exceeded estimate by {overPct}%
        </span>
      )}
    </div>
  );
}