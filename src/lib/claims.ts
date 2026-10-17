// Claim verification ladder (spec: landing-mirror-claim.md #12 + accounts-roles-profiles.md).
// Rung 1  GitHub OAuth  — repo API says the claimant token has push/admin on origin repo.
// Rung 2  repo-file     — COMPUTE-FUND.toml on the repo's default branch carries the claim code.
// Rung 3  DNS TXT       — TXT record at the token subdomain carries the claim code (Cloudflare DoH).
// Rung 4  manual review — claim_requests row in pending state, human decides.
//
// Laws honored here: lazy Supabase clients (no import-time network), mock fallback when
// Supabase is unconfigured, all external fetches run server-side with hard timeouts,
// provider tokens are used for a request and never logged, and every DDL need is avoided
// (the claim code is a deterministic hash of the project id, so rung 2 verifies without a schema change).

import { createHash } from "node:crypto";
import { getSupabase, getSupabaseAdmin } from "@/lib/supabase";
import { mockDb } from "@/lib/mock-db";

export const CLAIM_CODE_FILE = "COMPUTE-FUND.toml";
export const GITHUB_API = "https://api.github.com";
export const DOH_ENDPOINT = "https://cloudflare-dns.com/dns-query";

/** DNS zone for the claim-code TXT record. Overridable per deployment. */
const CLAIM_DNS_ZONE = process.env.COMPUTE_FUND_CLAIM_DNS_ZONE ?? "verify.computefund.dev";
const FETCH_TIMEOUT_MS = 30_000;

export type ClaimMethod = "github" | "repo-file" | "dns-txt" | "manual";

export type ClaimVerifyInput = {
  projectId: string;
  /** GitHub OAuth access token from the signed-in claimant (never stored, never logged). */
  providerToken?: string;
  /** Claimant's GitHub login (stored as claim evidence only). */
  githubLogin?: string;
};

export type ClaimVerifyResult = {
  verified: boolean;
  method: ClaimMethod;
  /** Public, token-free proof trail (safe to persist in claim_requests.evidence). */
  evidence: Record<string, unknown>;
  claimCode: string;
  /** Whether the project row + claim receipt were persisted (false in mock mode). */
  persisted: boolean;
  error?: string;
};

/** Deterministic claim code, e.g. 'cf-9b1d4e2a' — same project id always yields the same code. */
export function generateClaimCode(projectId: string): string {
  return "cf-" + createHash("sha256").update(`compute-fund:${projectId}`).digest("hex").slice(0, 8);
}

/** Subdomain the maintainer must point a TXT record at, e.g. 'cf-9b1d4e2a.verify.computefund.dev'. */
export function claimCodeSubdomain(projectId: string): string {
  return `${generateClaimCode(projectId)}.${CLAIM_DNS_ZONE}`;
}

function fetchOpts(token?: string): RequestInit {
  return {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
}

type ResolvedProject = {
  id: string;
  originRepo: string | null;
  claimStatus: string | null;
  isMock: boolean;
};

/** One read path for the mirrored project row; mock projects never carry an origin repo. */
async function resolveProject(projectId: string): Promise<ResolvedProject | null> {
  const db = getSupabaseAdmin() ?? getSupabase();
  if (db) {
    const { data, error } = await db
      .from("projects")
      .select("id, origin_repo, claim_status")
      .eq("id", projectId)
      .limit(1);
    const row = error ? null : (data?.[0] ?? null);
    if (row) {
      return {
        id: row.id,
        originRepo: (row.origin_repo as string | null) ?? null,
        claimStatus: (row.claim_status as string | null) ?? null,
        isMock: false,
      };
    }
  }
  const mock = mockDb.projects.find((p) => p.id === projectId);
  if (!mock) return null;
  return { id: mock.id, originRepo: null, claimStatus: "unclaimed", isMock: true };
}

async function persistClaim(
  project: ResolvedProject,
  method: ClaimMethod,
  verified: boolean,
  claimCode: string,
  evidence: Record<string, unknown>,
  githubLogin?: string,
): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) return false;
  const now = new Date().toISOString();
  const { error: requestError } = await admin.from("claim_requests").insert({
    project_id: project.id,
    claimant_id: null,
    method,
    status: verified ? "approved" : "pending",
    evidence: { ...evidence, claim_code: claimCode, github_login: githubLogin ?? null },
    created_at: now,
  });
  if (requestError) return false;
  if (!verified) return true;
  const { error: patchError } = await admin
    .from("projects")
    .update({ claim_status: "claimed", claimed_at: now })
    .eq("id", project.id);
  if (patchError) return false;
  return true;
}

// ── Rung 1: GitHub repo API — token must be owner or hold push on the origin repo ──
async function rungGithub(
  originRepo: string,
  providerToken?: string,
): Promise<{ verified: boolean; evidence: Record<string, unknown> }> {
  if (!providerToken) return { verified: false, evidence: { reason: "no provider token" } };
  try {
    const res = await fetch(`${GITHUB_API}/repos/${originRepo}`, fetchOpts(providerToken));
    if (!res.ok) return { verified: false, evidence: { githubStatus: res.status } };
    const repo = (await res.json()) as {
      permissions?: { push?: boolean; admin?: boolean };
    };
    const perms = repo.permissions ?? {};
    if (perms.push || perms.admin) {
      return {
        verified: true,
        evidence: { origin_repo: originRepo, permission: perms.admin ? "admin" : "push" },
      };
    }
    return { verified: false, evidence: { origin_repo: originRepo, permission: "none" } };
  } catch {
    return { verified: false, evidence: { reason: "github api unreachable" } };
  }
}

// ── Rung 2: COMPUTE-FUND.toml on the default branch carries the deterministic claim code ──
async function rungRepoFile(
  originRepo: string,
  claimCode: string,
): Promise<{ verified: boolean; evidence: Record<string, unknown> }> {
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/${originRepo}/HEAD/${CLAIM_CODE_FILE}`,
      fetchOpts(),
    );
    if (!res.ok) return { verified: false, evidence: { reason: `claim file http ${res.status}` } };
    const body = await res.text();
    const found = body.includes(claimCode);
    return { verified: found, evidence: { origin_repo: originRepo, claim_file: CLAIM_CODE_FILE, code_match: found } };
  } catch {
    return { verified: false, evidence: { reason: "raw fetch unreachable" } };
  }
}

// ── Rung 3: DNS TXT at the claim-code subdomain (any DNS host, resolved via Cloudflare DoH) ──
async function rungDnsTxt(
  projectId: string,
  claimCode: string,
): Promise<{ verified: boolean; evidence: Record<string, unknown> }> {
  const name = claimCodeSubdomain(projectId);
  try {
    const res = await fetch(`${DOH_ENDPOINT}?name=${encodeURIComponent(name)}&type=TXT`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
      headers: { Accept: "application/dns-json" },
    });
    if (!res.ok) return { verified: false, evidence: { reason: `doh http ${res.status}`, name } };
    const json = (await res.json()) as { Answer?: { data?: string }[] };
    const txt = (json.Answer ?? [])
      .map((a) => (a.data ?? "").replace(/^"|"$/g, "").replace(/"\s*"/g, ""))
      .join("");
    const found = txt.includes(claimCode);
    return { verified: found, evidence: { name, code_match: found } };
  } catch {
    return { verified: false, evidence: { reason: "doh unreachable", name } };
  }
}

/**
 * Verification ladder (async). Try rungs in automation order; first hit wins.
 * Rung 4 fires only when nothing else verified — it files a pending review request.
 */
export async function verifyClaim({
  projectId,
  providerToken,
  githubLogin,
}: ClaimVerifyInput): Promise<ClaimVerifyResult> {
  const claimCode = generateClaimCode(projectId);
  const project = await resolveProject(projectId);
  if (!project) {
    return {
      verified: false,
      method: "manual",
      evidence: { reason: "project not found" },
      claimCode,
      persisted: false,
      error: "project not found",
    };
  }

  let result: { verified: boolean; method: ClaimMethod; evidence: Record<string, unknown> } = {
    verified: false,
    method: "manual",
    evidence: {},
  };

  if (project.originRepo && providerToken) {
    const r = await rungGithub(project.originRepo, providerToken);
    if (r.verified) {
      result = { verified: true, method: "github", evidence: r.evidence };
    }
  }

  if (!result.verified && project.originRepo) {
    const r = await rungRepoFile(project.originRepo, claimCode);
    if (r.verified) {
      result = { verified: true, method: "repo-file", evidence: r.evidence };
    }
  }

  if (!result.verified) {
    const r = await rungDnsTxt(projectId, claimCode);
    if (r.verified) {
      result = { verified: true, method: "dns-txt", evidence: r.evidence };
    }
  }

  // Rung 4: manual review — always the landing rung when automation failed.
  if (!result.verified) {
    result = {
      verified: false,
      method: "manual",
      evidence: {
        github_login: githubLogin ?? null,
        origin_repo: project.originRepo,
        github_rung_attempted: Boolean(providerToken && project.originRepo),
      },
    };
  }

  const persisted = await persistClaim(
    project,
    result.method,
    result.verified,
    claimCode,
    result.evidence,
    githubLogin,
  );

  return {
    verified: result.verified,
    method: result.method,
    evidence: result.evidence,
    claimCode,
    persisted,
  };
}