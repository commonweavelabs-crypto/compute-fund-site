"use client";

// Milestone list — the parent passes milestone data and wires real handlers; this
// component only sorts by the contract's sortMilestones and renders cards.

import type { Milestone } from "@/types/compute-fund";
import { sortMilestones } from "@/types/compute-fund";
import MilestoneCard from "@/components/milestones/MilestoneCard";

type Props = {
  projectId: string;
  milestones: Milestone[];
  /** resolved team names by id; cards fall back to mockDb.teams when omitted */
  teamNames?: Record<string, string>;
  onComplete?: (milestone: Milestone) => void | Promise<void>;
  onRunCompute?: (
    milestone: Milestone,
    meta: { promptTemplate: string; provider: string; model: string },
  ) => void | Promise<void>;
  onVote?: (milestone: Milestone) => void | Promise<void>;
  className?: string;
};

export default function MilestoneList({
  projectId,
  milestones,
  teamNames,
  onComplete,
  onRunCompute,
  onVote,
  className = "",
}: Props) {
  const sorted = sortMilestones(milestones);

  return (
    <section className={`space-y-3 ${className}`} aria-label={`Milestones for ${projectId}`}>
      <span className="mono text-[11px] uppercase tracking-[0.14em] text-dim">
        MILESTONE QUEUE · {sorted.length} ENTRIES
      </span>
      {sorted.length === 0 ? (
        <div className="border border-line bg-panel p-4">
          <p className="stream-line mono text-[11px]">▸ NO MILESTONES YET — PROPOSE ONE TO OPEN THE QUEUE</p>
        </div>
      ) : (
        sorted.map((m) => (
          <MilestoneCard
            key={m.id}
            milestone={m}
            teamName={teamNames?.[m.assignedTeamId ?? ""]}
            onComplete={onComplete ? (m2) => void onComplete(m2) : undefined}
            onRunCompute={
              onRunCompute
                ? (m2) =>
                    void onRunCompute(m2, {
                      promptTemplate: m2.successCriteria,
                      provider: "openai",
                      model: "token-allocation",
                    })
                : undefined
            }
            onVote={onVote ? (m2) => void onVote(m2) : undefined}
          />
        ))
      )}
    </section>
  );
}