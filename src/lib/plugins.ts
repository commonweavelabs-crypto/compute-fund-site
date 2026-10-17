// Plugin revenue splits — who takes a percentage of project run funding (plan Task 12).
// Remainder law: what plugins don't claim goes to the project team.

import { getSupabase } from "@/lib/supabase";
import { mockDb } from "@/lib/mock-db";
import type { PluginSplit } from "@/types/compute-fund";

export async function getPluginSplits(projectId: string): Promise<PluginSplit[]> {
  const db = getSupabase();
  if (!db) return mockDb.pluginSplits.filter((s) => s.projectId === projectId);
  const { data, error } = await db
    .from("plugin_splits")
    .select("id, project_id, plugin_name, plugin_owner, split_percentage, is_required")
    .eq("project_id", projectId);
  if (error || !data) return mockDb.pluginSplits.filter((s) => s.projectId === projectId);
  return data.map((r) => ({
    id: r.id,
    projectId: r.project_id,
    pluginName: r.plugin_name,
    pluginOwner: r.plugin_owner ?? null,
    splitPercentage: r.split_percentage,
    isRequired: r.is_required,
  }));
}

export type SplitLine = {
  pluginName: string;
  pluginOwner: string | null;
  splitPercentage: number;
  isRequired: boolean;
};

export type SplitAllocation = SplitLine & { usd: number };
export type RunSplit = {
  projectUsd: number;
  pluginTotal: number;
  teamUsd: number;
  plugins: SplitAllocation[];
};

/** Dollars: each plugin takes its % of `projectFundingUsd`; leftovers go to the project team. */
export function computeRunSplit(projectFundingUsd: number, splits: SplitLine[]): RunSplit {
  const plugins = splits.map((s) => ({
    ...s,
    usd: Math.round((projectFundingUsd * s.splitPercentage) / 100 * 100) / 100,
  }));
  const pluginTotal = Math.round(plugins.reduce((sum, p) => sum + p.usd, 0) * 100) / 100;
  return {
    projectUsd: projectFundingUsd,
    pluginTotal,
    teamUsd: Math.round((projectFundingUsd - pluginTotal) * 100) / 100,
    plugins,
  };
}

export type SplitsValidation = {
  valid: boolean;
  total: number;
  remainderToTeam: number;
  errors: string[];
};

/** Sum must stay <= 100; whatever isn't claimed remains the project team's. */
export function validateSplits(splits: SplitLine[]): SplitsValidation {
  const errors: string[] = [];
  for (const s of splits) {
    if (!s.pluginName.trim()) errors.push("plugin name required");
    if (!Number.isFinite(s.splitPercentage) || s.splitPercentage < 0 || s.splitPercentage > 100) {
      errors.push(`${s.pluginName || "split"}: percentage must be 0-100`);
    }
  }
  const total = Math.round(splits.reduce((sum, s) => sum + s.splitPercentage, 0) * 100) / 100;
  if (total > 100) errors.push(`total ${total}% exceeds 100%`);
  return { valid: errors.length === 0, total, remainderToTeam: Math.round((100 - total) * 100) / 100, errors };
}

/** Default suggestion: every required dependency gets 10% of funding. */
export function suggestRequiredSplits(requiredDeps: string[]): SplitLine[] {
  return requiredDeps.map((name) => ({
    pluginName: name,
    pluginOwner: null,
    splitPercentage: 10,
    isRequired: true,
  }));
}

/** Replace-all save (plan Task 13 Step 1): mock path rewrites the in-memory list. */
export async function savePluginSplits(projectId: string, splits: SplitLine[]): Promise<boolean> {
  const db = getSupabase();
  const kept = mockDb.pluginSplits.filter((s) => s.projectId !== projectId);
  if (!db) {
    for (const s of splits) {
      kept.push({ id: `ps-${crypto.randomUUID()}`, projectId, ...s });
    }
    mockDb.pluginSplits.length = 0;
    mockDb.pluginSplits.push(...kept);
    return true;
  }
  await db.from("plugin_splits").delete().eq("project_id", projectId);
  const { error } = await db.from("plugin_splits").insert(
    splits.map((s) => ({
      project_id: projectId,
      plugin_name: s.pluginName,
      plugin_owner: s.pluginOwner,
      split_percentage: s.splitPercentage,
      is_required: s.isRequired,
    })),
  );
  return !error;
}