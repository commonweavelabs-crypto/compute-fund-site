// Stewardship sweeps (spec: landing-mirror-claim.md #11).
// Managers sweep incoming tokens via "Claim available tokens" — no forced cadence.
// Per-entry sweep-age clock: ≤30d quiet; 30d+ amber notice; 90d+ unswept → fork redirect pool.
// The last-sweep timestamp is public (stewardship pulse as a receipt).
//
// Column mapping law: the v2 migration adds `swept_at` to `public.ledger_entries`
// (project-scoped) and `public.compute_runs`. The milestone-scoped v1 token ledger
// (`public.token_ledger`) does not have the column — when the v2 table/column is absent
// we map the sweep onto token_ledger via the project's milestones, and surface an
// explicit error if neither target exists.

import { getSupabase, getSupabaseAdmin } from "@/lib/supabase";
import { mockDb } from "@/lib/mock-db";

export type SweepResult = {
  sweptCount: number;
  /** ISO timestamp of the entry just swept, or null when there was nothing pending. */
  lastSweepAt: string | null;
  error?: string;
};

export type StewardshipPulse = {
  projectId: string;
  lastSweepAt: string | null;
  sweptCount: number;
  pendingCount: number;
};

// Mock mode: in-memory sweep receipts keyed by project id (session-scoped, like mockDb).
const mockSweepState = new Map<string, { lastSweepAt: string; sweptCount: number; pending: number }>();

function mockPendings(projectId: string): number {
  const milestones = mockDb.milestones[projectId] ?? [];
  return milestones.reduce((sum, m) => sum + m.tokenLedger.length, 0);
}

async function sweepLedgerEntries(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, projectId: string): Promise<SweepResult | null> {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("ledger_entries")
    .update({ swept_at: now })
    .eq("project_id", projectId)
    .is("swept_at", null)
    .select("id");
  if (error) return null;
  return { sweptCount: data?.length ?? 0, lastSweepAt: (data?.length ?? 0) > 0 ? now : null };
}

async function sweepTokenLedger(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, projectId: string): Promise<SweepResult> {
  const now = new Date().toISOString();
  const { data: milestones, error: msError } = await admin
    .from("milestones")
    .select("id")
    .eq("project_id", projectId);
  if (msError) return { sweptCount: 0, lastSweepAt: null, error: msError.message };
  const ids = (milestones ?? []).map((m) => m.id);
  if (ids.length === 0) return { sweptCount: 0, lastSweepAt: null };
  const { data, error } = await admin
    .from("token_ledger")
    .update({ swept_at: now })
    .in("milestone_id", ids)
    .is("swept_at", null)
    .select("id");
  if (error) return { sweptCount: 0, lastSweepAt: null, error: error.message };
  return { sweptCount: data?.length ?? 0, lastSweepAt: (data?.length ?? 0) > 0 ? now : null };
}

/** Mark every unswept ledger entry of a project as swept now. */
export async function sweepTokens(projectId: string): Promise<SweepResult> {
  const mock = mockSweepState.get(projectId);
  const admin = getSupabaseAdmin();
  if (!admin) {
    // Mock fallback: sweep the in-memory token ledger for this project's milestones.
    const now = new Date().toISOString();
    const state = { lastSweepAt: now, sweptCount: (mock?.sweptCount ?? 0) + mockPendings(projectId), pending: 0 };
    mockSweepState.set(projectId, state);
    return { sweptCount: state.sweptCount, lastSweepAt: now };
  }
  const viaEntries = await sweepLedgerEntries(admin, projectId);
  if (viaEntries) return viaEntries;
  return sweepTokenLedger(admin, projectId);
}

/** Public stewardship pulse: when were tokens last claimed by the project's stewards? */
export async function stewardshipPulse(projectId: string): Promise<StewardshipPulse> {
  const db = getSupabase() ?? getSupabaseAdmin();
  if (!db) {
    const mock = mockSweepState.get(projectId);
    return {
      projectId,
      lastSweepAt: mock?.lastSweepAt ?? null,
      sweptCount: mock?.sweptCount ?? 0,
      pendingCount: mockPendings(projectId),
    };
  }
  // v2 path: project-scoped ledger_entries.swept_at (v2 schema names).
  const { data: last, error: lastError } = await db
    .from("ledger_entries")
    .select("swept_at")
    .eq("project_id", projectId)
    .not("swept_at", "is", null)
    .order("swept_at", { ascending: false })
    .limit(1);
  if (!lastError && last && last.length > 0) {
    const [{ count: swept }, { count: pending }] = await Promise.all([
      db
        .from("ledger_entries")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .not("swept_at", "is", null),
      db
        .from("ledger_entries")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .is("swept_at", null),
    ]);
    return {
      projectId,
      lastSweepAt: (last[0].swept_at as string) ?? null,
      sweptCount: swept ?? 0,
      pendingCount: pending ?? 0,
    };
  }
  // Fallback: milestone-scoped v1 token ledger (needs the idempotent swept_at column).
  const { data: milestones, error: msError } = await db
    .from("milestones")
    .select("id")
    .eq("project_id", projectId);
  if (msError) {
    return { projectId, lastSweepAt: null, sweptCount: 0, pendingCount: 0 };
  }
  const ids = (milestones ?? []).map((m) => m.id);
  if (ids.length === 0) return { projectId, lastSweepAt: null, sweptCount: 0, pendingCount: 0 };
  const [{ data: lastEntry, count: swept, error: lastErr }, { count: pending }] = await Promise.all([
    db
      .from("token_ledger")
      .select("swept_at")
      .in("milestone_id", ids)
      .not("swept_at", "is", null)
      .order("swept_at", { ascending: false })
      .limit(1),
    db
      .from("token_ledger")
      .select("id", { count: "exact", head: true })
      .in("milestone_id", ids)
      .is("swept_at", null),
  ]);
  return {
    projectId,
    lastSweepAt: lastErr ? null : ((lastEntry?.[0]?.swept_at as string | null) ?? null),
    sweptCount: lastErr ? 0 : swept ?? 0,
    pendingCount: pending ?? 0,
  };
}