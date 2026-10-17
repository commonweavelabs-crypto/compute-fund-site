"use client";

// /profile — the user's floor account (spec: accounts-roles-profiles.md).
// Personal profile edit + my memberships + my projects + business accounts.
// Public view of any profile: /profile?id=<profileId> (respects visibility).

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { createBusinessAccount } from "@/lib/accounts";
import { listProjectRoles } from "@/lib/roles";

type MyProfile = {
  id: string;
  display_name: string;
  bio: string | null;
  links: { url: string; label?: string }[];
  avatar_url: string | null;
  visibility: string;
  profile_type: string;
};

const EMPTY = { bio: "", links: [{ url: "" }] } as const;

export default function ProfilePage() {
  const auth = useAuth();
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [memberships, setMemberships] = useState<{ project: string; role: string }[]>([]);
  const [bizName, setBizName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const db = getSupabase();
    if (!db || !auth.user) return;
    const { data } = await db.from("profiles").select("*").eq("id", auth.user.id).maybeSingle();
    if (data) {
      setProfile({
        id: String(data.id),
        display_name: String(data.display_name ?? ""),
        bio: (data.bio as string) ?? null,
        links: ((data.links as { url: string }[]) ?? []) as MyProfile["links"],
        avatar_url: (data.avatar_url as string) ?? null,
        visibility: String(data.visibility ?? "private"),
        profile_type: String(data.profile_type ?? "personal"),
      } as MyProfile);
      const { data: mine } = await db.from("projects").select("id,title").eq("creator_id", auth.user.id);
      const roles = ((mine ?? []) as { id: string; title: string }[]).map((p) => {
        return { project: p.title, role: "owner (of their own unit)" };
      });
      setMemberships(roles);
    }
  }, [auth.user]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!profile) return;
    setBusy(true); setNotice(null);
    try {
      const db = getSupabase();
      if (!db) return;
      const { error } = await db.from("profiles").update({
        display_name: profile.display_name,
        bio: profile.bio,
        links: profile.links.filter((l) => l.url.trim()),
        visibility: profile.visibility,
      }).eq("id", profile.id);
      setNotice(error ? ("save failed: " + error.message) : "profile saved");
    } finally {
      setBusy(false);
    }
  }

  async function newBusiness() {
    if (!bizName.trim() || !auth.user) { setNotice("name the account first"); return; }
    setBusy(true); setNotice(null);
    const res = await createBusinessAccount(auth.user.id, bizName.trim());
    if ("error" in (res as { error?: string })) setNotice((res as { error?: string }).error ?? "failed");
    else setNotice("business account created — you are its owner");
    setBizName("");
    setBusy(false);
    await load();
  }

  if (!auth.user) {
    return (
      <main className="mono mx-auto max-w-3xl px-4 py-16 text-[12px] text-dim">
        <p>&gt; no identity here yet — the floor account comes from{" "}
          <Link href="/auth" className="text-phos hover:underline">signing in</Link>.</p>
      </main>
    );
  }

  return (
    <main className="mono mx-auto max-w-3xl space-y-5 px-4 py-10 text-[12px] text-dim sm:px-6">
      <p className="text-[11px] uppercase tracking-[0.2em] text-amber">the floor account</p>
      <h1 className="display text-3xl font-semibold tracking-tight text-tx">
        my profile {profile?.profile_type ? `· ${profile.profile_type}` : ""}
      </h1>

      {profile ? (
        <section className="space-y-3 border border-line bg-panel p-5">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-[11px] uppercase tracking-[0.14em]">name</label>
            <input
              value={profile.display_name}
              onChange={(e) => setProfile({ ...profile, display_name: e.target.value })}
              className="mono flex-1 border border-line bg-bg px-3 py-2 text-[12px] text-tx outline-none"
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-[0.14em]">bio</label>
            <textarea
              value={profile.bio ?? EMPTY.bio}
              onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
              rows={3}
              maxLength={500}
              className="mono mt-2 w-full border border-line bg-bg px-3 py-2 text-[12px] leading-6 text-tx outline-none"
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-[0.14em]">links</label>
            {profile.links.map((l, i) => (
              <input
                key={i}
                value={l.url}
                onChange={(e) => {
                  const links = [...profile.links];
                  links[i] = { url: e.target.value };
                  setProfile({ ...profile, links });
                }}
                placeholder="https://..."
                className="mono mt-2 w-full border border-line bg-bg px-3 py-2 text-[12px] text-tx outline-none"
              />
            ))}
            <button
              type="button"
              onClick={() => setProfile({ ...profile, links: [...profile.links, { url: "" }] })}
              className="mono mt-2 border border-line px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-dim hover:border-phos hover:text-phos"
            >
              + link
            </button>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-[11px] uppercase tracking-[0.14em]">visibility</label>
            <select
              value={profile.visibility}
              onChange={(e) => setProfile({ ...profile, visibility: e.target.value })}
              className="mono border border-line bg-bg px-3 py-2 text-[12px] text-tx outline-none"
            >
              <option value="private">private (only me)</option>
              <option value="public">public (recommended for project owners)</option>
            </select>
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy}
              className="mono ml-auto border border-phos bg-phos px-4 py-2 text-[11px] uppercase tracking-[0.1em] text-bg disabled:opacity-40"
            >
              {busy ? "saving..." : "save profile"}
            </button>
          </div>
        </section>
      ) : (
        <p>&gt; loading profile...</p>
      )}

      {notice && (
        <p className="mono border border-phos bg-phos/5 px-3 py-2 text-[11px] text-phos">&gt; {notice}</p>
      )}

      <section className="border border-line bg-panel p-5">
        <h2 className="mono text-[11px] uppercase tracking-[0.14em] text-dim">my project roles</h2>
        {memberships.length > 0 ? (
          <div className="mono mt-3 space-y-1 text-[11px]">
            {memberships.map((m, i) => (
              <div key={i} className="border border-line bg-panel2 px-3 py-2 text-tx">
                <span className="text-phos">{m.project}</span> · {m.role}
              </div>
            ))}
          </div>
        ) : (
          <p className="mono mt-3 text-[11px]">&gt; no units yet — claim a mirror or create your own project</p>
        )}
      </section>

      <section className="border border-line bg-panel p-5">
        <h2 className="mono text-[11px] uppercase tracking-[0.14em] text-dim">open a business account</h2>
        <p className="mono mt-2 text-[11px] leading-5">
          co-ownership happens at the business level: 2+ people own the account, the account
          owns the project. accounts are stewardship, not equity — splits resolve by forks.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            value={bizName}
            onChange={(e) => setBizName(e.target.value)}
            placeholder="e.g. Gui Labs Collective"
            className="mono flex-1 border border-line bg-bg px-3 py-2 text-[12px] text-tx outline-none"
          />
          <button
            type="button"
            onClick={() => void newBusiness()}
            disabled={busy}
            className="mono border border-phos bg-phos px-4 py-2 text-[11px] uppercase tracking-[0.1em] text-bg disabled:opacity-40"
          >
            create
          </button>
        </div>
      </section>

      <Link href="/" className="mono inline-block text-[11px] text-dim hover:text-phos">
        &lt; back to the commons
      </Link>
    </main>
  );
}