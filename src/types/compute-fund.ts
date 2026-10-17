// Compute Fund v1 — shared type contract.
// Every lib and component imports from here. Keep in sync with supabase-schema-v1.sql.

export type MilestoneStatus = "proposed" | "funded" | "active" | "complete" | "failed";

export type Milestone = {
  id: string;
  projectId: string;
  title: string;
  description: string;
  successCriteria: string;
  estimatedTokens: number;
  actualTokens: number | null;
  status: MilestoneStatus;
  assignedTeamId: string | null;
  deadline: string | null;
  /** denormalized count of community_votes for this milestone (mock mode computed live) */
  votes: number;
  createdAt: string;
  completedAt: string | null;
  /** token_ledger entries for this milestone (runs + team rewards) */
  tokenLedger: TokenLedgerEntry[];
};

export type TokenLedgerEntry = {
  id: string;
  milestoneId: string;
  /** "run" = compute spend, "team_reward" = leftover allocation */
  kind: "run" | "team_reward";
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  /** public receipt: prompt, output summary, and raw usage */
  receipt: {
    prompt: string;
    outputSummary: string;
    usage?: Record<string, unknown>;
  };
  createdAt: string;
};

export type TeamProfile = {
  id: string;
  name: string;
  isTeam: boolean;
  teamRating: number; // aggregate average, 0 = unrated
  ratingCount: number;
  tokenBalance: number; // leftover tokens earned from efficient milestones
};

export type Rating = {
  id: string;
  teamId: string;
  raterId: string;
  milestoneId: string;
  rating: number; // 1-5
  review: string | null;
  createdAt: string;
};

export type Vote = {
  id: string;
  voterId: string;
  milestoneId: string | null;
  projectId: string | null;
  voteWeight: number;
  createdAt: string;
};

export type PluginSplit = {
  id: string;
  projectId: string;
  pluginName: string;
  pluginOwner: string | null;
  splitPercentage: number; // 0-100
  isRequired: boolean;
};

export type Category =
  | "Research"
  | "Public Good"
  | "Developer Tools"
  | "Video Creation"
  | "Math & Verification"
  | "Open Source"
  | "AI Safety";

export const ALL_CATEGORIES: Category[] = [
  "Research",
  "Public Good",
  "Developer Tools",
  "Video Creation",
  "Math & Verification",
  "Open Source",
  "AI Safety",
];

/** team badge rules (from plan Task 11) */
export function teamBadge(avgRating: number, ratingCount: number) {
  if (ratingCount === 0) return null;
  if (avgRating < 2.5) return "Needs Improvement";
  if (avgRating >= 4.5) return "Top Performer";
  return null;
}

/** milestone sort law (plan Task 6): active first, then funded, then proposed, then complete/failed */
export const MILESTONE_STATUS_ORDER: MilestoneStatus[] = [
  "active",
  "funded",
  "proposed",
  "failed",
  "complete",
];

export function sortMilestones(list: Milestone[]): Milestone[] {
  return [...list].sort(
    (a, b) =>
      MILESTONE_STATUS_ORDER.indexOf(a.status) - MILESTONE_STATUS_ORDER.indexOf(b.status) ||
      b.votes - a.votes,
  );
}