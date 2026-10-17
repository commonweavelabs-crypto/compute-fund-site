// Community votes — Supabase when configured, mockDb when not (plan Task 10).
// Dedupe law: one vote per voter per milestone.

import { getSupabase } from "@/lib/supabase";
import { mockDb } from "@/lib/mock-db";
import type { Vote } from "@/types/compute-fund";

export type VotePayload = { milestoneId?: string; projectId?: string };

export type VoteResult = { ok: boolean; error?: string; votes: number };

/** Cast one weighted vote for a milestone (preferred) or a bare project. */
export async function castVote(
  voterId: string,
  payload: VotePayload,
  weight = 1,
): Promise<VoteResult> {
  if (!voterId) return { ok: false, error: "voter required", votes: 0 };
  if (!payload.milestoneId && !payload.projectId) {
    return { ok: false, error: "milestoneId or projectId required", votes: 0 };
  }
  const db = getSupabase();
  if (!db) return mockCastVote(voterId, payload, weight);

  const { data: existing, error: dupError } = await db
    .from("community_votes")
    .select("id")
    .eq("voter_id", voterId)
    .eq(payload.milestoneId ? "milestone_id" : "project_id", payload.milestoneId ?? payload.projectId)
    .limit(1);
  if (!dupError && existing && existing.length > 0) {
    return { ok: false, error: "already voted", votes: 0 };
  }
  const row = {
    voter_id: voterId,
    milestone_id: payload.milestoneId ?? null,
    project_id: payload.projectId ?? null,
    vote_weight: weight,
  };
  const { error } = await db.from("community_votes").insert(row);
  if (error) return { ok: false, error: error.message, votes: 0 };
  const votes = await afterVoteCount(payload);
  return { ok: true, votes };
}

function mockCastVote(voterId: string, payload: VotePayload, weight: number): VoteResult {
  const duplicate = mockDb.votes.some(
    (v: Vote) => v.voterId === voterId && !!payload.milestoneId && v.milestoneId === payload.milestoneId,
  );
  if (duplicate) return { ok: false, error: "already voted", votes: 0 };
  mockDb.addVote({
    id: `vote-${voterId}-${payload.milestoneId ?? payload.projectId}`,
    voterId,
    milestoneId: payload.milestoneId ?? null,
    projectId: payload.projectId ?? null,
    voteWeight: weight,
    createdAt: new Date().toISOString(),
  });
  return { ok: true, votes: afterMockVoteCount(payload) };
}

async function afterVoteCount(payload: VotePayload): Promise<number> {
  if (payload.milestoneId) return getMilestoneVotes(payload.milestoneId);
  return getProjectVotes(payload.projectId as string);
}

function afterMockVoteCount(payload: VotePayload): number {
  return payload.milestoneId
    ? getMockMilestoneVotes(payload.milestoneId)
    : getMockProjectVotes(payload.projectId as string);
}

export async function getMilestoneVotes(milestoneId: string): Promise<number> {
  const db = getSupabase();
  if (!db) return getMockMilestoneVotes(milestoneId);
  const mockCount = getMockMilestoneVotes(milestoneId);
  const { data, error } = await db
    .from("community_votes")
    .select("vote_weight")
    .eq("milestone_id", milestoneId);
  if (error) return mockCount;
  return (data ?? []).reduce((sum, r) => sum + (r.vote_weight ?? 1), 0);
}

export async function getProjectVotes(projectId: string): Promise<number> {
  const db = getSupabase();
  if (!db) return getMockProjectVotes(projectId);
  const { data, error } = await db
    .from("community_votes")
    .select("vote_weight, milestone_id")
    .eq("project_id", projectId);
  let total = (data ?? []).reduce((sum, r) => sum + (r.vote_weight ?? 1), 0);
  if (data && data.some((r) => r.milestone_id)) {
    // milestone-level votes belong to the project too (denormalized join)
    const { data: ms } = await db
      .from("milestones")
      .select("id")
      .eq("project_id", projectId)
      .in("id", data.map((r) => r.milestone_id).filter(Boolean) as string[]);
    if (ms && ms.length > 0) {
      const { data: mv } = await db
        .from("community_votes")
        .select("vote_weight")
        .in("milestone_id", ms.map((m) => m.id));
      total = (mv ?? []).reduce((sum, r) => sum + (r.vote_weight ?? 1), 0);
    }
  }
  return total;
}

export type TopVotedProject = { projectId: string; title: string; votes: number };

/** Trending: highest vote totals across the last `days` days. */
export async function getTopVotedProjects(days = 7): Promise<TopVotedProject[]> {
  const db = getSupabase();
  if (!db) return getMockTopVotedProjects();

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data: voteRows, error: voteErr } = await db
    .from("community_votes")
    .select("project_id, milestone_id, vote_weight")
    .gte("created_at", since);
  if (voteErr) return getMockTopVotedProjects();

  const milestoneIds = (voteRows ?? []).map((r) => r.milestone_id).filter(Boolean) as string[];
  const milestoneToProject = new Map<string, string>();
  if (milestoneIds.length > 0) {
    const { data: ms } = await db
      .from("milestones")
      .select("id, project_id")
      .in("id", milestoneIds);
    for (const m of ms ?? []) milestoneToProject.set(m.id, m.project_id);
  }

  const totals = new Map<string, number>();
  for (const row of voteRows ?? []) {
    const projectId = row.project_id ?? (row.milestone_id ? milestoneToProject.get(row.milestone_id) : undefined);
    if (!projectId) continue;
    totals.set(projectId, (totals.get(projectId) ?? 0) + (row.vote_weight ?? 1));
  }
  return [...totals.entries()]
    .map(([projectId, votes]) => ({ projectId, title: titleFor(projectId), votes }))
    .sort((a, b) => b.votes - a.votes);
}

function titleFor(projectId: string): string {
  return mockDb.projects.find((p) => p.id === projectId)?.title ?? projectId;
}

function getMockMilestoneVotes(milestoneId: string): number {
  for (const list of Object.values(mockDb.milestones)) {
    const m = list.find((x) => x.id === milestoneId);
    if (m) return m.votes;
  }
  return 0;
}

function getMockProjectVotes(projectId: string): number {
  return (mockDb.milestones[projectId] ?? []).reduce((sum, m) => sum + m.votes, 0);
}

function getMockTopVotedProjects(): TopVotedProject[] {
  return Object.entries(mockDb.milestones)
    .map(([projectId, list]) => ({
      projectId,
      title: mockDb.projects.find((p) => p.id === projectId)?.title ?? projectId,
      votes: list.reduce((sum, m) => sum + m.votes, 0),
    }))
    .sort((a, b) => b.votes - a.votes);
}