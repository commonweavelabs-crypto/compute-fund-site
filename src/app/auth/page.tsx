"use client";

// /auth — sign-in door (plan Task 3). The app is browse-first: this page only
// surfaces when an interaction needs it (fund, vote, rate, create). It never
// blocks browsing. In mock mode it manages the local patron identity honestly.
// AuthProvider comes from the root layout (Task 3 step 5).

import { useState } from "react";
import { useAuth } from "@/lib/auth";

export default function AuthPage() {
  const { configured, signUp, signIn, signInWithGitHub, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [asTeam, setAsTeam] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function oauth(method: () => Promise<{ error?: string }>) {
    setError(null);
    const result = await method();
    if (result.error) setError(result.error);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim() || (asTeam ? "new team" : "patron");

    const result =
      mode === "signup"
        ? await signUp(email, password, name, asTeam)
        : await signIn(email, password);
    setBusy(false);
    if (result.error) setError(result.error);
    else if ("needsConfirmation" in result && result.needsConfirmation)
      setNotice(`> confirmation email sent to ${email} · click the link in it to activate this account.`);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="mono mb-4 text-[11px] uppercase tracking-[0.14em] text-dim">
        <span className="live" />
        {configured ? "supabase auth" : "mock identity · supabase not connected"}
      </div>
      <div className="border border-line bg-panel">
        <div className="flex border-b border-line bg-panel2">
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`mono flex-1 px-4 py-2.5 text-[11px] uppercase tracking-[0.08em] transition ${
              mode === "signup" ? "bg-phos/10 text-phos" : "text-dim hover:text-tx"
            }`}
          >
            {mode === "signup" ? "▸ " : ""}register patron
          </button>
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={`mono flex-1 px-4 py-2.5 text-[11px] uppercase tracking-[0.08em] transition ${
              mode === "signin" ? "bg-phos/10 text-phos" : "text-dim hover:text-tx"
            }`}
          >
            {mode === "signin" ? "▸ " : ""}sign in
          </button>
        </div>

        <form onSubmit={onSubmit} className="mono space-y-3 p-4 text-[12px]">
          {mode === "signup" && (
            <>
              <label className="block">
                <span className="text-dim">&gt; handle</span>
                <input
                  name="name"
                  placeholder={asTeam ? "Open Research Guild" : "patron handle"}
                  className="mt-1 w-full border border-line bg-bg px-3 py-2 text-tx outline-none transition placeholder:text-dim focus:border-phos"
                />
              </label>
              <button
                type="button"
                onClick={() => setAsTeam((v) => !v)}
                className={`mono flex w-full items-center justify-between border px-3 py-2 text-[11px] uppercase tracking-[0.08em] transition ${
                  asTeam ? "border-phos bg-phos/10 text-phos" : "border-line bg-bg text-dim"
                }`}
              >
                <span>{asTeam ? "▸ " : ""}sign up as team (receives milestones)</span>
                <span className={asTeam ? "text-phos" : "text-dim"}>{asTeam ? "✓" : ""}</span>
              </button>
            </>
          )}
          <label className="block">
            <span className="text-dim">&gt; email</span>
            <input
              name="email"
              type="email"
              required
              placeholder="patron@commons"
              className="mt-1 w-full border border-line bg-bg px-3 py-2 text-tx outline-none transition placeholder:text-dim focus:border-phos"
            />
          </label>
          <label className="block">
            <span className="text-dim">&gt; password</span>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              className="mt-1 w-full border border-line bg-bg px-3 py-2 text-tx outline-none transition focus:border-phos"
            />
          </label>

          {error && <p className="mono text-[11px] text-red">&gt; {error}</p>}
          {notice && <p className="mono text-[11px] leading-5 text-phos">{notice}</p>}

          <button
            type="submit"
            disabled={busy}
            className="mono w-full border border-phos bg-phos py-2.5 text-[11px] uppercase tracking-[0.08em] text-bg transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "..." : mode === "signup" ? "create identity" : "sign in"}
          </button>
        </form>
      </div>

      {/* social doors — coded for Supabase; each activates when its provider keys land in Supabase */}
      <div className="mono mt-3 grid gap-2">
        <button
          type="button"
          onClick={() => void oauth(signInWithGitHub)}
          className="border border-line bg-panel px-3 py-2.5 text-[11px] uppercase tracking-[0.08em] text-tx transition hover:border-phos hover:text-phos"
        >
          sign in from github
        </button>
        <button
          type="button"
          onClick={() => void oauth(signInWithGoogle)}
          className="border border-line bg-panel px-3 py-2.5 text-[11px] uppercase tracking-[0.08em] text-tx transition hover:border-phos hover:text-phos"
        >
          sign in from google
        </button>
        <div
          className="flex items-center justify-between border border-line bg-panel px-3 py-2.5 text-[11px] uppercase tracking-[0.08em] text-dim opacity-60"
          aria-disabled
        >
          <span>sign in from facebook</span>
          <span className="border border-line px-2 py-0.5 text-dim">soon</span>
        </div>
      </div>

      <p className="mono mt-4 text-[11px] leading-5 text-dim">
        &gt; patronage only: an identity lets you vote on milestones, rate teams after completion,
        and fund runs. receipts stay public. investors: <span className="text-red">none</span>.
      </p>
      <a
        href="/"
        className="mono mt-2 text-[11px] text-dim underline-offset-4 transition hover:text-phos"
      >
        &lt; back to the commons
      </a>
    </main>
  );
}