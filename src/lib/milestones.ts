// Milestone CRUD — plan Tasks 5/6/7/8 data layer.
// Pattern LAW: `const db = getSupabase(); if (!db) { ...mock... }` — both paths real.
// Table names per supabase-schema-v1.sql: `milestones`, `token_ledger`, `teams`.

import type { Milestone, TokenLedgerEntry } from "@/types/compute-fund";
import { getSupabase } from "@/lib/supabase";
import { allocateLeftoverTokens } from "@/lib/token-allocation";

/** Input for createMilestone — server fills id/votes/createdAt/tokenLedger. */
export type NewMilestoneInput = Pick<
  Milestone,
  | "projectId"
  | "title"
  | "description"
  | "successCriteria"
  | "estimatedTokens"
  | "status"
  | "assignedTeamId"
  | "deadline"
> & { actualTokens?: number | null };

/** Snapshot rows for Supabase: the contract minus the denormalized fields we compute. */
function toDbRow(input: NewMilestoneInput & { id: string; createdAt: string }) {
  const { actualTokens = null, deadline = null, assignedTeamId = null, ...rest } = input;
  return {
    ...rest,
    actual_tokens: actualTokens,
    assigned_team_id: assignedTeamId,
    deadline,
  };
}

function fromLedgerRow(row: Record<string, unknown>): TokenLedgerEntry {
  return {
    id: String(row.id),
    milestoneId: String(row.milestone_id),
    kind: (row.kind ?? "run") as TokenLedgerEntry["kind"],
    provider: String(row.provider ?? ""),
    model: String(row.model ?? ""),
    tokensIn: Number(row.tokens_in ?? 0),
    tokensOut: Number(row.tokens_out ?? 0),
    costUsd: Number(row.cost_usd ?? 0),
    receipt: (row.receipt ?? { prompt: "", outputSummary: "" }) as TokenLedgerEntry["receipt"],
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function fromDbRow(row: Record<string, unknown>, ledger: TokenLedgerEntry[] = []): Milestone {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    title: String(row.title),
    description: String(row.description ?? ""),
    successCriteria: String(row.success_criteria ?? ""),
    estimatedTokens: Number(row.estimated_tokens ?? 0),
    actualTokens: row.actual_tokens == null ? null : Number(row.actual_tokens),
    status: (row.status ?? "proposed") as Milestone["status"],
    assignedTeamId: row.assigned_team_id == null ? null : String(row.assigned_team_id),
    deadline: row.deadline == null ? null : String(row.deadline),
    votes: Number(row.votes ?? 0),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    completedAt: row.completed_at == null ? null : String(row.completed_at),
    tokenLedger: ledger,
  };
}

/** fetch token_ledger rows for a set of milestone ids, grouped by milestone */
async function fetchLedger(db: NonNullable<ReturnType<typeof getSupabase>>, ids: string[]) {
  const byMilestone = new Map<string, TokenLedgerEntry[]>();
  if (ids.length === 0) return byMilestone;
  const { data } = await db.from("token_ledger").select("*").in("milestone_id", ids);
  for (const row of data ?? []) {
    const entry = fromLedgerRow(row as Record<string, unknown>);
    const list = byMilestone.get(entry.milestoneId) ?? [];
    list.push(entry);
    byMilestone.set(entry.milestoneId, list);
  }
  return byMilestone;
}

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createMilestone(input: NewMilestoneInput): Promise<Milestone | null> {
  const id = newId("m");
  const now = new Date().toISOString();
  const db = getSupabase();
  if (!db) {
    const { mockDb } = await import("@/lib/mock-db");
    const milestone: Milestone = {
      id,
      projectId: input.projectId,
      title: input.title,
      description: input.description,
      successCriteria: input.successCriteria,
      estimatedTokens: input.estimatedTokens,
      actualTokens: input.actualTokens ?? null,
      status: input.status,
      assignedTeamId: input.assignedTeamId ?? null,
      deadline: input.deadline ?? null,
      votes: 0,
      createdAt: now,
      completedAt: null,
      tokenLedger: [],
    };
    mockDb.upsertMilestone(milestone);
    return milestone;
  }
  const { data, error } = await db
    .from("milestones")
    .insert(toDbRow({ ...input, id, createdAt: now }))
    .select("*")
    .single();
  if (error || !data) return null;
  return fromDbRow(data);
}

export async function getMilestones(projectId: string): Promise<Milestone[]> {
  const db = getSupabase();
  if (!db) {
    const { mockDb } = await import("@/lib/mock-db");
    return mockDb.milestones[projectId] ?? [];
  }
  const { data, error } = await db.from("milestones").select("*").eq("project_id", projectId);
  if (error || !data) return [];
  const ledger = await fetchLedger(db, data.map((r) => String(r.id)));
  return data.map((row) => fromDbRow(row, ledger.get(String(row.id)) ?? []));
}

export async function getAllMilestones(): Promise<Milestone[]> {
  const db = getSupabase();
  if (!db) {
    const { mockDb } = await import("@/lib/mock-db");
    return Object.values(mockDb.milestones).flat();
  }
  const { data, error } = await db.from("milestones").select("*");
  if (error || !data) return [];
  const ledger = await fetchLedger(db, data.map((r) => String(r.id)));
  return data.map((row) => fromDbRow(row, ledger.get(String(row.id)) ?? []));
}

export async function getMilestone(milestoneId: string): Promise<Milestone | null> {
  const db = getSupabase();
  if (!db) {
    const { mockDb } = await import("@/lib/mock-db");
    for (const list of Object.values(mockDb.milestones)) {
      const m = list.find((x) => x.id === milestoneId);
      if (m) return m;
    }
    return null;
  }
  const { data, error } = await db.from("milestones").select("*").eq("id", milestoneId).maybeSingle();
  if (error || !data) return null;
  const ledger = await fetchLedger(db, [milestoneId]);
  return fromDbRow(data, ledger.get(milestoneId) ?? []);
}

export async function updateMilestone(
  milestoneId: string,
  patch: Partial<Milestone>,
): Promise<Milestone | null> {
  const db = getSupabase();
  if (!db) {
    const { mockDb } = await import("@/lib/mock-db");
    for (const list of Object.values(mockDb.milestones)) {
      const i = list.findIndex((x) => x.id === milestoneId);
      if (i >= 0) {
        list[i] = { ...list[i], ...patch };
        return list[i];
      }
    }
    return null;
  }
  const columnPatch: Record<string, unknown> = {};
  if (patch.title !== undefined) columnPatch.title = patch.title;
  if (patch.description !== undefined) columnPatch.description = patch.description;
  if (patch.successCriteria !== undefined) columnPatch.success_criteria = patch.successCriteria;
  if (patch.estimatedTokens !== undefined) columnPatch.estimated_tokens = patch.estimatedTokens;
  if (patch.actualTokens !== undefined) columnPatch.actual_tokens = patch.actualTokens;
  if (patch.status !== undefined) columnPatch.status = patch.status;
  if (patch.assignedTeamId !== undefined) columnPatch.assigned_team_id = patch.assignedTeamId;
  if (patch.deadline !== undefined) columnPatch.deadline = patch.deadline;
  if (patch.completedAt !== undefined) columnPatch.completed_at = patch.completedAt;
  const { data, error } = await db
    .from("milestones")
    .update(columnPatch)
    .eq("id", milestoneId)
    .select("*")
    .single();
  if (error || !data) return null;
  return fromDbRow(data);
}

/**
 * completeMilestone(milestoneId) — assumes the milestone succeeded (criteria met):
 * leftovers are allocated to the assigned team via allocateLeftoverTokens
 * (token-allocation.ts appends a `team_reward` tokenLedger entry and bumps
 * tokenBalance). A run over its estimate still completes here — the
 * MilestoneCard/TokenEfficiencyBar surface the over-budget warning; the
 * allocator leaves no reward when there is no leftover.
 */
export async function completeMilestone(milestoneId: string): Promise<Milestone | null> {
  const existing = await getMilestone(milestoneId);
  if (!existing) return null;
  await allocateLeftoverTokens(milestoneId);
  return updateMilestone(milestoneId, {
    status: "complete",
    completedAt: new Date().toISOString(),
  });
}