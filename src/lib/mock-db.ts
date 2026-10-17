// In-memory mock store — the credential-free fallback that makes the whole
// v1 feature set demoable without Supabase/Stripe keys. Every lib follows the
// pattern: `const db = getSupabase(); if (!db) return mock...`.
// Mock data matches supabase-schema-v1.sql + src/types/compute-fund.ts.

import type {
  Milestone,
  PluginSplit,
  Rating,
  TeamProfile,
  TokenLedgerEntry,
  Vote,
} from "@/types/compute-fund";

export type MockProject = {
  id: string;
  title: string;
  creator: string;
  creatorId: string;
  category: string;
  summary: string;
  story: string;
  deadline: string;
  goal: number;
  funded: number;
  supporters: number;
  priority: number;
  mine: boolean;
  following: boolean;
  fundedByMe: number;
  imageUrl?: string | null;
  ledger: {
    id: string;
    kind: "funding" | "compute" | "badge";
    label: string;
    amount: number;
    timestamp: string;
  }[];
  runs: {
    id: string;
    model: string;
    prompt: string;
    cost: number;
    status: "complete" | "queued";
    output: string;
    timestamp: string;
  }[];
};

export const mockProjects: MockProject[] = [
  {
    id: "astra-proof",
    imageUrl: "/project-art/diffusers.png",
    title: "Astra Math Verification Sprint",
    creator: "Open Research Guild",
    creatorId: "team-arg",
    category: "Research",
    summary:
      "Pool compute to test frontier models against a difficult proof search with every run logged for supporters.",
    story:
      "This campaign funds repeatable reasoning runs, verifier checks, and public notes for a proof-search problem that is too expensive for one small team to explore alone.",
    deadline: "Sep 18, 2026",
    goal: 12000,
    funded: 7420,
    supporters: 186,
    priority: 91,
    mine: false,
    following: true,
    fundedByMe: 100,
    ledger: [
      { id: "l-1", kind: "funding", label: "Community compute sponsorship", amount: 5200, timestamp: "Today, 10:12 AM" },
      { id: "l-2", kind: "compute", label: "OpenAI reasoning batch", amount: -820, timestamp: "Today, 12:35 PM" },
      { id: "l-3", kind: "badge", label: "Supporter receipts minted", amount: 0, timestamp: "Today, 12:37 PM" },
    ],
    runs: [
      {
        id: "r-1",
        model: "OpenAI reasoning",
        prompt: "Search for proof sketches and counterexamples",
        cost: 820,
        status: "complete",
        output: "3 promising proof routes, 1 invalidated assumption, next run queued.",
        timestamp: "Today, 12:35 PM",
      },
    ],
  },
  {
    id: "clinic-ops",
    imageUrl: "/project-art/plane.png",
    title: "Rural Clinic Scheduling Optimizer",
    creator: "Civic Systems Lab",
    creatorId: "team-csl",
    category: "Public Good",
    summary:
      "Use sponsored model credits to reduce wait times for a small clinic without buying expensive enterprise software.",
    story:
      "A small clinic needs better appointment planning, but the budget does not support enterprise optimization software. Supporters fund AI analysis runs against anonymized schedule constraints.",
    deadline: "Oct 2, 2026",
    goal: 6800,
    funded: 3120,
    supporters: 74,
    priority: 68,
    mine: false,
    following: false,
    fundedByMe: 0,
    ledger: [
      { id: "l-4", kind: "funding", label: "Local sponsor pool", amount: 3120, timestamp: "Yesterday, 5:20 PM" },
    ],
    runs: [
      {
        id: "r-2",
        model: "Claude",
        prompt: "Generate appointment optimization plan from sample constraints",
        cost: 240,
        status: "queued",
        output: "Waiting for creator approval.",
        timestamp: "Queued",
      },
    ],
  },
  {
    id: "open-dev",
    imageUrl: "/project-art/sandcastle.png",
    title: "Open Source Bug Bounty Agent",
    creator: "Gui Labs",
    creatorId: "team-gui-labs",
    category: "Developer Tools",
    summary:
      "Backers fund AI debugging passes for issues maintainers cannot afford to investigate manually.",
    story:
      "Maintainers publish hard issues, supporters sponsor model runs, and every debugging attempt becomes a receipt: prompt, provider, spend, output, and next step.",
    deadline: "Aug 28, 2026",
    goal: 9500,
    funded: 8910,
    supporters: 241,
    priority: 97,
    mine: true,
    following: false,
    fundedByMe: 0,
    ledger: [
      { id: "l-5", kind: "funding", label: "Monthly supporter credits", amount: 8910, timestamp: "Mon, 9:45 AM" },
      { id: "l-6", kind: "compute", label: "xAI code analysis run", amount: -640, timestamp: "Mon, 11:02 AM" },
    ],
    runs: [
      {
        id: "r-3",
        model: "xAI code",
        prompt: "Investigate flaky parser failures in issue #184",
        cost: 640,
        status: "complete",
        output: "Found race condition around shared fixture initialization.",
        timestamp: "Mon, 11:02 AM",
      },
    ],
  },
];

export const mockTeams: TeamProfile[] = [
  { id: "team-arg", name: "Open Research Guild", isTeam: true, teamRating: 4.8, ratingCount: 26, tokenBalance: 0 },
  { id: "team-csl", name: "Civic Systems Lab", isTeam: true, teamRating: 4.6, ratingCount: 9, tokenBalance: 0 },
  { id: "team-gui-labs", name: "Gui Labs", isTeam: true, teamRating: 4.9, ratingCount: 41, tokenBalance: 0 },
  { id: "team-comfy", name: "ComfyUI Maintainers", isTeam: true, teamRating: 4.4, ratingCount: 58, tokenBalance: 0 },
];

export const mockMilestones: Record<string, Milestone[]> = {
  "astra-proof": [
    {
      id: "m-1",
      projectId: "astra-proof",
      title: "Proof-search sweep round 2",
      description: "Run 12 frontier reasoning passes over the two open lemmas.",
      successCriteria: "At least one lemma with a complete proof path or all paths refuted.",
      estimatedTokens: 4_000_000,
      actualTokens: 3_100_000,
      status: "complete",
      assignedTeamId: "team-arg",
      deadline: "Sep 30, 2026",
      votes: 412,
      createdAt: "2026-09-12T10:00:00Z",
      completedAt: "2026-09-28T15:00:00Z",
      tokenLedger: [
        {
          id: "tl-1",
          milestoneId: "m-1",
          kind: "run",
          provider: "openai",
          model: "o4-reasoning",
          tokensIn: 2_600_000,
          tokensOut: 500_000,
          costUsd: 820,
          receipt: {
            prompt: "Search for proof sketches and counterexamples",
            outputSummary: "3 promising proof routes, 1 invalidated assumption",
          },
          createdAt: "2026-09-15T12:35:00Z",
        },
        {
          id: "tl-2",
          milestoneId: "m-1",
          kind: "team_reward",
          provider: "internal",
          model: "token-allocation",
          tokensIn: 0,
          tokensOut: 900_000,
          costUsd: 0,
          receipt: {
            prompt: "leftover allocation",
            outputSummary: "22.5% under estimate — 900k tokens rewarded to Open Research Guild",
          },
          createdAt: "2026-09-28T15:01:00Z",
        },
      ],
    },
    {
      id: "m-2",
      projectId: "astra-proof",
      title: "Verifier harness hardening",
      description: "Automate the checker so every claimed proof path is machine-verified.",
      successCriteria: "Checker re-runs a full sweep unattended with logged diffs.",
      estimatedTokens: 2_000_000,
      actualTokens: null,
      status: "active",
      assignedTeamId: "team-arg",
      deadline: "Oct 20, 2026",
      votes: 187,
      createdAt: "2026-09-29T09:00:00Z",
      completedAt: null,
      tokenLedger: [],
    },
    {
      id: "m-3",
      projectId: "astra-proof",
      title: "Public proof notes for run 12",
      description: "Write the open noteset for the completed sweep, receipts attached.",
      successCriteria: "Noteset published with every run linked.",
      estimatedTokens: 400_000,
      actualTokens: null,
      status: "proposed",
      assignedTeamId: null,
      deadline: null,
      votes: 96,
      createdAt: "2026-10-01T09:00:00Z",
      completedAt: null,
      tokenLedger: [],
    },
  ],
  "clinic-ops": [
    {
      id: "m-4",
      projectId: "clinic-ops",
      title: "Wait-time analysis plan",
      description: "Model anonymized schedule constraints and draft the optimization plan.",
      successCriteria: "Plan reduces modelled average wait by 15% without adding staff hours.",
      estimatedTokens: 1_200_000,
      actualTokens: null,
      status: "funded",
      assignedTeamId: "team-csl",
      deadline: "Oct 15, 2026",
      votes: 188,
      createdAt: "2026-09-20T09:00:00Z",
      completedAt: null,
      tokenLedger: [],
    },
  ],
  "open-dev": [
    {
      id: "m-5",
      projectId: "open-dev",
      title: "Issue #184 race-condition patch",
      description: "Isolate the shared-fixture race and land a fix with regression tests.",
      successCriteria: "Flaky parser suite green over 200 runs.",
      estimatedTokens: 3_500_000,
      actualTokens: 2_800_000,
      status: "complete",
      assignedTeamId: "team-gui-labs",
      deadline: "Sep 5, 2026",
      votes: 930,
      createdAt: "2026-08-02T09:00:00Z",
      completedAt: "2026-09-01T11:02:00Z",
      tokenLedger: [
        {
          id: "tl-3",
          milestoneId: "m-5",
          kind: "run",
          provider: "xai",
          model: "grok-code",
          tokensIn: 2_400_000,
          tokensOut: 400_000,
          costUsd: 640,
          receipt: {
            prompt: "Investigate flaky parser failures in issue #184",
            outputSummary: "Found race condition around shared fixture initialization",
          },
          createdAt: "2026-09-01T11:02:00Z",
        },
        {
          id: "tl-4",
          milestoneId: "m-5",
          kind: "team_reward",
          provider: "internal",
          model: "token-allocation",
          tokensIn: 0,
          tokensOut: 700_000,
          costUsd: 0,
          receipt: {
            prompt: "leftover allocation",
            outputSummary: "20% under estimate — 700k tokens stacked for run 08",
          },
          createdAt: "2026-09-01T11:10:00Z",
        },
      ],
    },
    {
      id: "m-6",
      projectId: "open-dev",
      title: "Run 08: parser regression sweep",
      description: "Use stacked tokens to sweep the parser suite across matrix builds.",
      successCriteria: "Zero flakes in 500 consecutive CI runs.",
      estimatedTokens: 1_700_000,
      actualTokens: null,
      status: "active",
      assignedTeamId: "team-gui-labs",
      deadline: "Oct 25, 2026",
      votes: 501,
      createdAt: "2026-10-02T09:00:00Z",
      completedAt: null,
      tokenLedger: [],
    },
  ],
};

export const mockRatings: Rating[] = [
  {
    id: "rt-1",
    teamId: "team-arg",
    raterId: "user-community-7",
    milestoneId: "m-1",
    rating: 5,
    review: "Under budget, receipts immaculate.",
    createdAt: "2026-09-29T10:00:00Z",
  },
  {
    id: "rt-2",
    teamId: "team-gui-labs",
    raterId: "user-community-3",
    milestoneId: "m-5",
    rating: 5,
    review: "Found the race in one pass.",
    createdAt: "2026-09-02T10:00:00Z",
  },
];

export const mockVotes: Vote[] = [];

export const mockPluginSplits: PluginSplit[] = [
  {
    id: "ps-1",
    projectId: "open-dev",
    pluginName: "ComfyUI",
    pluginOwner: "comfyanonymous",
    splitPercentage: 10,
    isRequired: true,
  },
  {
    id: "ps-2",
    projectId: "clinic-ops",
    pluginName: "Obsidian",
    pluginOwner: "obsidian",
    splitPercentage: 10,
    isRequired: true,
  },
];

/** Simple mutable accessor — mock mode is a session-level singleton. */
export const mockDb = {
  get projects() {
    return mockProjects;
  },
  get milestones() {
    return mockMilestones;
  },
  get teams() {
    return mockTeams;
  },
  get ratings() {
    return mockRatings;
  },
  get votes() {
    return mockVotes;
  },
  get pluginSplits() {
    return mockPluginSplits;
  },
  addVote(vote: Vote) {
    mockVotes.push(vote);
    if (vote.milestoneId) {
      for (const list of Object.values(mockMilestones)) {
        const m = list.find((x) => x.id === vote.milestoneId);
        if (m) m.votes += vote.voteWeight;
      }
    }
  },
  addRating(rating: Rating) {
    mockRatings.push(rating);
    const team = mockTeams.find((t) => t.id === rating.teamId);
    if (team) {
      const teamRatings = mockRatings.filter((r) => r.teamId === rating.teamId);
      team.ratingCount += 1;
      team.teamRating =
        Math.round(
          ((team.teamRating * (team.ratingCount - 1) + rating.rating) / team.ratingCount) * 10,
        ) / 10;
    }
  },
  addTokenEntry(entry: TokenLedgerEntry) {
    for (const list of Object.values(mockMilestones)) {
      const m = list.find((x) => x.id === entry.milestoneId);
      if (m) {
        m.tokenLedger.unshift(entry);
        if (entry.kind === "run") {
          m.actualTokens = (m.actualTokens ?? 0) + entry.tokensIn + entry.tokensOut;
        }
      }
    }
  },
  upsertMilestone(milestone: Milestone) {
    const list = mockMilestones[milestone.projectId] ?? (mockMilestones[milestone.projectId] = []);
    const i = list.findIndex((x) => x.id === milestone.id);
    if (i >= 0) list[i] = milestone;
    else list.push(milestone);
  },
};