// Accounts — personal floor + business/entity accounts.
// Spec: docs/SPECS/accounts-roles-profiles.md
// A business account is a profiles row with profile_type = 'business' (one
// table, cleaner RLS). Membership is STEWARDSHIP, not equity — exit loses the
// seat, there is no buyout, and forks are the escape hatch when partners split.
// Law: lazy getSupabase() only; every call site falls back to an in-memory mock
// so local dev runs with zero credentials.

import { getSupabase } from "@/lib/supabase";

export type ProfileType = "personal" | "business";
export type ProfileVisibility = "public" | "private";
export type BusinessRole = "owner" | "partner";

export type Account = {
  id: string;
  displayName: string;
  profileType: ProfileType;
  bio: string | null;
  links: Record<string, string> | null;
  avatarUrl: string | null;
  visibility: ProfileVisibility;
  createdAt: string;
};

export type AccountMember = {
  accountId: string;
  userId: string;
  role: BusinessRole;
  addedAt: string;
  addedBy: string | null;
  displayName: string | null;
};

export type AccountResult<T> = { ok: true; value: T } | { ok: false; error: string };

// ── In-memory fallback (credential-free dev) ────────────────────────────────
const nowIso = () => new Date().toISOString();

export const mockAccounts: Account[] = [
  {
    id: "usr-nova",
    displayName: "Nova Reyes",
    profileType: "personal",
    bio: "Maintainer of open research tooling.",
    links: { github: "https://github.com/novareyes" },
    avatarUrl: null,
    visibility: "public",
    createdAt: "2026-09-01T10:00:00Z",
  },
  {
    id: "biz-nimbus-labs",
    displayName: "Nimbus Labs",
    profileType: "business",
    bio: "Two-partner shop building agent infrastructure. Stewardship, not equity.",
    links: { site: "https://nimbus.example" },
    avatarUrl: null,
    visibility: "public",
    createdAt: "2026-09-12T10:00:00Z",
  },
  {
    id: "usr-me",
    displayName: "You (mock session)",
    profileType: "personal",
    bio: null,
    links: null,
    avatarUrl: null,
    visibility: "private",
    createdAt: "2026-10-01T10:00:00Z",
  },
];

export const mockBusinessMembers: AccountMember[] = [
  {
    accountId: "biz-nimbus-labs",
    userId: "usr-nova",
    role: "owner",
    addedAt: "2026-09-12T10:00:00Z",
    addedBy: "usr-nova",
    displayName: "Nova Reyes",
  },
  {
    accountId: "biz-nimbus-labs",
    userId: "usr-kai",
    role: "partner",
    addedAt: "2026-09-14T10:00:00Z",
    addedBy: "usr-nova",
    displayName: "Kai Duarte",
  },
];

function mapProfileRow(row: {
  id: string;
  display_name: string;
  profile_type: string;
  bio: string | null;
  links: Record<string, string> | null;
  avatar_url: string | null;
  visibility: string;
  created_at: string;
}): Account {
  return {
    id: row.id,
    displayName: row.display_name,
    profileType: row.profile_type === "business" ? "business" : "personal",
    bio: row.bio ?? null,
    links: row.links ?? null,
    avatarUrl: row.avatar_url ?? null,
    visibility: row.visibility === "public" ? "public" : "private",
    createdAt: row.created_at,
  };
}

const ACCOUNT_COLUMNS =
  "id, display_name, profile_type, bio, links, avatar_url, visibility, created_at";

// ── API ──────────────────────────────────────────────────────────────────────

/** Create a business account owned by a personal account (owner row = added self). */
export async function createBusinessAccount(
  ownerId: string,
  name: string,
): Promise<AccountResult<Account>> {
  if (!ownerId || !name) {
    return { ok: false, error: "ownerId and name are required" };
  }
  const db = getSupabase();
  if (db) {
    const id = crypto.randomUUID();
    const { data, error } = await db
      .from("profiles")
      .insert({ id, display_name: name, profile_type: "business" })
      .select(ACCOUNT_COLUMNS)
      .single();
    if (error) return { ok: false, error: error.message };
    const { error: memberError } = await db.from("business_members").insert({
      business_id: id,
      member_user_id: ownerId,
      role: "owner",
      added_by: ownerId,
    });
    if (memberError) return { ok: false, error: memberError.message };
    return { ok: true, value: mapProfileRow(data) };
  }
  const account: Account = {
    id: `biz-mock-${Date.now()}`,
    displayName: name,
    profileType: "business",
    bio: null,
    links: null,
    avatarUrl: null,
    visibility: "private",
    createdAt: nowIso(),
  };
  mockAccounts.push(account);
  mockBusinessMembers.push({
    accountId: account.id,
    userId: ownerId,
    role: "owner",
    addedAt: account.createdAt,
    addedBy: ownerId,
    displayName: null,
  });
  return { ok: true, value: account };
}

/** Read one account (personal or business) by profile id. */
export async function getAccount(id: string): Promise<Account | null> {
  const db = getSupabase();
  if (db) {
    const { data, error } = await db
      .from("profiles")
      .select(ACCOUNT_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (data) return mapProfileRow(data);
    if (error) return mockAccounts.find((a) => a.id === id) ?? null;
    return null;
  }
  return mockAccounts.find((a) => a.id === id) ?? null;
}

/** List a business account's members (owner + partners) with display names. */
export async function listAccountMembers(accountId: string): Promise<AccountMember[]> {
  const db = getSupabase();
  if (db) {
    const { data: rows, error } = await db
      .from("business_members")
      .select("business_id, member_user_id, role, added_at, added_by")
      .eq("business_id", accountId)
      .order("added_at", { ascending: true });
    if (error || !rows) {
      return mockBusinessMembers.filter((m) => m.accountId === accountId);
    }
    const ids = rows.map((r) => r.member_user_id);
    const names = new Map<string, string | null>();
    if (ids.length > 0) {
      const { data: profiles } = await db
        .from("profiles")
        .select("id, display_name")
        .in("id", ids);
      for (const p of profiles ?? []) names.set(p.id, p.display_name);
    }
    return rows.map((r) => ({
      accountId: r.business_id,
      userId: r.member_user_id,
      role: r.role === "owner" ? "owner" : "partner",
      addedAt: r.added_at,
      addedBy: r.added_by,
      displayName: names.get(r.member_user_id) ?? null,
    }));
  }
  return mockBusinessMembers.filter((m) => m.accountId === accountId);
}

/**
 * Add a member to a business account. Owners only. An owner may add another
 * owner (business co-ownership is allowed) or a partner.
 */
export async function addMember(
  accountId: string,
  actingOwnerId: string,
  newMemberId: string,
  role: BusinessRole = "partner",
): Promise<AccountResult<AccountMember>> {
  if (!accountId || !actingOwnerId || !newMemberId) {
    return { ok: false, error: "accountId, actingOwnerId and newMemberId are required" };
  }
  const db = getSupabase();
  if (db) {
    const owners = await listAccountMembers(accountId);
    const isOwner = owners.some((m) => m.userId === actingOwnerId && m.role === "owner");
    if (!isOwner) return { ok: false, error: "only account owners may add members" };
    const { data, error } = await db
      .from("business_members")
      .upsert(
        {
          business_id: accountId,
          member_user_id: newMemberId,
          role,
          added_by: actingOwnerId,
        },
        { onConflict: "business_id,member_user_id" },
      )
      .select("business_id, member_user_id, role, added_at, added_by")
      .single();
    if (error) return { ok: false, error: error.message };
    return {
      ok: true,
      value: {
        accountId: data.business_id,
        userId: data.member_user_id,
        role: data.role === "owner" ? "owner" : "partner",
        addedAt: data.added_at,
        addedBy: data.added_by,
        displayName: null,
      },
    };
  }
  const account = mockAccounts.find((a) => a.id === accountId);
  if (!account) return { ok: false, error: "account not found" };
  const isOwner = mockBusinessMembers.some(
    (m) => m.accountId === accountId && m.userId === actingOwnerId && m.role === "owner",
  );
  if (!isOwner) return { ok: false, error: "only account owners may add members" };
  const addedAt = nowIso();
  const member: AccountMember = {
    accountId,
    userId: newMemberId,
    role,
    addedAt,
    addedBy: actingOwnerId,
    displayName: mockAccounts.find((a) => a.id === newMemberId)?.displayName ?? null,
  };
  const existing = mockBusinessMembers.findIndex(
    (m) => m.accountId === accountId && m.userId === newMemberId,
  );
  if (existing >= 0) mockBusinessMembers[existing] = member;
  else mockBusinessMembers.push(member);
  return { ok: true, value: member };
}

/**
 * A member leaves their business account: they lose the seat and the remaining
 * owners keep the account and its projects — no buyout, no rent. If a partner
 * wants their work, they FORK the project (one-hop rent to the account they
 * left is the only rent). The platform never adjudicates internal splits.
 */
export async function exitAccount(
  accountId: string,
  userId: string,
): Promise<AccountResult<null>> {
  if (!accountId || !userId) {
    return { ok: false, error: "accountId and userId are required" };
  }
  const db = getSupabase();
  if (db) {
    const { error } = await db
      .from("business_members")
      .delete()
      .eq("business_id", accountId)
      .eq("member_user_id", userId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, value: null };
  }
  const before = mockBusinessMembers.length;
  for (let i = mockBusinessMembers.length - 1; i >= 0; i--) {
    const m = mockBusinessMembers[i];
    if (m.accountId === accountId && m.userId === userId) mockBusinessMembers.splice(i, 1);
  }
  if (mockBusinessMembers.length === before) {
    return { ok: false, error: "membership not found" };
  }
  return { ok: true, value: null };
}

/** The signed-in visitor's own account. Null when signed out or unconfigured. */
export async function currentProfile(): Promise<Account | null> {
  const db = getSupabase();
  if (db) {
    const { data: userData, error: userError } = await db.auth.getUser();
    if (userError || !userData?.user) return null;
    const { data, error } = await db
      .from("profiles")
      .select(ACCOUNT_COLUMNS)
      .eq("id", userData.user.id)
      .maybeSingle();
    if (data) return mapProfileRow(data);
    if (error) return mockAccounts.find((a) => a.profileType === "personal") ?? null;
    return null;
  }
  return mockAccounts.find((a) => a.id === "usr-me") ?? null;
}