// Token allocation — leftover stacking + rewards between milestones.
// Pattern LAW: `const db = getSupabase(); if (!db) { ...mock... }` — both paths real.
// Tables per supabase-schema-v1.sql: `milestones`, `token_ledger`, `teams`.

import type { TokenLedgerEntry } from "@/types/compute-fund";
import { getSupabase } from "@/lib/supabase";

function newEntryId() {
  return `tl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function rewardEntry(milestoneId: string, leftover: number, teamName: string): TokenLedgerEntry {
  return {
    id: newEntryId(),
    milestoneId,
    kind: "team_reward",
    provider: "internal",
    model: "token-allocation",
    tokensIn: 0,
    tokensOut: leftover,
    costUsd: 0,
    receipt: {
      prompt: "leftover allocation",
      outputSummary: `${teamName} rewarded ${Math.round(leftover).toLocaleString("en-US")} leftover tokens`,
    },
    createdAt: new Date().toISOString(),
  };
}

/**
 * allocateLeftoverTokens(milestoneId) — if the milestone finished under its
 * estimate (leftover = estimatedTokens - actualTokens > 0), append a
 * `team_reward` tokenLedger entry and bump the assigned team's tokenBalance
 * by the leftover. Returns the allocated leftover, or 0/null when there is
 * nothing to reward or the milestone/team is missing.
 */
export async function allocateLeftoverTokens(
  milestoneId: string,
): Promise<number | null> {
  const db = getSupabase();
  if (!db) {
    const { mockDb } = await import("@/lib/mock-db");
    const m = Object.values(mockDb.milestones)
      .flat()
      .find((x) => x.id === milestoneId);
    if (!m) return null;
    const leftover = m.estimatedTokens - (m.actualTokens ?? 0);
    if (leftover <= 0 || !m.assignedTeamId) return 0;
    const team = mockDb.teams.find((t) => t.id === m.assignedTeamId);
    const teamName = team?.name ?? "unassigned team";
    mockDb.addTokenEntry(rewardEntry(m.id, leftover, teamName));
    if (team) team.tokenBalance += leftover;
    return leftover;
  }
  // Supabase path: read milestone, compute leftover, insert reward row, bump team balance.
  const { data: mRow, error: mErr } = await db
    .from("milestones")
    .select("id, estimated_tokens, actual_tokens, assigned_team_id")
    .eq("id", milestoneId)
    .maybeSingle();
  if (mErr || !mRow) return null;
  const estimated = Number(mRow.estimated_tokens ?? 0);
  const actual = mRow.actual_tokens == null ? 0 : Number(mRow.actual_tokens);
  const leftover = estimated - actual;
  const teamId = mRow.assigned_team_id ? String(mRow.assigned_team_id) : null;
  if (leftover <= 0 || !teamId) return 0;
  const { data: teamRow } = await db
    .from("teams")
    .select("name")
    .eq("id", teamId)
    .maybeSingle();
  const { error: insErr } = await db.from("token_ledger").insert({
    milestone_id: milestoneId,
    kind: "team_reward",
    provider: "internal",
    model: "token-allocation",
    tokens_in: 0,
    tokens_out: leftover,
    cost_usd: 0,
    receipt: {
      prompt: "leftover allocation",
      outputSummary: `${teamRow?.name ?? "unassigned team"} rewarded ${Math.round(leftover).toLocaleString("en-US")} leftover tokens`,
    },
  });
  if (insErr) return null;
  const { data: balRow, error: balErr } = await db
    .from("teams")
    .select("token_balance")
    .eq("id", teamId)
    .single();
  if (balErr || !balRow) return null;
  await db
    .from("teams")
    .update({ token_balance: Number(balRow.token_balance ?? 0) + leftover })
    .eq("id", teamId);
  return leftover;
}

/**
 * stackTokens(milestoneId, nextMilestoneId) — roll the assigned team's
 * available tokenBalance (rewarded leftovers) into the next milestone's
 * estimatedTokens, zeroing the balance. Returns the stacked amount, or 0/null.
 */
export async function stackTokens(
  milestoneId: string,
  nextMilestoneId: string,
): Promise<number | null> {
  const db = getSupabase();
  if (!db) {
    const { mockDb } = await import("@/lib/mock-db");
    const m = Object.values(mockDb.milestones)
      .flat()
      .find((x) => x.id === milestoneId);
    const next = Object.values(mockDb.milestones)
      .flat()
      .find((x) => x.id === nextMilestoneId);
    if (!m || !next || !m.assignedTeamId) return null;
    const team = mockDb.teams.find((t) => t.id === m.assignedTeamId);
    if (!team || team.tokenBalance <= 0) return 0;
    const amount = team.tokenBalance;
    team.tokenBalance = 0;
    next.estimatedTokens += amount;
    return amount;
  }
  // Supabase path.
  const { data: mRow } = await db
    .from("milestones")
    .select("assigned_team_id")
    .eq("id", milestoneId)
    .maybeSingle();
  const teamId = mRow?.assigned_team_id ? String(mRow.assigned_team_id) : null;
  if (!teamId) return null;
  const { data: teamRow, error: tErr } = await db
    .from("teams")
    .select("token_balance")
    .eq("id", teamId)
    .single();
  if (tErr || !teamRow) return null;
  const balance = Number(teamRow.token_balance ?? 0);
  if (balance <= 0) return 0;
  await db.from("teams").update({ token_balance: 0 }).eq("id", teamId);
  const { data: nextRow, error: nErr } = await db
    .from("milestones")
    .select("estimated_tokens")
    .eq("id", nextMilestoneId)
    .maybeSingle();
  if (nErr || !nextRow) return null;
  await db
    .from("milestones")
    .update({ estimated_tokens: Number(nextRow.estimated_tokens ?? 0) + balance })
    .eq("id", nextMilestoneId);
  return balance;
}

// transferTokens(...) / withdrawTokens(...) — future feature:
// cross-project transfers and cash-out of stacked tokens are planned for v2
// and intentionally not implemented here.
export const TOKEN_TRANSFER_WITHDRAW_FUTURE_FEATURE = true;