// Compute runner — real OpenAI calls when a key exists, synthetic mock runs otherwise.
// Pattern LAW: `const db = getSupabase(); if (!db) { ...mock... }` — both paths real.
// Tables per supabase-schema-v1.sql: `milestones`, `token_ledger`.

import type { TokenLedgerEntry } from "@/types/compute-fund";
import { getSupabase } from "@/lib/supabase";
import { getMilestone } from "@/lib/milestones";

export type ComputeReceipt = {
  milestoneId: string;
  entryId: string;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  /** true when the run pushed actualTokens past estimatedTokens — caller decides next steps */
  overBudget: boolean;
  outputSummary: string;
  createdAt: string;
};

/** v1 flat estimate, applied to every provider as-given (no provider-specific claims). */
const COST_PER_MTOKENS = { in: 2.5, out: 10 }; // $2.50 / M input, $10 / M output
export function estimateCostUsd(tokensIn: number, tokensOut: number): number {
  return (
    Math.round(((tokensIn / 1_000_000) * COST_PER_MTOKENS.in +
      (tokensOut / 1_000_000) * COST_PER_MTOKENS.out) * 100) / 100
  );
}

function newEntryId() {
  return `tl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildEntry(milestoneId: string, prompt: string, outputSummary: string,
  usage: Record<string, unknown>, provider: string, model: string,
  tokensIn: number, tokensOut: number, costUsd: number): TokenLedgerEntry {
  return {
    id: newEntryId(),
    milestoneId,
    kind: "run",
    provider,
    model,
    tokensIn,
    tokensOut,
    costUsd,
    receipt: { prompt, outputSummary, usage },
    createdAt: new Date().toISOString(),
  };
}

/** Mock run: tokensIn = 60–100% of the milestone's remaining estimate; tokensOut = 5–10% of tokensIn. */
export function mockUsage(prompt: string, estimatedTokens: number, actualTokens: number | null) {
  const remaining = Math.max(0, estimatedTokens - (actualTokens ?? 0));
  const useFrac = 0.6 + Math.random() * 0.4; // 60–100% of remaining
  const tokensIn = Math.round(remaining * useFrac);
  const outFrac = 0.05 + Math.random() * 0.05; // 5–10% of tokensIn
  const tokensOut = Math.round(tokensIn * outFrac);
  const outputSummary = `MOCK RUN (no provider key set) — request logged as given: "${prompt.length > 80 ? prompt.slice(0, 80) + "…" : prompt}" — synthetic draft produced, no external provider claim`;
  return { tokensIn, tokensOut, outputSummary };
}

export async function runCompute(
  milestoneId: string,
  prompt: string,
  provider: string,
  model: string,
): Promise<ComputeReceipt | null> {
  const milestone = await getMilestone(milestoneId);
  if (!milestone) return null;

  const db = getSupabase();
  let entry: TokenLedgerEntry;

  const useOpenAI = Boolean(process.env.OPENAI_API_KEY) && provider === "openai";
  if (useOpenAI) {
    // REAL call — no fabricated output anywhere on this path.
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      throw new Error(`openai run failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const tokensIn = json.usage?.prompt_tokens ?? 0;
    const tokensOut = json.usage?.completion_tokens ?? 0;
    const outputSummary = json.choices?.[0]?.message?.content ?? "(empty completion)";
    entry = buildEntry(
      milestoneId, prompt, outputSummary,
      { prompt_tokens: tokensIn, completion_tokens: tokensOut },
      provider, model, tokensIn, tokensOut, estimateCostUsd(tokensIn, tokensOut),
    );
  } else {
    // MOCK path — synthetic usage; provider/model passed through exactly as given.
    const { tokensIn, tokensOut, outputSummary } = mockUsage(
      prompt, milestone.estimatedTokens, milestone.actualTokens,
    );
    entry = buildEntry(
      milestoneId, prompt, outputSummary,
      { prompt_tokens: tokensIn, completion_tokens: tokensOut, synthetic: true },
      provider, model, tokensIn, tokensOut, estimateCostUsd(tokensIn, tokensOut),
    );
  }

  // Insert (mockDb bumps actualTokens itself for `run` entries; Supabase path does both).
  if (!db) {
    const { mockDb } = await import("@/lib/mock-db");
    mockDb.addTokenEntry(entry);
  } else {
    const { error } = await db.from("token_ledger").insert({
      milestone_id: entry.milestoneId,
      kind: entry.kind,
      provider: entry.provider,
      model: entry.model,
      tokens_in: entry.tokensIn,
      tokens_out: entry.tokensOut,
      cost_usd: entry.costUsd,
      receipt: entry.receipt,
    });
    if (error) throw new Error(`token_ledger insert failed: ${error.message}`);
    // recompute the denormalized spend on the row
    const fresh = await getMilestone(milestoneId);
    await db
      .from("milestones")
      .update({ actual_tokens: (fresh?.actualTokens ?? 0) })
      .eq("id", milestoneId);
  }

  const spent = (milestone.actualTokens ?? 0) + entry.tokensIn + entry.tokensOut;
  return {
    milestoneId: entry.milestoneId,
    entryId: entry.id,
    provider: entry.provider,
    model: entry.model,
    tokensIn: entry.tokensIn,
    tokensOut: entry.tokensOut,
    costUsd: entry.costUsd,
    overBudget: spent > milestone.estimatedTokens,
    outputSummary: entry.receipt.outputSummary,
    createdAt: entry.createdAt,
  };
}