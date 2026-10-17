// Fork flow — the escape hatch (accounts-roles-profiles spec): anyone unhappy
// with a project forks it into a NEW project they own, paying one-hop rent to
// the parent. Laws encoded here:
//  - fork_rent_pct is FROZEN AT FORK TIME (grandfathering): an owner raising
//    their rent via updateForkRent affects only FUTURE forks — existing forks
//    keep the rate they copied when created. We never re-read the parent.
//  - rent is recorded as one plugin_splits row (the table from
//    supabase-schema-v1.sql): project_id = the fork that PAYS, plugin_name =
//    parent title (human-readable), plugin_owner = parent project id
//    (machine lineage link to the parent project), split_percentage = rent %.
//  - Supabase when configured, in-memory fork store when not — same shape,
//    session-scoped (mirrors mockDb's session-singleton pattern).

import { getSupabase, getSupabaseAdmin } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mockProjects } from "@/lib/mock-db";

/** Rent ceiling law: a fork pays its parent 5-20% (standing default 10). */
export const FORK_RENT_MIN = 5;
export const FORK_RENT_MAX = 20;
export const FORK_RENT_DEFAULT = 10;
/** Lineage walk safety cap: a fork chain longer than 20 hops is corrupt data. */
export const MAX_LINEAGE_DEPTH = 20;

/** project id that anchors the rent: one-hop upstream share, read from the PARENT's fork_rent_pct at fork time */
export type ForkRentRow = {
  id: string;
  /** the fork that pays the rent (this row lives in that project's split list) */
  projectId: string;
  /** parent title, human-readable ("Fork of ..." showcase naming keeps titles intact) */
  pluginName: string;
  /** the PARENT project id — machine link to the upstream project */
  pluginOwner: string;
  splitPercentage: number;
  isRequired: boolean;
};

export type ForkedProject = {
  id: string;
  title: string;
  slug: string;
  category: string;
  summary: string;
  creatorId: string;
  claimStatus: "claimed";
  /** copied from the parent; fork starts with zero funding (tokens stay safe per stewardship rules) */
  goal: number;
  funded: number;
  supporters: number;
  imageUrl: string | null;
  /** preserved from the parent ('owner/repo') so attribution never breaks */
  originRepo: string | null;
  /** direct parent project id (null = root project) */
  forkedFrom: string | null;
  /** the one-hop rent THIS project pays upstream, frozen at fork time */
  forkRentPct: number;
  createdAt: string;
};

export type ForkResult = {
  fork: ForkedProject;
  parentId: string;
  parentTitle: string;
  /** one-hop rent row recorded into plugin_splits */
  rentSplitId: string | null;
  rentPct: number;
};

export type LineageNode = {
  projectId: string;
  title: string;
  slug: string;
  forkedFrom: string | null;
  /** rent frozen at this fork's creation time */
  forkRentPct: number;
  creatorId: string;
  /** 0 = the queried project, 1 = its parent, ... up to the root */
  depth: number;
};

export type UpdateRentResult =
  | { ok: true; forkRentPct: number }
  | { ok: false; reason: string };

export type CreateForkInput = {
  parentProjectId: string;
  newTitle: string;
  forkerProfileId: string;
  /** rent the fork pays its parent; validated 5-20. Omitted = copy the parent's own rate. */
  forkRentPct?: number;
};

export type CreateRentErrorReason = "invalid-rent" | "parent-not-found";

function validateRentPct(pct: number): boolean {
  return Number.isInteger(pct) && pct >= FORK_RENT_MIN && pct <= FORK_RENT_MAX;
}

/** Effective rent when the caller does not pin one: the PARENT's rate, copied at fork time. */
function rentFromParentOr(parentRentPct: number | null): number {
  if (parentRentPct !== null && validateRentPct(parentRentPct)) return parentRentPct;
  return FORK_RENT_DEFAULT;
}

// ── Mock fallback store (session-scoped; mirrors mockDb's singleton pattern) ──
// Kept local to this module so mock-db.ts's shape (funding-oriented MockProject)
// stays untouched — fork fields don't exist there.

type MockForkRow = ForkedProject;
const mockForks: MockForkRow[] = [];
const mockRentRows: ForkRentRow[] = [];
/** rent overrides applied to non-fork (seed/mock) projects this session */
const mockRentOverrides = new Map<string, number>();

async function resolveParentRow(
  db: SupabaseClient,
  parentProjectId: string,
): Promise<Record<string, unknown> | null> {
  // Full mirror-claim column set; fall back to base columns when the v2
  // migration has not run yet (PostgREST parse error → missing fork columns).
  const full = await db
    .from("projects")
    .select(
      "id, creator_id, title, slug, category, summary, compute_goal_cents, status, image_url, origin_repo, claim_status, forked_from, fork_rent_pct",
    )
    .eq("id", parentProjectId)
    .maybeSingle();
  if (!full.error && full.data) return full.data as Record<string, unknown>;
  const base = await db
    .from("projects")
    .select("id, creator_id, title, slug, category, summary, compute_goal_cents, status")
    .eq("id", parentProjectId)
    .maybeSingle();
  if (base.error || !base.data) return null;
  return base.data as Record<string, unknown>;
}

/**
 * Fork a project: copy the parent row into a NEW project the forker owns
 * (claim_status='claimed', zero supporters/funded), freezing fork_rent_pct at
 * fork time, and record the one-hop rent as a plugin_splits row.
 * Supabase when configured; in-memory fork store otherwise.
 */
export async function createFork(
  input: CreateForkInput,
): Promise<{ ok: true; result: ForkResult } | { ok: false; reason: CreateRentErrorReason; detail?: string }> {
  const { parentProjectId, newTitle, forkerProfileId } = input;
  if (!parentProjectId || !newTitle.trim() || !forkerProfileId) {
    return { ok: false, reason: "parent-not-found", detail: "parentProjectId, newTitle and forkerProfileId are required" };
  }
  const db = getSupabase();
  if (db) {
    const writeDb = getSupabaseAdmin() ?? db;
    const parent = await resolveParentRow(db, parentProjectId);
    if (!parent) return { ok: false, reason: "parent-not-found", detail: `project ${parentProjectId} does not exist` };

    const explicitPct = input.forkRentPct ?? null;
    if (explicitPct !== null && !validateRentPct(explicitPct)) {
      return { ok: false, reason: "invalid-rent", detail: `forkRentPct must be an integer ${FORK_RENT_MIN}-${FORK_RENT_MAX}` };
    }
    const parentPct = parent.fork_rent_pct === undefined ? null : Number(parent.fork_rent_pct ?? null);
    const rentPct = explicitPct ?? rentFromParentOr(parentPct);

    const baseSlug = `fork-of-${String(parent.slug ?? "project")}`;
    // Unique-slug retry: the standing slug law is 'fork-of-<parent-slug>';
    // a sibling fork appends a short base36 disambiguator.
    let slug = baseSlug;
    let inserted: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 3 && !inserted; attempt += 1) {
      const { data, error } = await writeDb
        .from("projects")
        .insert({
          creator_id: forkerProfileId,
          title: newTitle.trim(),
          slug,
          category: parent.category ?? "New Project",
          summary: parent.summary ?? newTitle.trim(),
          // funds never move: supporters and balance reset (tokens stay safe)
          compute_goal_cents: Math.max(1, Number(parent.compute_goal_cents ?? 100000)),
          compute_balance_cents: 0,
          supporter_count: 0,
          priority_score: 50,
          status: "active",
          // the forker auto-claims their fork
          claim_status: "claimed",
          claimed_by: forkerProfileId,
          claimed_at: new Date().toISOString(),
          // attribution preserved; lineage recorded; rent FROZEN at fork time
          origin_repo: (parent.origin_repo as string | null) ?? null,
          forked_from: parentProjectId,
          fork_rent_pct: rentPct,
        })
        .select("id, title, slug, category, summary, creator_id, claim_status, compute_goal_cents, compute_balance_cents, supporter_count, image_url, origin_repo, forked_from, fork_rent_pct, created_at")
        .single();
      if (!error && data) inserted = data as Record<string, unknown>;
      else slug = `${baseSlug}-${Date.now().toString(36)}`;
    }
    if (!inserted) {
      return { ok: false, reason: "parent-not-found", detail: "fork insert failed (slug conflict or policy)" };
    }

    // One-hop rent row: lives in the fork's split list, names the parent title,
    // carries the parent project id in plugin_owner.
    const rentRow = {
      project_id: String(inserted.id),
      plugin_name: String(parent.title ?? "upstream project"),
      plugin_owner: parentProjectId,
      split_percentage: rentPct,
      is_required: true,
    };
    const { data: rentData, error: rentError } = await writeDb
      .from("plugin_splits")
      .insert(rentRow)
      .select("id")
      .single();
    const rentSplitId = rentError || !rentData ? null : String((rentData as Record<string, unknown>).id);

    return {
      ok: true,
      result: {
        fork: mapForkRow(inserted),
        parentId: parentProjectId,
        parentTitle: String(parent.title ?? ""),
        rentSplitId,
        rentPct,
      },
    };
  }

  // ── Mock fallback: mirror the same logic in-memory ──
  const parentRow =
    mockForks.find((f) => f.id === parentProjectId) ??
    mockDbProjectAsParent(parentProjectId);
  if (!parentRow) return { ok: false, reason: "parent-not-found", detail: `project ${parentProjectId} does not exist (mock)` };

  const explicitPct = input.forkRentPct ?? null;
  if (explicitPct !== null && !validateRentPct(explicitPct)) {
    return { ok: false, reason: "invalid-rent", detail: `forkRentPct must be an integer ${FORK_RENT_MIN}-${FORK_RENT_MAX}` };
  }
  const parentPct = mockRentOverrides.get(parentProjectId) ?? parentRow.forkRentPct;
  const rentPct = explicitPct ?? rentFromParentOr(parentPct);

  const fork: ForkedProject = {
    id: `fork-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    title: newTitle.trim(),
    slug: uniqueMockSlug(`fork-of-${parentRow.slug}`),
    category: parentRow.category,
    summary: parentRow.summary,
    creatorId: forkerProfileId,
    claimStatus: "claimed",
    goal: parentRow.goal,
    funded: 0,
    supporters: 0,
    imageUrl: parentRow.imageUrl,
    originRepo: parentRow.originRepo,
    forkedFrom: parentProjectId,
    forkRentPct: rentPct,
    createdAt: new Date().toISOString(),
  };
  mockForks.unshift(fork);

  const rent: ForkRentRow = {
    id: `rent-${fork.id}`,
    projectId: fork.id,
    pluginName: parentRow.title,
    pluginOwner: parentProjectId,
    splitPercentage: rentPct,
    isRequired: true,
  };
  mockRentRows.unshift(rent);

  return {
    ok: true,
    result: { fork, parentId: parentProjectId, parentTitle: parentRow.title, rentSplitId: rent.id, rentPct },
  };
}

function uniqueMockSlug(base: string): string {
  if (!mockForks.some((f) => f.slug === base)) return base;
  return `${base}-${Date.now().toString(36)}`;
}

/** Wrap a mockDb seed project into the fork-record shape (no fork fields → root, default rent). */
function mockDbProjectAsParent(id: string): ForkedProject | null {
  const p = mockProjects.find((m) => m.id === id);
  if (!p) return null;
  return {
    id: p.id,
    title: p.title,
    slug: p.id,
    category: p.category,
    summary: p.summary,
    creatorId: p.creatorId,
    claimStatus: "claimed",
    goal: p.goal,
    funded: p.funded,
    supporters: p.supporters,
    imageUrl: p.imageUrl ?? null,
    originRepo: null,
    forkedFrom: null,
    forkRentPct: FORK_RENT_DEFAULT,
    createdAt: "seed",
  };
}

function mapForkRow(row: Record<string, unknown>): ForkedProject {
  return {
    id: String(row.id),
    title: String(row.title),
    slug: String(row.slug),
    category: String(row.category ?? "New Project"),
    summary: String(row.summary ?? ""),
    creatorId: String(row.creator_id ?? ""),
    claimStatus: "claimed",
    goal: Number(row.compute_goal_cents ?? 0) / 100,
    funded: Number(row.compute_balance_cents ?? 0) / 100,
    supporters: Number(row.supporter_count ?? 0),
    imageUrl: (row.image_url as string | null) ?? null,
    originRepo: (row.origin_repo as string | null) ?? null,
    forkedFrom: (row.forked_from as string | null) ?? null,
    forkRentPct: Number(row.fork_rent_pct ?? FORK_RENT_DEFAULT),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

/**
 * Update a project's own one-hop rent (owner of a CLAIMED project only).
 * GRANDFATHERING: this changes the rate FUTURE forks out of this project pay;
 * existing children keep the rate they copied at fork time — we never
 * re-read the parent later, by law.
 */
export async function updateForkRent(
  projectId: string,
  pct: number,
  ownerId: string,
): Promise<UpdateRentResult> {
  if (!projectId || !ownerId) return { ok: false, reason: "projectId and ownerId are required" };
  if (!validateRentPct(pct)) {
    return { ok: false, reason: `pct must be an integer ${FORK_RENT_MIN}-${FORK_RENT_MAX}` };
  }
  const db = getSupabase();
  if (db) {
    const writeDb = getSupabaseAdmin() ?? db;
    // claimed owner only: creator of a row whose claim_status is already 'claimed'
    const { data, error } = await writeDb
      .from("projects")
      .update({ fork_rent_pct: pct })
      .eq("id", projectId)
      .eq("claim_status", "claimed")
      .eq("creator_id", ownerId)
      .select("id");
    if (error) return { ok: false, reason: "update failed (policy or schema)" };
    if (!data || data.length === 0) {
      return { ok: false, reason: "not the claimed owner (project must be claimed and owned by you)" };
    }
    return { ok: true, forkRentPct: pct };
  }
  // Mock: a claimed fork we created, or (session-local) a rent override on any
  // mock project the caller created in-session — claim law mirrors the db path.
  const forkRow = mockForks.find((f) => f.id === projectId);
  if (forkRow) {
    if (forkRow.creatorId !== ownerId) {
      return { ok: false, reason: "not the claimed owner (project must be claimed and owned by you)" };
    }
    forkRow.forkRentPct = pct;
    for (const rent of mockRentRows) {
      if (rent.projectId === projectId) rent.splitPercentage = pct;
    }
    return { ok: true, forkRentPct: pct };
  }
  const seed = mockProjects.find((m) => m.id === projectId);
  if (seed && seed.creatorId === ownerId) {
    mockRentOverrides.set(projectId, pct);
    return { ok: true, forkRentPct: pct };
  }
  return { ok: false, reason: "not the claimed owner (project must be claimed and owned by you)" };
}

/**
 * Resolve the forked_from chain from `projectId` up to the root (max 20 hops).
 * Order: the queried project first (depth 0), then each ancestor.
 */
export async function listLineage(projectId: string): Promise<LineageNode[]> {
  if (!projectId) return [];
  const db = getSupabase();
  if (db) {
    const nodes: LineageNode[] = [];
    const seen = new Set<string>();
    let current: string | null = projectId;
    let depth = 0;
    while (current && depth < MAX_LINEAGE_DEPTH && !seen.has(current)) {
      seen.add(current);
      const { data, error } = await db
        .from("projects")
        .select("id, title, slug, creator_id, forked_from, fork_rent_pct")
        .eq("id", current)
        .maybeSingle();
      if (error || !data) break;
      const row = data as Record<string, unknown>;
      const next: string | null = (row.forked_from as string | null) ?? null;
      nodes.push({
        projectId: String(row.id),
        title: String(row.title ?? ""),
        slug: String(row.slug ?? ""),
        forkedFrom: next,
        forkRentPct: Number(row.fork_rent_pct ?? FORK_RENT_DEFAULT),
        creatorId: String(row.creator_id ?? ""),
        depth,
      });
      current = next;
      depth += 1;
    }
    return nodes;
  }
  // Mock: fork-store records carry lineage; seed mock projects are roots.
  const nodes: LineageNode[] = [];
  const seen = new Set<string>();
  let current: string | null = projectId;
  let depth = 0;
  while (current && depth < MAX_LINEAGE_DEPTH && !seen.has(current)) {
    seen.add(current);
    const forkRow = mockForks.find((f) => f.id === current);
    if (forkRow) {
      nodes.push({
        projectId: forkRow.id,
        title: forkRow.title,
        slug: forkRow.slug,
        forkedFrom: forkRow.forkedFrom,
        forkRentPct: forkRow.forkRentPct,
        creatorId: forkRow.creatorId,
        depth,
      });
      current = forkRow.forkedFrom;
    } else {
      const seed = mockDbProjectAsParent(current);
      if (!seed) break; // unknown id — stop the walk
      nodes.push({
        projectId: seed.id,
        title: seed.title,
        slug: seed.slug,
        forkedFrom: null,
        forkRentPct: mockRentOverrides.get(seed.id) ?? seed.forkRentPct,
        creatorId: seed.creatorId,
        depth,
      });
      current = null;
    }
    depth += 1;
  }
  return nodes;
}

/** One-hop rent rows recorded for `projectId` (mock readback; db path is listPluginSplits). */
export function listMockForkRents(projectId: string): ForkRentRow[] {
  return mockRentRows.filter((r) => r.projectId === projectId);
}