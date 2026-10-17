"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { redirectToStripeCheckout } from "@/lib/stripe-client";
import {
  getProjectsWithDetail,
  applyMockFunding,
  applyMockFollow,
  persistProject,
  type ProjectView,
} from "@/lib/projects";
import { useAuthGate } from "@/lib/auth";
import { createMilestone, completeMilestone } from "@/lib/milestones";
import { runCompute as runComputeReceipt, type ComputeReceipt } from "@/lib/compute-runner";
import { castVote, getTopVotedProjects, type TopVotedProject } from "@/lib/votes";
import { submitRating } from "@/lib/ratings";
import { savePluginSplits, type SplitLine } from "@/lib/plugins";
import type { Category, Milestone } from "@/types/compute-fund";
import MilestoneList from "@/components/milestones/MilestoneList";
import MilestoneForm, { type MilestoneFormValues } from "@/components/milestones/MilestoneForm";
import CategoryFilter from "@/components/discovery/CategoryFilter";
import VoteButton from "@/components/community/VoteButton";
import RatingForm from "@/components/ratings/RatingForm";
import TeamRating from "@/components/ratings/TeamRating";
import PluginSplitEditor from "@/components/plugins/PluginSplitEditor";

type View = "landing" | "dashboard" | "discover" | "mine" | "project";

type Project = ProjectView;

// seed data lives in src/lib/mock-db.ts (fallback mode) — loaded via getProjectsWithDetail()

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function pct(p: Project) {
  return Math.min(100, Math.round((p.funded / p.goal) * 100));
}

function unitNumber(p: Project, projects: Project[]) {
  const i = projects.findIndex((x) => x.id === p.id);
  return String(42 + (i >= 0 ? i : 0)).padStart(4, "0");
}

function runStatusText(project: Project) {
  const done = project.runs.some((run) => run.status === "complete");
  const queued = project.runs.some((run) => run.status === "queued");
  if (queued) return "AWAITING approval";
  if (done) return "RUNNING";
  return "STANDBY";
}

const TIERS = [25, 100, 500];
const TIER_NAMES = ["TIER I · PATRONS", "TIER II · PATRONS+", "TIER III · PATRONS++"];

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState("");
  const [view, setView] = useState<View>("landing");
  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [busy, setBusy] = useState(false);
  const [selectedCats, setSelectedCats] = useState<Category[]>([]);
  const [trending, setTrending] = useState<TopVotedProject[]>([]);
  /** session-local dedupe for vote buttons (real dedupe lives in the data layer) */
  const [votedKeys, setVotedKeys] = useState<string[]>([]);
  const auth = useAuthGate();

  const loadBoard = useCallback(async () => {
    const [rows, top] = await Promise.all([
      getProjectsWithDetail(),
      getTopVotedProjects(7).catch(() => [] as TopVotedProject[]),
    ]);
    setProjects(rows);
    setTrending(top);
  }, []);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    if (t === "light" || t === "dark") setTheme(t);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem("app-theme", next);
  }

  const activeProject =
    projects.find((project) => project.id === activeId) ?? projects[0];
  /** non-null alias used for narrowing in the render tree */
  const active = activeProject;
  const creatorProjects = projects.filter((project) => project.mine);
  const dashboardProject =
    creatorProjects.find((project) => project.id === activeId) ?? creatorProjects[0] ?? activeProject;

  const totals = useMemo(() => {
    return projects.reduce(
      (acc, project) => {
        acc.funded += project.funded;
        acc.goal += project.goal;
        acc.supporters += project.supporters;
        acc.runs += project.runs.length;
        return acc;
      },
      { funded: 0, goal: 0, supporters: 0, runs: 0 },
    );
  }, [projects]);

  const recentRuns = useMemo(() => {
    return projects
      .flatMap((project) => project.runs.map((run) => ({ project, run })))
      .slice(0, 4);
  }, [projects]);

  const discoveredProjects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let pool = projects;
    if (selectedCats.length > 0) {
      pool = pool.filter((project) => selectedCats.includes(project.category as Category));
    }
    if (!needle) return pool;
    return pool.filter((project) => {
      return [project.title, project.creator, project.category, project.summary]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [projects, query, selectedCats]);

  function openProject(projectId: string) {
    setActiveId(projectId);
    setView("project");
  }

  async function fundProject(projectId: string, amount: number) {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;

    // Attempt Stripe checkout; fall back to the mock ledger when not configured
    const result = await redirectToStripeCheckout(project.id, project.title, amount);
    if (result.error) {
      console.warn("[Stripe] Checkout unavailable, using local funding:", result.error);
      applyMockFunding(projectId, amount);
      await loadBoard();
    }
    // On success, Stripe redirects away; the webhook persists the ledger
  }

  async function followProject(projectId: string) {
    applyMockFollow(projectId);
    await loadBoard();
  }

  /** Project-level "run compute" (v0 semantic) → routed through the active milestone's ledger. */
  async function runProjectCompute(projectId: string) {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    const milestone =
      project.milestones.find((m) => m.status === "active") ??
      project.milestones.find((m) => m.status === "funded") ??
      project.milestones[0];
    if (!milestone) {
      console.warn("[Run] unit has no milestone in the queue — propose one first");
      return;
    }
    await runMilestoneCompute(projectId, milestone, {
      promptTemplate: milestone.successCriteria,
      provider: "openai",
      model: "gpt-4o-mini",
    });
  }

  async function runMilestoneCompute(
    projectId: string,
    milestone: Milestone,
    meta: { promptTemplate: string; provider: string; model: string },
  ) {
    setBusy(true);
    try {
      const receipt = (await runComputeReceipt(
        milestone.id,
        meta.promptTemplate,
        meta.provider,
        meta.model,
      )) as ComputeReceipt | null;
      if (receipt?.overBudget) {
        console.warn("[Run] milestone over token budget:", receipt);
      }
    } catch (err) {
      console.error("[Run] compute run failed:", err);
    } finally {
      setBusy(false);
      await loadBoard();
    }
  }

  async function completeMilestoneFlow(milestone: Milestone) {
    setBusy(true);
    try {
      await completeMilestone(milestone.id);
    } finally {
      setBusy(false);
      await loadBoard();
    }
  }

  async function voteMilestone(projectId: string, milestone: Milestone) {
    if (!auth.user) return;
    const result = await castVote(auth.user.id, { milestoneId: milestone.id });
    if (result.ok) setVotedKeys((keys) => [...keys, `m:${milestone.id}`]);
    else console.warn("[Vote]", result.error);
    await loadBoard();
  }

  async function voteProject(projectId: string) {
    if (!auth.user) return;
    const result = await castVote(auth.user.id, { projectId });
    if (result.ok) setVotedKeys((keys) => [...keys, `p:${projectId}`]);
    else console.warn("[Vote]", result.error);
    await loadBoard();
  }

  async function rateTeamForMilestone(milestone: Milestone, rating: number, review: string) {
    const project = projects.find((p) => p.id === milestone.projectId);
    if (!project) return;
    const result = await submitRating({
      raterId: auth.user?.id ?? "",
      teamId: project.creatorId,
      milestoneId: milestone.id,
      rating,
      review: review || undefined,
    });
    if (!result.ok) console.warn("[Rating]", result.error);
    else setVotedKeys((keys) => [...keys, `r:${milestone.id}`]);
    await loadBoard();
  }

  async function proposeMilestone(projectId: string, values: MilestoneFormValues) {
    await createMilestone({
      projectId,
      title: values.title,
      description: values.description,
      successCriteria: values.successCriteria,
      estimatedTokens: values.estimatedTokens,
      status: "proposed",
      assignedTeamId: auth.profile?.id ?? null,
      deadline: values.deadline === "" ? null : values.deadline,
    });
    await loadBoard();
  }

  async function saveSplits(projectId: string, splits: SplitLine[]) {
    await savePluginSplits(projectId, splits);
    await loadBoard();
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    const summary = String(form.get("summary") ?? "").trim();
    const goal = Number(form.get("goal") ?? 5000);

    if (!title || !summary) return;

    const { project } = await persistProject({
      creatorId: auth.profile?.id ?? "team-gui-labs",
      title,
      summary,
      goal,
      category: "New Project",
    });

    await loadBoard();
    setActiveId(project.id);
    setView("project");
    event.currentTarget.reset();
  }

  const nav: { id: View; label: string }[] = [
    { id: "landing", label: "Commons" },
    { id: "dashboard", label: "Dashboard" },
    { id: "discover", label: "Discover" },
    { id: "mine", label: "My Projects" },
  ];

  return (
    <main className="min-h-screen bg-bg pb-10 text-tx">
      {/* status bar — live platform telemetry */}
      <div className="mono flex flex-wrap justify-between gap-x-6 gap-y-1 border-b border-line bg-panel2 px-4 py-2 text-[11px] text-dim sm:px-6 lg:px-8">
        <span>
          <span className="live" />
          <b className="font-medium text-phos">COMMUNITY COMPUTE NETWORK</b> ·{" "}
          <b className="font-medium text-tx">{totals.supporters}</b> patrons ·{" "}
          <b className="font-medium text-tx">{totals.runs}</b> active runs · receipts:{" "}
          <b className="font-medium text-phos">public</b>
        </span>
        <span>
          <a href="/tos" className="transition hover:text-phos">
            how funding works →
          </a>
        </span>
      </div>

      {/* top nav — Compute.Fund brand + global search + doors */}
      <div className="sticky top-0 z-10 border-b border-line bg-bg/95 backdrop-blur">
        <div className="mono mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => {
              setView("landing");
              setQuery("");
              setSelectedCats([]);
            }}
            className="flex items-center gap-2 text-left"
          >
            <img
              src="/logos/compute-fund-logo-mark.png"
              alt="Compute Fund"
              className="size-9 object-cover"
            />
            <span className="hidden sm:block">
              <span className="mono block text-[13px] font-semibold tracking-[0.18em] text-tx">
                COMPUTE.FUND
              </span>
              <span className="mono block text-[9px] uppercase tracking-[0.3em] text-dim">
                people power open compute
              </span>
            </span>
          </button>

          <form
            className="mono flex min-w-0 flex-1 items-center gap-2 border border-line bg-panel px-3 py-2"
            onSubmit={(e) => {
              e.preventDefault();
              setView("discover");
            }}
          >
            <span className="text-[12px] text-phos">⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="search projects, teams, or tags..."
              className="mono w-full min-w-0 flex-1 bg-transparent text-[12px] text-tx outline-none placeholder:text-dim"
            />
          </form>

          <div className="mono flex flex-wrap items-center gap-2">
            {nav
              .filter((item) => item.id !== "landing")
              .map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setView(item.id)}
                  className={`border px-3 py-2 text-[11px] uppercase tracking-[0.08em] transition ${
                    view === item.id
                      ? "border-phos bg-phos text-bg"
                      : "border-transparent text-dim hover:border-phos hover:text-phos"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            {auth.loading ? (
              <span className="mono px-2 text-[11px] text-dim">identity...</span>
            ) : auth.user ? (
              <span className="mono flex items-center gap-2 border border-line bg-panel px-3 py-2 text-[11px] text-tx">
                <span className="text-phos">patron:</span>
                {auth.profile?.name || auth.user.email || "anon"}
                {auth.profile?.isTeam && <span className="text-amber">· team</span>}
                <button
                  type="button"
                  onClick={() => void auth.signOut()}
                  className="text-dim transition hover:text-phos"
                >
                  sign out
                </button>
              </span>
            ) : (
              <a
                href="/auth"
                className="border border-line bg-panel px-3 py-2 text-[11px] uppercase tracking-[0.08em] text-dim transition hover:border-phos hover:text-phos"
              >
                sign in
              </a>
            )}
            <button
              type="button"
              onClick={() => setView("discover")}
              className="border border-phos bg-phos px-4 py-2 text-[11px] uppercase tracking-[0.08em] text-bg transition hover:opacity-90"
            >
              fund a run →
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle color identity"
              className="border border-line bg-panel px-3 py-2 text-[11px] uppercase tracking-[0.08em] text-dim transition hover:border-phos hover:text-phos"
            >
              {theme === "dark" ? "light" : "dark"}
            </button>
          </div>
        </div>
      </div>

      {/* category rail (landing) */}
      {view === "landing" && (
        <div className="mono mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
          <div className="overflow-x-auto">
            <div className="flex gap-2 pb-1">
              <button
                type="button"
                onClick={() => {
                  setSelectedCats([]);
                  setView("discover");
                }}
                className="shrink-0 border border-phos bg-phos/10 px-4 py-2 text-[11px] uppercase tracking-[0.08em] text-phos"
              >
                ▸ all projects
              </button>
              {(Object.keys(CATEGORY_COUNTS(projects)) as string[]).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setSelectedCats([cat as Category]);
                    setView("discover");
                  }}
                  className="shrink-0 border border-line bg-panel px-4 py-2 text-[11px] uppercase tracking-[0.08em] text-dim transition hover:border-phos hover:text-phos"
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {view === "landing" && (
        <Landing
          totals={totals}
          projects={projects}
          recentRuns={recentRuns}
          onExplore={() => setView("discover")}
          openProject={openProject}
          fundProject={fundProject}
        />
      )}

      {!active ? (
        <div className="mono mx-auto max-w-7xl px-4 py-10 text-[12px] text-dim sm:px-6 lg:px-8">
          &gt; {busy ? "running..." : "loading the commons..."}
        </div>
      ) : (
        <>
          {view === "dashboard" && active && (
            <Dashboard
              activeProject={dashboardProject}
              projects={creatorProjects}
              totals={totals}
              setActiveId={setActiveId}
              fundProject={fundProject}
              runProjectCompute={runProjectCompute}
              busy={busy}
              createProject={createProject}
            />
          )}

          {view === "discover" && (
            <Discovery
              query={query}
              setQuery={setQuery}
              projects={discoveredProjects}
              allProjects={projects}
              selectedCats={selectedCats}
              onToggleCat={(category) =>
                setSelectedCats((cur) =>
                  cur.includes(category) ? cur.filter((x) => x !== category) : [...cur, category],
                )
              }
              trending={trending}
              votedKeys={votedKeys}
              onVoteProject={voteProject}
              openProject={openProject}
              fundProject={fundProject}
              followProject={followProject}
            />
          )}

          {view === "mine" && (
            <MyProjects
              projects={projects}
              allProjects={projects}
              openProject={openProject}
              fundProject={fundProject}
              votedKeys={votedKeys}
              onVoteProject={voteProject}
              followProject={followProject}
            />
          )}

          {view === "project" && active && (
            <ProjectLanding
              project={active}
              allProjects={projects}
              setView={setView}
              fundProject={fundProject}
              runProjectCompute={runProjectCompute}
              followProject={followProject}
              votedKeys={votedKeys}
              onVoteMilestone={voteMilestone}
              onCompleteMilestone={completeMilestoneFlow}
              onRunMilestone={runMilestoneCompute}
              onRateTeam={rateTeamForMilestone}
              onProposeMilestone={proposeMilestone}
              onSaveSplits={saveSplits}
              busy={busy}
              authed={Boolean(auth.user)}
              canEditSplits={Boolean(auth.user) && Boolean(active.mine)}
            />
          )}
        </>
      )}

      {/* live-ledger ticker */}
      <div className="fixed bottom-0 left-0 right-0 z-10 overflow-hidden border-t border-line bg-panel">
        <div className="ticker-track mono py-2 text-[11px] text-dim">
          {[0, 1].map((copy) => (
            <span key={copy} className="inline-flex gap-10 pr-10">
              <span>live ledger</span>
              {recentRuns.map(({ project, run }) => (
                <span key={`${copy}-${run.id}`}>
                  run {run.model} <b className="font-medium text-amber">−{usd.format(run.cost)}</b> ·{" "}
                  {project.title}
                </span>
              ))}
              <span>
                <b className="font-medium text-amber">
                  total compute under community stewardship · {usd.format(totals.funded)}
                </b>
              </span>
            </span>
          ))}
        </div>
      </div>
    </main>
  );
}

/* ── hooks & helpers for the landing rebuild ─────────────────────────────── */

function CATEGORY_COUNTS(projects: Project[]) {
  const counts: Record<string, number> = {};
  for (const p of projects) counts[p.category] = (counts[p.category] ?? 0) + 1;
  return counts;
}

/** animated count-up; respects prefers-reduced-motion */
function useCountUp(target: number, durationMs = 900) {
  const [value, setValue] = useState(target);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const from = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / durationMs);
      setValue(Math.round(from + (target - from) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

const LANDING_TABS = ["Trending", "Newest", "Ending soon", "Community priority"] as const;

function tabProjects(tab: (typeof LANDING_TABS)[number], all: Project[]): Project[] {
  const list = [...all];
  if (tab === "Trending")
    return list.sort((a, b) => b.milestones.reduce((s, m) => s + m.votes, 0) - a.milestones.reduce((s, m) => s + m.votes, 0));
  if (tab === "Newest") return list.reverse();
  if (tab === "Ending soon")
    return list.sort((a, b) => (a.deadline === "—" ? 1 : 0) - (b.deadline === "—" ? 1 : 0));
  return list.sort((a, b) => b.priority - a.priority);
}

/* ── Landing page (MERGE mockup) ───────────────────────────────────────────── */

function Landing({
  totals,
  projects,
  recentRuns,
  onExplore,
  openProject,
  fundProject,
}: {
  totals: { funded: number; goal: number; supporters: number; runs: number };
  projects: Project[];
  recentRuns: { project: Project; run: Project["runs"][number] }[];
  onExplore: () => void;
  openProject: (projectId: string) => void;
  fundProject: (projectId: string, amount: number) => Promise<void>;
}) {
  const [tab, setTab] = useState<(typeof LANDING_TABS)[number]>("Trending");
  const rotationPool = useMemo(
    () => [...projects].sort((a, b) => b.priority - a.priority).slice(0, 5),
    [projects],
  );
  const [featuredIdx, setFeaturedIdx] = useState(0);

  useEffect(() => {
    if (rotationPool.length < 2) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    const timer = setInterval(() => setFeaturedIdx((i) => (i + 1) % rotationPool.length), 6000);
    return () => clearInterval(timer);
  }, [rotationPool]);

  const featured = rotationPool[featuredIdx % Math.max(1, rotationPool.length)];
  const featuredPct = useCountUp(featured ? pct(featured) : 0);
  const fundedCount = useCountUp(totals.funded);
  const patronsCount = useCountUp(totals.supporters);
  const [pickTier, setPickTier] = useState(25);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-5 sm:px-6 lg:px-8">
      {/* ── hero ── */}
      <section className="grid border border-line bg-panel lg:grid-cols-[1.05fr_1fr]">
        <div className="px-6 py-12 lg:px-10">
          <p className="mono text-[11px] uppercase tracking-[0.22em] text-amber">
            patronage only · receipts are the product
          </p>
          <h1 className="display mt-4 text-5xl font-semibold leading-[1.08] tracking-tight lg:text-[56px]">
            Fund the work that{" "}
            <span className="text-phos">moves us forward.</span>
          </h1>
          <p className="mono mt-5 max-w-xl text-[13px] leading-7 text-dim">
            &gt; real open-source projects, mirrored for the commons. fund the tools you
            believe in — every claim verified, every run receipted, every token
            accounted. investors: none.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onExplore}
              className="mono border border-phos bg-phos px-6 py-3 text-[12px] uppercase tracking-[0.08em] text-bg transition hover:opacity-90"
            >
              explore projects →
            </button>
            <a
              href="/tos"
              className="mono border border-line bg-panel px-6 py-3 text-[12px] uppercase tracking-[0.08em] text-tx transition hover:border-phos"
            >
              how it works
            </a>
          </div>
          <div className="mt-10 grid grid-cols-3 gap-3">
            <HeroMetric label="machine-time under stewardship" value={usd.format(fundedCount)} />
            <HeroMetric label="patrons" value={String(patronsCount)} />
            <HeroMetric label="runs on the record" value={String(totals.runs)} />
          </div>
        </div>

        {/* hero photo */}
        <div className="relative min-h-[320px] overflow-hidden border-t border-line lg:border-l lg:border-t-0">
          <img
            src="/project-art/hero.png"
            alt=""
            className="absolute inset-0 size-full object-cover"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--panel),transparent_30%)]" />
          <span className="display absolute right-6 top-6 -rotate-3 text-right text-lg italic text-amber opacity-90">
            a more open future
            <br />
            is a community effort
          </span>
        </div>
      </section>

      {/* ── featured project (auto-rotating) ── */}
      {featured && (
        <section className="mt-4 grid border border-line bg-panel lg:grid-cols-[1.4fr_1fr]">
          {/* photo card */}
          <button
            type="button"
            onClick={() => openProject(featured.id)}
            className="group relative block min-h-[320px] overflow-hidden text-left lg:min-h-[420px]"
          >
            {featured.imageUrl && (
              <img
                key={featured.id}
                src={featured.imageUrl}
                alt=""
                className="anim-fadein absolute inset-0 size-full object-cover transition duration-700"
              />
            )}
            <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(12,16,19,0.92),transparent_55%)]" />
            <div className="absolute left-5 top-5 flex items-center gap-3">
              <span className="mono border border-phos bg-bg/80 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-phos">
                ★ featured project
              </span>
              {featured.claimStatus === "unclaimed" && (
                <span className="mono border border-amber bg-bg/80 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-amber">
                  unclaimed · tokens parked
                </span>
              )}
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-6">
              <h2 className="display text-4xl font-semibold tracking-tight text-tx">
                {featured.title}
              </h2>
              <p className="mono mt-3 text-[11px] text-dim">
                by {featured.creator} · {featured.category.toLowerCase()}
                {featured.originRepo ? ` · github.com/${featured.originRepo}` : ""}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="mono border border-line bg-bg/80 px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-dim">
                  {featured.category}
                </span>
                <span className="mono border border-line bg-bg/80 px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-dim">
                  open source
                </span>
              </div>
            </div>
          </button>

          {/* stats side panel */}
          <div className="border-t border-line p-6 lg:border-l lg:border-t-0">
            <div className="mono flex items-center justify-between text-[11px] text-dim">
              <span>
                <span className="live" />
                UNIT {unitNumber(featured, projects)} · {runStatusText(featured)}
              </span>
              <span className="text-amber">PRIO {featured.priority}</span>
            </div>
            <div className="mono mt-5 flex items-baseline gap-3">
              <span className="text-[46px] leading-none text-phos">{featuredPct}%</span>
              <span className="text-[11px] text-dim">funded</span>
            </div>
            <div className="vbar mt-3">
              <i style={{ width: `${pct(featured)}%` }} />
            </div>
            <div className="mono mt-4 flex justify-between text-[12px]">
              <span className="text-tx">{usd.format(featured.funded)} committed</span>
              <span className="text-dim">{usd.format(featured.goal)} goal</span>
            </div>
            <dl className="mono mt-6 space-y-2 text-[11px]">
              <div className="stream-line flex justify-between gap-4">
                <span>&gt; patrons</span>
                <span className="text-tx">{featured.supporters}</span>
              </div>
              <div className="stream-line flex justify-between gap-4">
                <span>&gt; receipt stream</span>
                <span className="text-tx">{featured.runs.length} entries</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-[11px] text-dim">
                <span>&gt; fund this unit</span>
                <span className="flex gap-1">
                  {TIERS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => void fundProject(featured.id, t)}
                      className={`border px-2 py-1 transition ${
                        pickTier === t ? "border-phos text-phos" : "border-line text-tx hover:border-phos"
                      }`}
                    >
                      {usd.format(t)}
                    </button>
                  ))}
                </span>
              </div>
            </dl>
            <button
              type="button"
              onClick={() => openProject(featured.id)}
              className="mono mt-6 w-full border border-phos bg-phos py-3 text-[12px] uppercase tracking-[0.08em] text-bg transition hover:opacity-90"
            >
              view project →
            </button>

            {/* receipt cascade */}
            <div className="cascade mt-6 border border-line bg-bg px-3 py-2 text-[10px]">
              <span className="mono text-[10px] uppercase tracking-[0.14em] text-dim">
                <span className="live" />
                live receipts
              </span>
              {(recentRuns.length
                ? recentRuns
                : [{ project: featured, run: { id: "none", model: "—", output: "no runs yet — fund a unit to start the stream", cost: 0, status: "queued" as const, prompt: "", timestamp: "" } }]
              ).slice(0, 3).map(({ project, run }, i) => (
                <div key={run.id} className="stream-line anim-cascade mt-1" style={{ animationDelay: `${i * 120}ms` }}>
                  &gt; {project.title.slice(0, 16)} · {run.model}{" "}
                  {run.cost ? <b className="text-amber">−{usd.format(run.cost)}</b> : null}
                </div>
              ))}
            </div>

            <div className="mono mt-3 flex justify-center gap-2">
              {rotationPool.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setFeaturedIdx(i)}
                  aria-label={`Feature ${p.title}`}
                  className={`h-1.5 w-6 transition ${i === featuredIdx ? "bg-phos" : "bg-line"}`}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── recommended for you (tabs + photo grid) ── */}
      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
          <h2 className="display text-2xl font-semibold">Recommended for you</h2>
          <div className="mono flex flex-wrap items-center gap-2">
            {LANDING_TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`border px-3 py-1.5 text-[11px] uppercase tracking-[0.08em] transition ${
                  tab === t ? "border-phos bg-phos/10 text-phos" : "border-line text-dim hover:border-phos hover:text-phos"
                }`}
              >
                {tab === t ? "▸ " : ""}
                {t.toLowerCase()}
              </button>
            ))}
            <button
              type="button"
              onClick={onExplore}
              className="px-2 py-1.5 text-[11px] uppercase tracking-[0.08em] text-phos transition hover:text-tx"
            >
              see all →
            </button>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tabProjects(tab, projects).slice(0, 4).map((project) => (
            <MediaCard
              key={project.id}
              project={project}
              allProjects={projects}
              onOpen={() => openProject(project.id)}
            />
          ))}
        </div>
      </section>

      {/* ── open for funding strip (compact, B-style) ── */}
      <section className="mt-10">
        <div className="flex items-end justify-between border-b border-line pb-4">
          <h2 className="display text-2xl font-semibold">Open for funding</h2>
          <button
            type="button"
            onClick={onExplore}
            className="mono text-[11px] uppercase tracking-[0.08em] text-phos transition hover:text-tx"
          >
            see all projects →
          </button>
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {tabProjects("Newest", projects).slice(0, 3).map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => openProject(project.id)}
              className="group flex items-stretch gap-3 border border-line bg-panel p-3 text-left transition hover:border-phos"
            >
              {project.imageUrl && (
                <img
                  src={project.imageUrl}
                  alt=""
                  className="h-full min-h-[92px] w-28 shrink-0 object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="mono flex items-center justify-between gap-2 text-[10px] text-dim">
                  <span>
                    {project.claimStatus === "unclaimed" ? (
                      <span className="text-amber">UNCLAIMED · PARKED</span>
                    ) : (
                      runStatusText(project)
                    )}
                  </span>
                  <span className="text-amber">PRIO {project.priority}</span>
                </div>
                <p className="mt-1 truncate text-sm font-semibold text-tx">{project.title}</p>
                <div className="mono mt-2 flex items-center justify-between text-[11px] text-dim">
                  <span className="text-phos">{pct(project)}% funded</span>
                  <span>
                    {usd.format(project.funded)} / {usd.format(project.goal)}
                  </span>
                </div>
                <div className="vbar mt-2">
                  <i style={{ width: `${pct(project)}%` }} />
                </div>
                <p className="mono mt-2 text-[10px] text-phos transition group-hover:text-tx">
                  view receipts →
                </p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ── value props ── */}
      <section id="how" className="mt-10 grid gap-4 lg:grid-cols-3">
        <ValueProp glyph="⌘" title="A community of builders">
          Creators, researchers, and everyday people funding useful work together — no
          investors in the ledger, patronage only.
        </ValueProp>
        <ValueProp glyph="◎" title="Receipts you can verify">
          Every run, prompt, and cost is public. The receipts are the product — open to
          verify, auditable by anyone.
        </ValueProp>
        <ValueProp glyph="⇄" title="No dead tokens">
          Unclaimed work passes the torch: day 90 the community steers parked tokens to
          forks and keeps projects alive. No gates, no gatekeepers.
        </ValueProp>
      </section>
    </div>
  );
}

function ValueProp({ glyph, title, children }: { glyph: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 border border-line bg-panel p-5">
      <span className="mono flex size-10 shrink-0 items-center justify-center border border-phos text-[18px] text-phos">
        {glyph}
      </span>
      <span>
        <h3 className="text-sm font-semibold text-tx">{title}</h3>
        <p className="mono mt-2 text-[11px] leading-5 text-dim">{children}</p>
      </span>
    </div>
  );
}

/** photo card for the recommended grid */
function MediaCard({
  project,
  allProjects,
  onOpen,
}: {
  project: Project;
  allProjects: Project[];
  onOpen: () => void;
}) {
  const done = pct(project);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col border border-line bg-panel text-left transition hover:border-phos"
    >
      {project.imageUrl ? (
        <img
          src={project.imageUrl}
          alt=""
          className="h-40 w-full object-cover"
        />
      ) : (
        <div className="flex h-40 w-full items-center justify-center bg-bg">
          <span className="mono text-[11px] text-dim">&gt; art pending</span>
        </div>
      )}
      <div className="mono flex items-center justify-between border-b border-line bg-panel2 px-3 py-1.5 text-[10px]">
        <span className="text-dim">
          UNIT {unitNumber(project, allProjects)} ·{" "}
          {project.claimStatus === "unclaimed" ? (
            <span className="text-amber">UNCLAIMED</span>
          ) : (
            runStatusText(project)
          )}
        </span>
        <span className="text-amber">PRIO {project.priority}</span>
      </div>
      <div className="flex flex-1 flex-col p-3">
        <h3 className="text-sm font-semibold text-tx">{project.title}</h3>
        <p className="mono mt-1 text-[10px] text-dim">by {project.creator}</p>
        <p className="mono mt-2 line-clamp-2 text-[11px] leading-5 text-dim">{project.summary}</p>
        <div className="mono mt-auto pt-3">
          <div className="flex items-baseline justify-between">
            <span className="text-lg text-phos">{done}%</span>
            <span className="text-[10px] text-dim">
              {usd.format(project.funded)} / {usd.format(project.goal)}
            </span>
          </div>
          <div className="vbar mt-2">
            <i style={{ width: `${done}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-dim">
            <span>{project.supporters} patrons</span>
            <span>{project.deadline !== "—" ? project.deadline : "open"}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            <span className="mono border border-line px-2 py-0.5 text-[9px] uppercase tracking-[0.1em] text-dim">
              {project.category}
            </span>
            {project.claimStatus === "unclaimed" && project.originRepo && (
              <span className="mono border border-amber px-2 py-0.5 text-[9px] uppercase tracking-[0.1em] text-amber">
                claim it
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-line bg-panel2 px-4 py-4">
      <p className="mono text-2xl text-phos">{value}</p>
      <p className="mono mt-2 text-[11px] uppercase tracking-[0.12em] text-dim">{label}</p>
    </div>
  );
}

function Dashboard({
  activeProject,
  projects,
  totals,
  setActiveId,
  fundProject,
  runProjectCompute,
  busy,
  createProject,
}: {
  activeProject: Project;
  projects: Project[];
  totals: { funded: number; goal: number; supporters: number; runs: number };
  setActiveId: (id: string) => void;
  fundProject: (projectId: string, amount: number) => Promise<void>;
  runProjectCompute: (projectId: string) => Promise<void>;
  busy: boolean;
  createProject: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="mx-auto grid max-w-7xl gap-4 px-4 py-6 sm:px-6 lg:grid-cols-[300px_1fr_340px] lg:px-8">
      <aside className="space-y-4">
        <SectionHead label="NETWORK PULSE">
          <div className="grid grid-cols-2 gap-2 p-3">
            <PulseStat label="available" value={usd.format(totals.funded)} />
            <PulseStat label="goals" value={usd.format(totals.goal)} />
            <PulseStat label="patrons" value={String(totals.supporters)} />
            <PulseStat label="runs" value={String(totals.runs)} />
          </div>
        </SectionHead>

        <SectionHead label="MY UNITS">
          <div className="space-y-2 p-2">
            {projects.length === 0 ? (
              <p className="mono stream-line p-2">&gt; no units yet · register one on the right</p>
            ) : (
              projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => setActiveId(project.id)}
                  className={`block w-full border p-3 text-left transition ${
                    project.id === activeProject.id
                      ? "border-phos bg-panel2"
                      : "border-transparent hover:border-line hover:bg-panel2"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-tx">{project.title}</p>
                    <span className="mono shrink-0 text-[11px] text-amber">{project.priority}</span>
                  </div>
                  <p className="mono mt-2 text-[11px] text-dim">
                    {usd.format(project.funded)} / {usd.format(project.goal)}
                  </p>
                </button>
              ))
            )}
          </div>
        </SectionHead>
      </aside>

      <section className="space-y-4">
        <ControlPanel
          project={activeProject}
          fundProject={fundProject}
          runProjectCompute={runProjectCompute}
          busy={busy}
        />
        <ReceiptsAndLedger project={activeProject} />
      </section>

      <aside className="space-y-4">
        <CreateProjectPanel createProject={createProject} />
        <ManifestoPanel />
      </aside>
    </div>
  );
}

function SectionHead({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line bg-panel2 px-3 py-2">
        <span className="mono text-[11px] uppercase tracking-[0.14em] text-dim">
          <span className="live" />
          {label}
        </span>
      </div>
      {children}
    </section>
  );
}

function PulseStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-line bg-panel2 px-3 py-3">
      <p className="mono text-lg text-phos">{value}</p>
      <p className="mono mt-1 text-[11px] uppercase tracking-[0.1em] text-dim">{label}</p>
    </div>
  );
}

function Discovery({
  query,
  setQuery,
  projects,
  allProjects,
  selectedCats,
  onToggleCat,
  trending,
  votedKeys,
  onVoteProject,
  openProject,
  fundProject,
  followProject,
}: {
  query: string;
  setQuery: (query: string) => void;
  projects: Project[];
  allProjects: Project[];
  selectedCats: Category[];
  onToggleCat: (category: Category) => void;
  trending: TopVotedProject[];
  votedKeys: string[];
  onVoteProject: (projectId: string) => Promise<void>;
  openProject: (projectId: string) => void;
  fundProject: (projectId: string, amount: number) => Promise<void>;
  followProject: (projectId: string) => Promise<void>;
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mono flex flex-col gap-3 border border-line bg-panel2 px-4 py-3 lg:flex-row lg:items-center">
        <span className="text-[12px] text-phos">patron@commons:~$</span>
        <div className="flex flex-1 items-center gap-3 border border-line bg-panel px-3 py-2">
          <span className="hidden text-[12px] text-dim sm:inline">ls --open-for-funding</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="grep ..."
            className="mono w-full min-w-0 flex-1 bg-transparent text-[12px] text-tx outline-none placeholder:text-dim"
          />
        </div>
        <span className="text-[11px] text-dim">
          {projects.length} unit{projects.length === 1 ? "" : "s"} matched
        </span>
      </div>

      <div className="mt-3 border border-line bg-panel px-4 py-3">
        <CategoryFilter selected={selectedCats} onToggle={onToggleCat} />
      </div>

      {trending.length > 0 && (
        <div className="mono mt-3 border border-line bg-panel">
          <div className="border-b border-line bg-panel2 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-dim">
            <span className="live" />
            trending · community priority · last 7 days
          </div>
          <div className="divide-y divide-line">
            {trending.slice(0, 3).map((item) => (
              <button
                key={item.projectId}
                type="button"
                onClick={() => openProject(item.projectId)}
                className="flex w-full items-center justify-between gap-4 px-3 py-2 text-left text-[12px] text-dim transition hover:bg-panel2"
              >
                <span>
                  <span className="text-amber">▲</span> <span className="text-tx">{item.title}</span>
                </span>
                <span>{item.votes} votes</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-3">
        {projects.map((project) => (
          <ProjectUnit
            key={project.id}
            project={project}
            allProjects={allProjects}
            openProject={openProject}
            fundProject={fundProject}
            followProject={followProject}
            votedKeys={votedKeys}
            onVoteProject={onVoteProject}
          />
        ))}
        {projects.length === 0 && (
          <p className="mono stream-line col-span-3 border border-line bg-panel p-4">
            &gt; grep found nothing · clear the filter
          </p>
        )}
      </div>
    </div>
  );
}

function ProjectUnit({
  project,
  allProjects,
  openProject,
  fundProject,
  followProject,
  votedKeys,
  onVoteProject,
}: {
  project: Project;
  allProjects: Project[];
  openProject: (projectId: string) => void;
  fundProject: (projectId: string, amount: number) => Promise<void>;
  followProject: (projectId: string) => Promise<void>;
  votedKeys: string[];
  onVoteProject: (projectId: string) => Promise<void>;
}) {
  const [tier, setTier] = useState(100);
  const done = pct(project);
  const latest = project.runs[0];
  const milestoneVotes = project.milestones.reduce((sum, m) => sum + m.votes, 0);

  return (
    <article className="border border-line bg-panel">
      <div className="mono flex items-center justify-between gap-2 border-b border-line bg-panel2 px-3 py-2 text-[11px]">
        <span className="text-tx">
          <span className="live" />
          UNIT {unitNumber(project, allProjects)} · {runStatusText(project)}
        </span>
        <span className="text-amber">prio {project.priority}</span>
      </div>
      <h3 className="px-3 pt-3 text-base font-semibold tracking-tight text-tx">{project.title}</h3>
      <p className="mono px-3 pt-1 text-[11px] text-dim">
        {project.creator} · {project.category.toLowerCase()}
      </p>
      {project.claimStatus === "unclaimed" && project.originRepo && (
        <div className="mono mx-3 mt-2 border border-amber/60 px-3 py-2 text-[10px] leading-5 text-amber">
          ▸ INDEPENDENT MIRROR · creator has not endorsed this · tokens PARKED until a
          verified maintainer claims
          <button
            type="button"
            onClick={() => (window.location.href = "/auth")}
            className="ml-2 border border-amber px-2 py-0.5 uppercase tracking-[0.1em] transition hover:bg-amber/10"
          >
            maintainers: claim it
          </button>
        </div>
      )}

      <div className="mono mx-3 mt-3 border border-line bg-bg px-3 py-2 text-[11px]">
        <div className="stream-line">
          &gt; goal <b>{usd.format(project.goal)}</b> · deadline {project.deadline}
        </div>
        <div className="stream-line">
          &gt; committed <b>{usd.format(project.funded)}</b> by <b>{project.supporters}</b> patrons
        </div>
        {latest && (
          <>
            <div className="stream-line">
              &gt; {latest.status === "complete" ? "run" : "queued"} {latest.model}{" "}
              <b className="text-amber">−{usd.format(latest.cost)}</b>
            </div>
            {latest.status === "complete" ? (
              <div className="stream-line ok">✓ {latest.output}</div>
            ) : (
              <div className="stream-line">⟳ {latest.output}</div>
            )}
          </>
        )}
        {project.following && <div className="stream-line ok">✓ you follow this unit</div>}
      </div>

      <div className="mono mx-3 mt-3 flex items-baseline gap-3">
        <span className="text-[26px] text-phos">{done}%</span>
        <span className="text-[11px] text-dim">funded</span>
      </div>
      <div className="vbar mx-3 mt-2">
        <i style={{ width: `${done}%` }} />
      </div>

      <div className="mono mx-3 mt-2 flex items-center justify-between gap-3 pb-2 text-[11px] text-dim">
        <span>
          patrons <b className="font-medium text-tx">{project.supporters}</b> · ▲{" "}
          {milestoneVotes} milestone votes
        </span>
        <VoteButton
          count={milestoneVotes}
          hasVoted={votedKeys.includes(`p:${project.id}`)}
          onVote={() => void onVoteProject(project.id)}
        />
      </div>

      <div className="mono border-t border-line text-[11px]">
        {TIERS.map((amount, i) => (
          <button
            key={amount}
            type="button"
            onClick={() => setTier(amount)}
            className={`flex w-full items-center justify-between border-b border-line px-3 py-2 text-left transition ${
              tier === amount ? "bg-phos/10 text-tx" : "text-dim hover:bg-panel2"
            }`}
          >
            <span>
              {tier === amount ? "▸ " : ""}
              {TIER_NAMES[i]}
            </span>
            <span className={tier === amount ? "text-phos" : "text-tx"}>{usd.format(amount)}</span>
          </button>
        ))}
      </div>

      <div className="mono flex border-t border-line text-[11px] uppercase tracking-[0.08em]">
        <button
          type="button"
          onClick={() => followProject(project.id)}
          className="flex-1 border-r border-line py-2.5 text-tx transition hover:text-phos"
        >
          {project.following ? "unfollow" : "follow"}
        </button>
        <button
          type="button"
          onClick={() => openProject(project.id)}
          className="flex-1 border-r border-line py-2.5 text-tx transition hover:text-phos"
        >
          view receipts
        </button>
        <button
          type="button"
          onClick={() => fundProject(project.id, tier)}
          className="flex-1 bg-phos py-2.5 text-bg transition hover:opacity-90"
        >
          fund this run
        </button>
      </div>
    </article>
  );
}

function MyProjects({
  projects,
  allProjects,
  openProject,
  fundProject,
  votedKeys,
  onVoteProject,
  followProject,
}: {
  projects: Project[];
  allProjects: Project[];
  openProject: (projectId: string) => void;
  fundProject: (projectId: string, amount: number) => Promise<void>;
  votedKeys: string[];
  onVoteProject: (projectId: string) => Promise<void>;
  followProject: (projectId: string) => Promise<void>;
}) {
  const fundedProjects = projects.filter((project) => project.fundedByMe > 0);
  const followedProjects = projects.filter(
    (project) => project.following && project.fundedByMe === 0,
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mono border border-line bg-panel2 px-4 py-3 text-[12px] text-dim">
        &gt; your ledger of commitments · <b className="font-medium text-tx">funded</b> units issue
        updates to you; <b className="font-medium text-tx">followed</b> units are watch-list entries
      </div>

      <section className="mt-6">
        <h2 className="mono text-[11px] uppercase tracking-[0.16em] text-dim">
          <span className="live" />
          funded ({fundedProjects.length})
        </h2>
        <div className="mt-3 grid items-start gap-4 lg:grid-cols-3">
          {fundedProjects.length === 0 ? (
            <EmptyPanel text="no funded units yet · fund one from discover to start the stream" />
          ) : (
            fundedProjects.map((project) => (
              <ProjectUnit
                key={project.id}
                project={project}
                allProjects={allProjects}
                openProject={openProject}
                fundProject={fundProject}
                followProject={followProject}
                votedKeys={votedKeys}
                onVoteProject={onVoteProject}
              />
            ))
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mono text-[11px] uppercase tracking-[0.16em] text-dim">
          <span className="live" />
          following ({followedProjects.length})
        </h2>
        <div className="mt-3 grid items-start gap-4 lg:grid-cols-3">
          {followedProjects.length === 0 ? (
            <EmptyPanel text="no followed units yet · follow a unit to put it on the watch-list" />
          ) : (
            followedProjects.map((project) => (
              <ProjectUnit
                key={project.id}
                project={project}
                allProjects={allProjects}
                openProject={openProject}
                fundProject={fundProject}
                followProject={followProject}
                votedKeys={votedKeys}
                onVoteProject={onVoteProject}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function ProjectLanding({
  project,
  allProjects,
  setView,
  fundProject,
  runProjectCompute,
  followProject,
  votedKeys,
  onVoteMilestone,
  onCompleteMilestone,
  onRunMilestone,
  onRateTeam,
  onProposeMilestone,
  onSaveSplits,
  busy = false,
  authed = false,
  canEditSplits = false,
}: {
  project: Project;
  allProjects: Project[];
  setView: (view: View) => void;
  fundProject: (projectId: string, amount: number) => Promise<void>;
  runProjectCompute: (projectId: string) => Promise<void>;
  followProject: (projectId: string) => Promise<void>;
  votedKeys: string[];
  onVoteMilestone: (projectId: string, milestone: Milestone) => Promise<void>;
  onCompleteMilestone: (milestone: Milestone) => Promise<void>;
  onRunMilestone: (
    projectId: string,
    milestone: Milestone,
    meta: { promptTemplate: string; provider: string; model: string },
  ) => Promise<void>;
  onRateTeam: (milestone: Milestone, rating: number, review: string) => Promise<void>;
  onProposeMilestone: (projectId: string, values: MilestoneFormValues) => Promise<void>;
  onSaveSplits: (projectId: string, splits: SplitLine[]) => Promise<void>;
  busy?: boolean;
  authed?: boolean;
  canEditSplits?: boolean;
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={() => setView("discover")}
        className="mono border border-line bg-panel px-3 py-2 text-[11px] uppercase tracking-[0.08em] text-tx transition hover:border-phos"
      >
        &lt; back to commons
      </button>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[1fr_340px]">
        <article className="overflow-hidden border border-line bg-panel">
          <div className="bg-bg px-5 py-10">
            <div className="mono text-[11px] text-dim">
              <span className="live" />
              UNIT {unitNumber(project, allProjects)} · {runStatusText(project)} ·{" "}
              <span className="text-amber">prio {project.priority}</span>
            </div>
            <h1 className="display mt-4 text-4xl font-semibold tracking-tight">{project.title}</h1>
            <p className="mono mt-3 text-[12px] text-dim">
              by {project.creator} · {project.category.toLowerCase()} · deadline {project.deadline}
            </p>
            <div className="mono mt-6 flex items-baseline gap-3">
              <span className="text-[40px] leading-none text-phos">{pct(project)}%</span>
              <span className="text-[12px] text-dim">funded</span>
            </div>
            <div className="vbar mt-2">
              <i style={{ width: `${pct(project)}%` }} />
            </div>
          </div>

          <div className="border-t border-line p-5">
            <h2 className="mono text-[11px] uppercase tracking-[0.16em] text-dim">the problem</h2>
            <p className="mt-3 text-base leading-8 text-tx">{project.story}</p>

            <h2 className="mono mt-8 text-[11px] uppercase tracking-[0.16em] text-dim">
              milestone queue · community priority
            </h2>
            <div className="mt-3">
              <MilestoneList
                projectId={project.id}
                milestones={project.milestones}
                teamNames={
                  project.team ? { [project.team.id]: project.team.name } : undefined
                }
                onComplete={(m) => void onCompleteMilestone(m)}
                onRunCompute={(m, meta) =>
                  void onRunMilestone(project.id, m, {
                    ...meta,
                    model: meta.provider === "openai" ? "gpt-4o-mini" : meta.model,
                  })
                }
                onVote={(m) => void onVoteMilestone(project.id, m)}
              />
            </div>

            {/* completed milestones → public team rating (plan Task 11) */}
            {project.milestones
              .filter((m) => m.status === "complete")
              .map((m) => (
                <div key={`rating-${m.id}`} className="mt-3 border border-line bg-panel p-3">
                  <p className="mono text-[11px] uppercase tracking-[0.14em] text-dim">
                    <span className="live" />
                    rate this team · {m.title}
                  </p>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    {project.team ? (
                      <TeamRating
                        profile={project.team}
                        reviews={
                          // recent reviews arrive from the ratings layer on next load
                          []
                        }
                      />
                    ) : (
                      <p className="mono text-[11px] text-dim">&gt; no team profile on record</p>
                    )}
                    <div>
                      <RatingForm onSubmit={(rating, review) => onRateTeam(m, rating, review)} />
                      {votedKeys.includes(`r:${m.id}`) && (
                        <p className="mono mt-2 text-[11px] text-phos">
                          ✓ rating logged · one rating per patron per milestone
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}

            <h2 className="mono mt-8 text-[11px] uppercase tracking-[0.16em] text-dim">
              official updates · machine voice
            </h2>
            <div className="mono mt-3 border border-line bg-bg px-3 py-2 text-[11px]">
              {project.runs.length === 0 ? (
                <div className="stream-line">&gt; no runs on the record yet</div>
              ) : (
                project.runs.map((run) => (
                  <div key={run.id}>
                    <div className="stream-line">
                      &gt; {run.timestamp} · {run.model} ·{" "}
                      <b>{run.status === "complete" ? "complete" : "queued"}</b>
                    </div>
                    <div className={`stream-line ${run.status === "complete" ? "ok" : ""}`}>
                      {run.status === "complete" ? "✓ " : "⟳ "}
                      {run.output}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </article>

        <aside className="space-y-4">
          <ControlPanel
            project={project}
            fundProject={fundProject}
            runProjectCompute={runProjectCompute}
            followProject={followProject}
            compact
            busy={busy}
          />
          <ReceiptsAndLedger project={project} compact />

          {/* milestone proposer (plan Task 6) — sign-in surfaces at the interaction */}
          {authed ? (
            <MilestoneForm
              projectId={project.id}
              onSubmit={(values) => onProposeMilestone(project.id, values)}
            />
          ) : (
            <div className="mono border border-line bg-panel p-3 text-[11px] text-dim">
              &gt; propose a milestone: <a href="/auth" className="text-phos">sign in</a> (creators
              open milestones for community vote)
            </div>
          )}

          {/* plugin/dependency revenue splits (plan Task 13) */}
          <SectionHead label="REVENUE SPLITS">
            <div className="p-3">
              {canEditSplits ? (
                <PluginSplitEditor
                  initialSplits={project.pluginSplits.map((s) => ({
                    pluginName: s.pluginName,
                    pluginOwner: s.pluginOwner,
                    splitPercentage: s.splitPercentage,
                    isRequired: s.isRequired,
                  }))}
                  onChange={(splits) => void onSaveSplits(project.id, splits)}
                />
              ) : (
                <PluginSplitEditor
                  initialSplits={project.pluginSplits.map((s) => ({
                    pluginName: s.pluginName,
                    pluginOwner: s.pluginOwner,
                    splitPercentage: s.splitPercentage,
                    isRequired: s.isRequired,
                  }))}
                  readOnly
                />
              )}
            </div>
          </SectionHead>

          <SectionHead label="CAMPAIGN DETAILS">
            <dl className="mono space-y-2 p-3 text-[11px]">
              {[
                ["unit id", unitNumber(project, allProjects)],
                ["deadline", project.deadline],
                ["patrons", String(project.supporters)],
                ["priority signal", String(project.priority)],
                ["runs on record", String(project.runs.length)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4">
                  <dt className="text-dim">&gt; {label}</dt>
                  <dd className="text-tx">{value}</dd>
                </div>
              ))}
            </dl>
          </SectionHead>
        </aside>
      </div>
    </div>
  );
}

function ControlPanel({
  project,
  fundProject,
  runProjectCompute,
  followProject,
  compact = false,
  busy = false,
}: {
  project: Project;
  fundProject: (projectId: string, amount: number) => Promise<void>;
  runProjectCompute?: (projectId: string) => Promise<void>;
  followProject?: (projectId: string) => void;
  compact?: boolean;
  busy?: boolean;
}) {
  return (
    <div className="border border-line bg-panel">
      <div className="mono flex items-center justify-between border-b border-line bg-panel2 px-3 py-2 text-[11px] text-dim">
        <span>
          <span className="live" />
          CONTROL PANEL · {runStatusText(project)}
        </span>
        <span className="text-amber">prio {project.priority}</span>
      </div>

      <div className="p-4">
        <h2
          className={`display font-semibold tracking-tight text-tx ${compact ? "text-2xl" : "text-3xl"}`}
        >
          {project.title}
        </h2>
        <p className="mono mt-2 text-[12px] text-dim">
          {project.category.toLowerCase()} · by {project.creator}
        </p>
        <p className="mt-3 text-sm leading-6 text-dim">{project.summary}</p>

        <div className="mono mt-5 flex items-baseline gap-4">
          <span className="text-2xl text-phos">{pct(project)}%</span>
          <span className="text-[11px] text-dim">
            {usd.format(project.funded)} available of {usd.format(project.goal)} goal
          </span>
        </div>
        <div className="vbar mt-2">
          <i style={{ width: `${pct(project)}%` }} />
        </div>

        <div className="mono mt-4 border border-line text-[11px]">
          {TIERS.map((amount, i) => (
            <div
              key={amount}
              className="flex items-center justify-between border-b border-line px-3 py-2 text-dim last:border-b-0"
            >
              <span>{TIER_NAMES[i]}</span>
              <span className="text-tx">{usd.format(amount)}</span>
            </div>
          ))}
        </div>

        <div className="mono mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.08em]">
          {TIERS.map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => fundProject(project.id, amount)}
              className="border border-line bg-panel px-4 py-2.5 text-tx transition hover:border-phos hover:text-phos"
            >
              fund {usd.format(amount)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => (runProjectCompute ? void runProjectCompute(project.id) : undefined)}
            disabled={busy}
            className="border border-phos bg-phos px-4 py-2.5 text-bg transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "running..." : "run compute"}
          </button>
          {followProject && (
            <button
              type="button"
              onClick={() => followProject(project.id)}
              className="border border-line bg-panel px-4 py-2.5 text-tx transition hover:border-phos hover:text-phos"
            >
              {project.following ? "following" : "follow"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ReceiptsAndLedger({ project, compact = false }: { project: Project; compact?: boolean }) {
  return (
    <div className={`grid gap-4 ${compact ? "" : "lg:grid-cols-2"}`}>
      <section className="border border-line bg-panel">
        <div className="flex items-center justify-between border-b border-line bg-panel2 px-3 py-2">
          <span className="mono text-[11px] uppercase tracking-[0.14em] text-dim">
            <span className="live" />
            COMPUTE RECEIPTS
          </span>
        </div>
        <div className="mono divide-y divide-line px-3 py-2 text-[11px]">
          {project.runs.length === 0 ? (
            <div className="stream-line">&gt; no runs yet · fund the unit, then run compute</div>
          ) : (
            project.runs.map((run) => (
              <div key={run.id} className="py-2">
                <div className="stream-line">
                  &gt; run {run.model} · <b>{run.prompt}</b>
                </div>
                <div className={`stream-line ${run.status === "complete" ? "ok" : ""}`}>
                  {run.status === "complete" ? "✓ " : "⟳ "}
                  {run.output} · <span className="text-amber">−{usd.format(run.cost)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="border border-line bg-panel">
        <div className="flex items-center justify-between border-b border-line bg-panel2 px-3 py-2">
          <span className="mono text-[11px] uppercase tracking-[0.14em] text-dim">
            <span className="live" />
            CREDIT LEDGER
          </span>
        </div>
        <div className="mono divide-y divide-line px-3 py-2 text-[11px]">
          {project.ledger.length === 0 ? (
            <div className="stream-line">
              &gt; ledger empty · funding, compute spend, and receipts land here
            </div>
          ) : (
            project.ledger.map((entry) => (
              <div
                key={entry.id}
                className="stream-line flex items-center justify-between gap-4 py-2"
              >
                <span>
                  &gt; {entry.label} <b className="font-medium text-tx">· {entry.timestamp}</b>
                </span>
                <span className={entry.amount < 0 ? "text-red" : "text-phos"}>
                  {entry.amount === 0
                    ? "receipt ✓"
                    : `${entry.amount > 0 ? "+" : "−"}${usd.format(Math.abs(entry.amount))}`}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function CreateProjectPanel({
  createProject,
}: {
  createProject: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="border border-line bg-panel">
      <div className="border-b border-line bg-panel2 px-3 py-2">
        <span className="mono text-[11px] uppercase tracking-[0.14em] text-dim">
          <span className="live" />
          REGISTER NEW UNIT
        </span>
      </div>
      <form className="mono space-y-3 p-3 text-[12px]" onSubmit={createProject}>
        <label className="block">
          <span className="text-dim">&gt; unit title</span>
          <input
            name="title"
            required
            placeholder="ai malaria triage sprint"
            className="mt-1 w-full border border-line bg-bg px-3 py-2 text-tx outline-none transition placeholder:text-dim focus:border-phos"
          />
        </label>
        <label className="block">
          <span className="text-dim">&gt; compute goal (usd)</span>
          <input
            name="goal"
            type="number"
            min="100"
            step="100"
            defaultValue="5000"
            className="mt-1 w-full border border-line bg-bg px-3 py-2 text-tx outline-none transition focus:border-phos"
          />
        </label>
        <label className="block">
          <span className="text-dim">&gt; the problem</span>
          <textarea
            name="summary"
            required
            rows={4}
            placeholder="describe the problem, why compute helps, and what supporters will see"
            className="mt-1 w-full resize-none border border-line bg-bg px-3 py-2 leading-6 text-tx outline-none transition placeholder:text-dim focus:border-phos"
          />
        </label>
        <button
          type="submit"
          className="mono w-full border border-phos bg-phos py-2.5 text-[11px] uppercase tracking-[0.08em] text-bg transition hover:opacity-90"
        >
          add unit to the commons
        </button>
      </form>
    </section>
  );
}

function ManifestoPanel() {
  return (
    <section className="border border-phos bg-panel">
      <div className="border-b border-line bg-panel2 px-3 py-2">
        <span className="mono text-[11px] uppercase tracking-[0.14em] text-dim">
          MANIFESTO LOCK
        </span>
      </div>
      <div className="mono p-3 text-[12px] leading-6 text-dim">
        <p>
          &gt; the platform does not sell equity, profit rights, or investment tokens. it sells
          accountable compute sponsorship: money in, credits issued, runs executed, receipts
          published, supporters recognized.
        </p>
        <p className="mt-2 text-phos">
          ✓ patronage mode · investors: <span className="text-red">none</span>
        </p>
      </div>
    </section>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <p className="mono col-span-3 border border-dashed border-line bg-panel p-4 text-[12px] text-dim">
      &gt; {text}
    </p>
  );
}