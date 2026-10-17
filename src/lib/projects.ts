// Project data layer (plan Task 15/16). Supabase when configured,
// mockDb when not — same shape, so page.tsx doesn't care which mode is live.

import { getSupabase } from "@/lib/supabase";
import { mockDb, type MockProject } from "@/lib/mock-db";
import type { Milestone, PluginSplit, TeamProfile } from "@/types/compute-fund";

export type ProjectView = MockProject & {
  milestones: Milestone[];
  pluginSplits: PluginSplit[];
  team: TeamProfile | null;
  /** votes cast on the project itself (community_priority input) */
  projectVotes: number;
  /** ── mirror-claim model ── */
  /** generated themed art: '/project-art/<name>.png' (relative to site root) */
  imageUrl: string | null;
  /** the real upstream repo this unit mirrors: 'owner/repo' (null = platform demo unit) */
  originRepo: string | null;
  /** unclaimed | claimed | review */
  claimStatus: "unclaimed" | "claimed" | "review";
  /** one-hop upstream rent, % (fork/forking model — default 10) */
  forkRentPct: number;
  featured: boolean;
};

const DEFAULT_CLAIM = {
  imageUrl: null,
  originRepo: null,
  claimStatus: "unclaimed" as const,
  forkRentPct: 10,
  featured: false,
};

async function readMilestones(projectId: string): Promise<Milestone[]> {
  const db = getSupabase();
  if (db) {
    const { data, error } = await db
      .from("milestones")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });
    if (!error && data) {
      return data.map((row: Record<string, unknown>) => ({
        id: String(row.id),
        projectId: String(row.project_id),
        title: String(row.title),
        description: String(row.description),
        successCriteria: String(row.success_criteria),
        estimatedTokens: Number(row.estimated_tokens),
        actualTokens: row.actual_tokens === null ? null : Number(row.actual_tokens),
        status: row.status as Milestone["status"],
        assignedTeamId: (row.assigned_team_id as string | null) ?? null,
        deadline: (row.deadline as string | null) ?? null,
        votes: 0, // refined by votes layer
        createdAt: String(row.created_at),
        completedAt: (row.completed_at as string | null) ?? null,
        tokenLedger: [],
      }));
    }
    return [];
  }
  return mockDb.milestones[projectId] ?? [];
}

export async function getProjectsWithDetail(): Promise<ProjectView[]> {
  const db = getSupabase();
  if (db) {
    // Try the full mirror-claim column set; if the v2-mirror migration has not run
    // yet (columns missing → PostgREST parse error), fall back to base columns.
    let rows: Record<string, unknown>[] | null = null;
    {
      const full = await db
        .from("projects")
        .select("id, title, slug, category, summary, compute_goal_cents, compute_balance_cents, supporter_count, priority_score, creator_id, created_at, image_url, origin_repo, claim_status, fork_rent_pct, featured")
        .order("priority_score", { ascending: false });
      if (!full.error) rows = (full.data ?? []) as Record<string, unknown>[];
      else {
        const base = await db
          .from("projects")
          .select("id, title, slug, category, summary, compute_goal_cents, compute_balance_cents, supporter_count, priority_score, creator_id, created_at")
          .order("priority_score", { ascending: false });
        rows = (base.data ?? []) as Record<string, unknown>[];
      }
    }
    if (rows && rows.length > 0) {
      const { data: profiles } = await db.from("profiles").select("id, display_name");
      const nameById = new Map(
        ((profiles as Record<string, unknown>[] | null) ?? []).map((p) => [
          String(p.id),
          String(p.display_name ?? "creator"),
        ]),
      );
      return Promise.all(
        rows.map(async (row) => {
          const projectId = String(row.id);
          const milestones = await readMilestones(projectId);
          return {
            id: projectId,
            title: String(row.title),
            creator: nameById.get(String(row.creator_id ?? "")) ?? "creator",
            creatorId: String(row.creator_id ?? ""),
            category: String(row.category ?? "New Project"),
            summary: String(row.summary ?? ""),
            story: String(row.summary ?? ""),
            deadline: "—",
            goal: Number(row.compute_goal_cents ?? 0) / 100,
            funded: Number(row.compute_balance_cents ?? 0) / 100,
            supporters: Number(row.supporter_count ?? 0),
            priority: Number(row.priority_score ?? 50),
            mine: false,
            following: false,
            fundedByMe: 0,
            ledger: [],
            runs: [],
            milestones,
            pluginSplits: [],
            team: null,
            projectVotes: 0,
            imageUrl: (row.image_url as string | null) ?? DEFAULT_CLAIM.imageUrl,
            originRepo: (row.origin_repo as string | null) ?? DEFAULT_CLAIM.originRepo,
            claimStatus: ((row.claim_status as string) ?? "unclaimed") as ProjectView["claimStatus"],
            forkRentPct: Number(row.fork_rent_pct ?? 10),
            featured: Boolean(row.featured ?? false),
          } satisfies ProjectView;
        }),
      );
    }
    // Supabase connected but no projects yet (schema not seeded) — serve the
    // mock board so onboarding never shows a blank commons.
    console.info("[projects] Supabase returned no projects — falling back to mock board");
  }

  return Promise.all(
    mockDb.projects.map(async (project) => ({
      ...project,
      ...DEFAULT_CLAIM,
      imageUrl: project.imageUrl ?? null,
      milestones: await readMilestones(project.id),
      pluginSplits: mockDb.pluginSplits.filter((s) => s.projectId === project.id),
      team: mockDb.teams.find((t) => t.id === project.creatorId) ?? null,
      projectVotes: 0,
    })),
  );
}

/** Mock-mode funding mutation so the ledger reflects new funds during a session. */
export function applyMockFunding(projectId: string, amount: number) {
  const project = mockDb.projects.find((p) => p.id === projectId);
  if (!project) return;
  project.funded += amount;
  project.fundedByMe += amount;
  project.following = true;
  project.supporters += 1;
  project.priority = Math.min(100, project.priority + 2);
  project.ledger.unshift({
    id: crypto.randomUUID(),
    kind: "funding" as const,
    label: "Local compute sponsorship (Stripe pending)",
    amount,
    timestamp: "Just now",
  });
}

/** Mock-mode follow toggle (session-persistent only, same as funding). */
export function applyMockFollow(projectId: string) {
  const project = mockDb.projects.find((p) => p.id === projectId);
  if (!project) return;
  project.following = !project.following;
}

/** Plan Task 16: persist a new project (Supabase) or mock-create it. */
export async function persistProject(input: {
  creatorId: string;
  title: string;
  summary: string;
  goal: number;
  category: string;
}): Promise<{ project: MockProject; persistedSupabase: boolean }> {
  const db = getSupabase();
  if (db) {
    const slug = `${input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${Date.now().toString(36)}`;
    const { data, error } = await db
      .from("projects")
      .insert({
        title: input.title,
        slug,
        summary: input.summary,
        category: input.category,
        compute_goal_cents: Math.round(input.goal * 100),
        creator_id: input.creatorId,
        priority_score: 50,
        status: "active",
      })
      .select("id, title, slug, summary, category, compute_goal_cents")
      .single();
    if (!error && data) {
      const row = data as Record<string, unknown>;
      return {
        persistedSupabase: true,
        project: {
          id: String(row.id),
          title: String(row.title),
          creator: input.creatorId.replace(/^team-/, ""),
          creatorId: input.creatorId,
          category: String(row.category),
          summary: String(row.summary),
          story: String(row.summary),
          deadline: "—",
          goal: Number(row.compute_goal_cents) / 100,
          funded: 0,
          supporters: 0,
          priority: 50,
          mine: true,
          following: false,
          fundedByMe: 0,
          ledger: [],
          runs: [],
        },
      };
    }
    return { persistedSupabase: false, project: mockCreate(input) };
  }
  return { persistedSupabase: false, project: mockCreate(input) };
}

function mockCreate(input: {
  creatorId: string;
  title: string;
  summary: string;
  goal: number;
  category: string;
}): MockProject {
  const project: MockProject = {
    id: `${input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${Date.now()}`,
    title: input.title,
    creator: input.creatorId ? input.creatorId.replace(/^team-/, "") : "Gui Labs",
    creatorId: input.creatorId || "team-gui-labs",
    category: input.category,
    summary: input.summary,
    story: input.summary,
    deadline: "Draft deadline",
    goal: input.goal,
    funded: 0,
    supporters: 0,
    priority: 50,
    mine: true,
    following: false,
    fundedByMe: 0,
    ledger: [],
    runs: [],
  };
  mockDb.projects.unshift(project);
  return project;
}