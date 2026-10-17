"use client";

// Milestone card — Terminal Commons instrument panel for one milestone.
// Tokens only (bg/panel/panel2/line/tx/dim/phos/amber/red), square corners, mono machine-voice.

import type { Milestone, MilestoneStatus } from "@/types/compute-fund";
import { mockDb } from "@/lib/mock-db";
import TokenEfficiencyBar from "@/components/milestones/TokenEfficiencyBar";

type Props = {
  milestone: Milestone;
  /** resolved team name; falls back to mockDb.teams lookup when omitted */
  teamName?: string | null;
  onComplete?: (milestone: Milestone) => void;
  onRunCompute?: (milestone: Milestone) => void;
  onVote?: (milestone: Milestone) => void;
};

const STATUS_LABEL: Record<MilestoneStatus, string> = {
  proposed: "PROPOSED",
  funded: "FUNDED",
  active: "ACTIVE",
  complete: "COMPLETE",
  failed: "FAILED",
};

/** status → tone: active/complete glow phos, funded/proposed hold amber, failed runs red */
const STATUS_TONE: Record<MilestoneStatus, "phos" | "amber" | "red"> = {
  proposed: "amber",
  funded: "amber",
  active: "phos",
  complete: "phos",
  failed: "red",
};

const TONE_TEXT = { phos: "text-phos", amber: "text-amber", red: "text-red" } as const;

export function resolveTeamName(teamId: string | null): string | null {
  if (!teamId) return null;
  return mockDb.teams.find((t) => t.id === teamId)?.name ?? null;
}

export default function MilestoneCard({ milestone, teamName, onComplete, onRunCompute, onVote }: Props) {
  const tone = STATUS_TONE[milestone.status];
  const team = teamName ?? resolveTeamName(milestone.assignedTeamId);
  const isLive = milestone.status === "active";

  return (
    <article className="border border-line bg-panel p-4">
      {/* header: status badge + title + votes slot */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="mono inline-flex items-center text-[11px] uppercase tracking-[0.14em]">
            {/* .live dot pulse for active; static tone dot otherwise */}
            <span
              className="live"
              style={isLive ? undefined : { background: "var(--amber)", boxShadow: "none" }}
            />
            <span className={TONE_TEXT[tone]}>{STATUS_LABEL[milestone.status]}</span>
          </span>
          <h3 className="display mt-1.5 truncate text-base font-medium text-tx">{milestone.title}</h3>
        </div>
        <span className="mono shrink-0 text-[11px] uppercase tracking-[0.14em] text-dim">
          ★ {milestone.votes.toLocaleString("en-US")} VOTES
        </span>
      </div>

      {/* description + success criteria */}
      <p className="mt-2 text-sm text-dim">{milestone.description}</p>
      <p className="mono mt-1.5 text-[11px] uppercase tracking-[0.14em] text-dim">SUCCESS CRITERIA</p>
      <p className="mt-1 text-sm text-tx">{milestone.successCriteria}</p>

      {/* meta row: team, deadline, est vs actual */}
      <div className="mono mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] uppercase tracking-[0.14em] text-dim">
        <span>TEAM · <b className="text-tx">{team ?? "UNASSIGNED"}</b></span>
        <span>DEADLINE · <b className="text-tx">{milestone.deadline ?? "NONE"}</b></span>
        <span>EST · <b className="text-amber">{milestone.estimatedTokens.toLocaleString("en-US")}</b> TOK</span>
        <span>ACT · <b className="text-tx">{milestone.actualTokens == null ? "—" : milestone.actualTokens.toLocaleString("en-US")}</b> TOK</span>
      </div>

      {/* efficiency bars + budget badges */}
      <TokenEfficiencyBar
        className="mt-3"
        estimatedTokens={milestone.estimatedTokens}
        actualTokens={milestone.actualTokens}
        status={milestone.status}
      />

      {/* token ledger receipt stream */}
      <div className="mt-3 border-t border-line pt-2">
        <span className="mono text-[11px] uppercase tracking-[0.14em] text-dim">RECEIPT STREAM</span>
        <div className="mt-1 space-y-0">
          {milestone.tokenLedger.length === 0 ? (
            <div className="stream-line mono text-[11px]">▸ NO RUNS LOGGED YET — AWAITING FIRST SPEND</div>
          ) : (
            milestone.tokenLedger.map((e) => (
              <div
                key={e.id}
                className={`stream-line mono text-[11px] ${e.kind === "team_reward" ? "ok" : "spend"}`}
              >
                {e.kind === "team_reward"
                  ? `✓ ${e.model} · +${e.tokensOut.toLocaleString("en-US")} TOK · ${e.receipt.outputSummary}`
                  : `▸ ${e.provider}/${e.model} · ${e.tokensIn.toLocaleString("en-US")}→${e.tokensOut.toLocaleString("en-US")} TOK · $${e.costUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })} · ${e.receipt.outputSummary}`}
              </div>
            ))
          )}
        </div>
      </div>

      {/* actions — parent wires real handlers */}
      <div className="mt-3 flex flex-wrap gap-2">
        {onRunCompute && milestone.status !== "complete" && milestone.status !== "failed" && (
          <button
            type="button"
            onClick={() => onRunCompute(milestone)}
            className="mono border border-line bg-panel px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-tx hover:border-phos"
          >
            ⟳ RUN COMPUTE
          </button>
        )}
        {onComplete && milestone.status !== "complete" && milestone.status !== "failed" && (
          <button
            type="button"
            onClick={() => onComplete(milestone)}
            className="mono border border-line bg-panel px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-tx hover:border-phos"
          >
            ✓ MARK COMPLETE
          </button>
        )}
        {onVote && (
          <button
            type="button"
            onClick={() => onVote(milestone)}
            className="mono border border-line bg-panel px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-tx hover:border-phos"
          >
            ▲ UPVOTE
          </button>
        )}
      </div>
    </article>
  );
}