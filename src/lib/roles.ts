// Project roles — owner / manager / contributor / viewer.
// Spec: docs/SPECS/accounts-roles-profiles.md
// The OWNER role is NOT shareable and its row is IMMUTABLE (only the owner may
// remove their own row by leaving). Co-ownership happens only at the business
// level: business owns the project, partners own the business. Managers sweep
// tokens, edit the showcase and manage roles below owner.
// Law: lazy getSupabase() only; every call site falls back to an in-memory mock
// so local dev runs with zero credentials.

import { getSupabase } from "@/lib/supabase";

export const PROJECT_ROLES = ["owner", "manager", "contributor", "viewer"] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

/** The OWNER role is NOT shareable and its row is immutable — one accountable claimant per project. */
export const OWNER_ROLE: ProjectRole = "owner";
export type RoleResult<T> = { ok: true; value: T } | { ok: false; error: string };

export type ProjectMember = {
  projectId: string;
  memberProfileId: string;
  role: ProjectRole;
  addedAt: string;
  addedBy: string | null;
  displayName: string | null;
};

// ── In-memory fallback (credential-free dev) ────────────────────────────────
const nowIso = () => new Date().toISOString();

export const mockProjectMembers: ProjectMember[] = [
  {
    projectId: "proj-nimbus-site",
    memberProfileId: "usr-nova",
    role: "owner",
    addedAt: "2026-09-12T10:00:00Z",
    addedBy: "usr-nova",
    displayName: "Nova Reyes",
  },
  {
    projectId: "proj-nimbus-site",
    memberProfileId: "usr-kai",
    role: "manager",
    addedAt: "2026-09-14T10:00:00Z",
    addedBy: "usr-nova",
    displayName: "Kai Duarte",
  },
  {
    projectId: "proj-nimbus-site",
    memberProfileId: "usr-sam",
    role: "contributor",
    addedAt: "2026-09-15T10:00:00Z",
    addedBy: "usr-kai",
    displayName: "Sam Okafor",
  },
];

const mockProjectOwners = new Map<string, string>([
  ["proj-nimbus-site", "usr-nova"],
]);

const MEMBER_COLUMNS = "project_id, member_profile_id, role, added_at, added_by";

function isOwnerRole(role: string): role is "owner" {
  return role === OWNER_ROLE;
}

// ── API ──────────────────────────────────────────────────────────────────────

/**
 * Set a member's role on a project. OWNER-only action; the owner role itself is
 * never shareable, and the owner row is immutable (only the owner may remove
 * their own row via removeMember on themselves).
 */
export async function setRole(
  projectId: string,
  actingOwnerId: string,
  targetMemberId: string,
  role: ProjectRole,
): Promise<RoleResult<ProjectMember>> {
  if (!projectId || !actingOwnerId || !targetMemberId) {
    return { ok: false, error: "projectId, actingOwnerId and targetMemberId are required" };
  }
  if (!PROJECT_ROLES.includes(role)) {
    return { ok: false, error: `role must be one of ${PROJECT_ROLES.join(", ")}` };
  }
  if (role === OWNER_ROLE) {
    return { ok: false, error: "the owner role is not shareable" };
  }
  const db = getSupabase();
  if (db) {
    const { data: project, error: projectError } = await db
      .from("projects")
      .select("creator_id")
      .eq("id", projectId)
      .maybeSingle();
    if (projectError || !project) {
      return { ok: false, error: projectError?.message ?? "project not found" };
    }
    const { data: mine } = await db
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("member_profile_id", actingOwnerId)
      .maybeSingle();
    const actingIsOwner = project.creator_id === actingOwnerId || isOwnerRole(mine?.role ?? "");
    if (!actingIsOwner) return { ok: false, error: "only the project owner may set roles" };
    const { data: target } = await db
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("member_profile_id", targetMemberId)
      .maybeSingle();
    if (isOwnerRole(target?.role ?? "") && targetMemberId !== actingOwnerId) {
      return { ok: false, error: "the owner row is immutable" };
    }
    const { data, error } = await db
      .from("project_members")
      .upsert(
        {
          project_id: projectId,
          member_profile_id: targetMemberId,
          role,
          added_by: actingOwnerId,
        },
        { onConflict: "project_id,member_profile_id" },
      )
      .select(MEMBER_COLUMNS)
      .single();
    if (error) return { ok: false, error: error.message };
    return {
      ok: true,
      value: {
        projectId: data.project_id,
        memberProfileId: data.member_profile_id,
        role: data.role as ProjectRole,
        addedAt: data.added_at,
        addedBy: data.added_by,
        displayName: null,
      },
    };
  }
  const actingIsOwner =
    mockProjectOwners.get(projectId) === actingOwnerId ||
    mockProjectMembers.some(
      (m) =>
        m.projectId === projectId &&
        m.memberProfileId === actingOwnerId &&
        m.role === OWNER_ROLE,
    );
  if (!actingIsOwner) return { ok: false, error: "only the project owner may set roles" };
  const target = mockProjectMembers.find(
    (m) => m.projectId === projectId && m.memberProfileId === targetMemberId,
  );
  if (target?.role === OWNER_ROLE) return { ok: false, error: "the owner row is immutable" };
  const addedAt = target?.addedAt ?? nowIso();
  const member: ProjectMember = {
    projectId,
    memberProfileId: targetMemberId,
    role,
    addedAt,
    addedBy: actingOwnerId,
    displayName: target?.displayName ?? null,
  };
  if (target) Object.assign(target, member);
  else mockProjectMembers.push(member);
  return { ok: true, value: { ...member } };
}

/** List every membership row on a project (owner first, then by added time). */
export async function listProjectRoles(projectId: string): Promise<ProjectMember[]> {
  const db = getSupabase();
  if (db) {
    const { data: rows, error } = await db
      .from("project_members")
      .select(MEMBER_COLUMNS)
      .eq("project_id", projectId)
      .order("added_at", { ascending: true });
    if (error || !rows) {
      return mockProjectMembers.filter((m) => m.projectId === projectId);
    }
    const ids = rows.map((r) => r.member_profile_id);
    const names = new Map<string, string | null>();
    if (ids.length > 0) {
      const { data: profiles } = await db
        .from("profiles")
        .select("id, display_name")
        .in("id", ids);
      for (const p of profiles ?? []) names.set(p.id, p.display_name);
    }
    return rows.map((r) => ({
      projectId: r.project_id,
      memberProfileId: r.member_profile_id,
      role: r.role as ProjectRole,
      addedAt: r.added_at,
      addedBy: r.added_by,
      displayName: names.get(r.member_profile_id) ?? null,
    }));
  }
  return mockProjectMembers.filter((m) => m.projectId === projectId);
}

/** The signed-in user's effective role on a project. Null when not a member. */
export async function myRoleOnProject(
  projectId: string,
  userId: string,
): Promise<ProjectRole | null> {
  if (!projectId || !userId) return null;
  const db = getSupabase();
  if (db) {
    const { data: project } = await db
      .from("projects")
      .select("creator_id")
      .eq("id", projectId)
      .maybeSingle();
    if (project?.creator_id === userId) return OWNER_ROLE;
    const { data: mine } = await db
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("member_profile_id", userId)
      .maybeSingle();
    if (mine?.role && PROJECT_ROLES.includes(mine.role as ProjectRole)) {
      return mine.role as ProjectRole;
    }
    return null;
  }
  if (mockProjectOwners.get(projectId) === userId) return OWNER_ROLE;
  const membership = mockProjectMembers.find(
    (m) => m.projectId === projectId && m.memberProfileId === userId,
  );
  return membership?.role ?? null;
}

/**
 * Remove a member from a project. OWNER-only. The owner row is immutable:
 * removeMember cannot target the owner's row except when the owner removes
 * their own row (leaving), and the owner role is never passed to anyone else —
 * co-ownership lives at the business level.
 */
export async function removeMember(
  projectId: string,
  actingOwnerId: string,
  targetMemberId: string,
): Promise<RoleResult<null>> {
  if (!projectId || !actingOwnerId || !targetMemberId) {
    return { ok: false, error: "projectId, actingOwnerId and targetMemberId are required" };
  }
  const db = getSupabase();
  if (db) {
    const { data: project, error: projectError } = await db
      .from("projects")
      .select("creator_id")
      .eq("id", projectId)
      .maybeSingle();
    if (projectError || !project) {
      return { ok: false, error: projectError?.message ?? "project not found" };
    }
    const { data: mine } = await db
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("member_profile_id", actingOwnerId)
      .maybeSingle();
    const actingIsOwner = project.creator_id === actingOwnerId || isOwnerRole(mine?.role ?? "");
    if (!actingIsOwner) return { ok: false, error: "only the project owner may remove members" };
    const { data: target } = await db
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("member_profile_id", targetMemberId)
      .maybeSingle();
    if (isOwnerRole(target?.role ?? "") && targetMemberId !== actingOwnerId) {
      return { ok: false, error: "the owner row is immutable; only the owner may leave" };
    }
    const { error } = await db
      .from("project_members")
      .delete()
      .eq("project_id", projectId)
      .eq("member_profile_id", targetMemberId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, value: null };
  }
  const actingIsOwner =
    mockProjectOwners.get(projectId) === actingOwnerId ||
    mockProjectMembers.some(
      (m) =>
        m.projectId === projectId &&
        m.memberProfileId === actingOwnerId &&
        m.role === OWNER_ROLE,
    );
  if (!actingIsOwner) return { ok: false, error: "only the project owner may remove members" };
  const index = mockProjectMembers.findIndex(
    (m) => m.projectId === projectId && m.memberProfileId === targetMemberId,
  );
  if (index === -1) return { ok: false, error: "membership not found" };
  const target = mockProjectMembers[index];
  if (target.role === OWNER_ROLE && targetMemberId !== actingOwnerId) {
    return { ok: false, error: "the owner row is immutable; only the owner may leave" };
  }
  mockProjectMembers.splice(index, 1);
  return { ok: true, value: null };
}