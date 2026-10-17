"use client";

// Auth context (plan Task 3). Two modes:
//  - Supabase configured: real email/password auth + profiles row.
//  - Not configured: MOCK mode — a localStorage patron identity so auth-gated
//    flows (voting, rating) are demoable locally. UI labels this honestly.

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

export type Profile = {
  id: string;
  email: string | null;
  name: string;
  isTeam: boolean;
};

type AuthState = {
  /** true while the provider resolves the session on first paint */
  loading: boolean;
  /** Supabase configured? (controls whether real auth is even attempted) */
  configured: boolean;
  user: { id: string; email: string | null } | null;
  profile: Profile | null;
  signUp: (email: string, password: string, name: string, asTeam: boolean) => Promise<{ error?: string; needsConfirmation?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signInWithGitHub: () => Promise<{ error?: string }>;
  signInWithGoogle: () => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

const MOCK_KEY = "cf-mock-user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [configured] = useState(() => isSupabaseConfigured());
  const [user, setUser] = useState<AuthState["user"]>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  // resolve session on mount
  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const db = getSupabase();
      if (db) {
        const { data } = await db.auth.getSession();
        const session: Session | null = data.session;
        if (cancelled) return;
        await applySession(session);
        // keep session fresh
        db.auth.onAuthStateChange((_event, session) => {
          void applySession(session);
        });
      } else {
        // mock mode
        try {
          const raw = localStorage.getItem(MOCK_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as Profile;
            if (!cancelled) {
              setUser({ id: parsed.id, email: parsed.email });
              setProfile(parsed);
            }
          }
        } catch {
          // no stored mock user
        }
      }
      if (!cancelled) setLoading(false);
    }
    void boot();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function applySession(session: Session | null) {
    const db = getSupabase();
    if (!session || !db) {
      setUser(null);
      setProfile(null);
      return;
    }
    const u = session.user;
    setUser({ id: u.id, email: u.email ?? null });
    const { data: prof } = await db
      .from("profiles")
      .select("id, display_name, email, is_team, team_rating")
      .eq("id", u.id)
      .single();
    setProfile(
      prof
        ? {
            id: prof.id,
            email: prof.email ?? u.email ?? null,
            name: (prof.display_name as string) ?? "patron",
            isTeam: Boolean(prof.is_team),
          }
        : null,
    );
  }

  async function signUp(email: string, password: string, name: string, asTeam: boolean) {
    const db = getSupabase();
    if (!db) {
      // mock identity
      const p: Profile = {
        id: `mock-${crypto.randomUUID()}`,
        email,
        name,
        isTeam: asTeam,
      };
      localStorage.setItem(MOCK_KEY, JSON.stringify(p));
      setUser({ id: p.id, email: p.email });
      setProfile(p);
      return {};
    }
    const { data, error } = await db.auth.signUp({
      email,
      password,
      options: { data: { display_name: name, is_team: asTeam } },
    });
    if (error) return { error: error.message };
    // Profile row is created by the public.handle_new_user() DB trigger
    // (runs even before email confirmation). If confirmation is ON, there is
    // no session yet — surface the check-your-email state honestly.
    if (data.user && !data.session) return { needsConfirmation: true };
    return {};
  }

  async function signIn(email: string, password: string) {
    const db = getSupabase();
    if (!db) {
      try {
        const raw = localStorage.getItem(MOCK_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Profile;
          if ((parsed.email ?? "").toLowerCase() === email.trim().toLowerCase()) {
            setUser({ id: parsed.id, email: parsed.email });
            setProfile(parsed);
            return {};
          }
        }
      } catch {
        // fall through
      }
      return { error: "Local sign-in not available for this email (mock mode holds one identity). Clearing? Register a new patron." };
    }
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return {};
  }

  async function signInWithGitHub() {
    const db = getSupabase();
    if (!db) return { error: "OAuth requires Supabase — add credentials to .env.local first." };
    const { error } = await db.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${process.env.NEXT_PUBLIC_BASE_URL ?? window.location.origin}/` },
    });
    if (error) return { error: error.message };
    return {};
  }

  async function signInWithGoogle() {
    const db = getSupabase();
    if (!db) return { error: "OAuth requires Supabase — add credentials to .env.local first." };
    const { error } = await db.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${process.env.NEXT_PUBLIC_BASE_URL ?? window.location.origin}/` },
    });
    if (error) return { error: error.message };
    return {};
  }

  async function signOut() {
    const db = getSupabase();
    if (db) await db.auth.signOut();
    localStorage.removeItem(MOCK_KEY);
    setUser(null);
    setProfile(null);
  }

  const value = useMemo<AuthState>(
    () => ({ loading, configured, user, profile, signUp, signIn, signInWithGitHub, signInWithGoogle, signOut }),
    [loading, configured, user, profile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** BROWSE-FIRST LAW: this is how gates decide whether to show a sign-in prompt. */
export function useAuthGate() {
  const auth = useAuth();
  return {
    ...auth,
    /** true when an interaction needs an identity the visitor does not have */
    needsSignIn: !auth.loading && !auth.user,
  };
}