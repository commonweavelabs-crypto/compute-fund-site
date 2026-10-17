# Compute Fund v0 -> v1 Launch Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Ship Compute Fund v1 — a community-funded LLM token platform where users fund AI compute for real-world problems, teams execute milestones, and the community votes on what gets researched.

**Architecture:** Next.js 16 + React 19 + Tailwind v4 frontend. Supabase for database/auth. Stripe for payments. OpenAI-compatible API for LLM provider routing. The v0 prototype already has working UI (1093-line page.tsx), Stripe checkout/webhook routes, and a Supabase schema. We need to add: milestones, token efficiency incentives, community voting, team ratings, plugin/dependency revenue splitting, and a public linktree landing page.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, Supabase (Postgres + Auth), Stripe, Zod validation

**Current State (v0):**
- Working Next.js app at `C:\Users\Guilherme\AppData\Local\hermes\projects\compute-fund-v0\`
- 3 seed projects with mock data (Astra Math, Rural Clinic, Bug Bounty Agent)
- Dashboard, Discovery, My Projects, Project Landing views
- Stripe checkout route (`src/app/api/stripe/checkout/route.ts`)
- Stripe webhook route (`src/app/api/stripe/webhook/route.ts`) — logs but doesn't persist to Supabase yet (TODO comment at line 59)
- Supabase schema (`supabase-schema.sql`) — profiles, projects, ledger_entries, compute_runs, supporter_receipts
- Optimistic local funding (works without Stripe configured)
- No auth, no milestones, no voting, no ratings, no token tracking

**Working directory:** `C:\Users\Guilherme\AppData\Local\hermes\projects\compute-fund-v0\`

---

## Phase 1: Foundation — Supabase + Auth (Tasks 1-4)

### Task 1: Install Supabase client and configure environment

**Objective:** Add Supabase client library and environment variables.

**Files:**
- Create: `src/lib/supabase-client.ts`
- Modify: `package.json` (add `@supabase/supabase-js`)
- Create: `.env.local` (gitignored)
- Modify: `.env.example`

**Step 1:** Install Supabase client
```bash
cd "C:/Users/Guilherme/AppData/Local/hermes/projects/compute-fund-v0" && npm install @supabase/supabase-js
```

**Step 2:** Create `src/lib/supabase-client.ts`
```typescript
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

**Step 3:** Add to `.env.example`:
```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
STRIPE_SECRET_KEY=your-stripe-secret
STRIPE_WEBHOOK_SECRET=your-webhook-secret
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your-publishable-key
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

**Step 4:** Create `.env.local` with placeholder values for local dev.

**Step 5:** Verify build: `npm run build` — should pass with no errors.

---

### Task 2: Extend Supabase schema with milestones, votes, ratings, and token tracking

**Objective:** Add the new tables needed for milestones, community voting, team ratings, token estimates vs actuals, and plugin revenue splits.

**Files:**
- Create: `supabase-schema-v1.sql`
- Modify: `supabase-schema.sql` (keep original as reference)

**Step 1:** Write `supabase-schema-v1.sql` with new tables:

```sql
-- Extend profiles with team rating
alter table public.profiles add column if not exists
  team_rating integer not null default 0,
  is_team boolean not null default false;

-- Milestones table
create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  description text not null,
  success_criteria text not null,
  estimated_tokens integer not null check (estimated_tokens > 0),
  actual_tokens integer,
  status text not null default 'proposed' check (status in ('proposed', 'funded', 'active', 'complete', 'failed')),
  assigned_team_id uuid references public.profiles(id),
  deadline timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Community votes on milestones/projects
create table public.community_votes (
  id uuid primary key default gen_random_uuid(),
  voter_id uuid not null references public.profiles(id) on delete cascade,
  milestone_id uuid references public.milestones(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  vote_weight integer not null default 1,
  created_at timestamptz not null default now(),
  unique(voter_id, milestone_id),
  unique(voter_id, project_id)
);

-- Team ratings (community rates teams after milestone completion)
create table public.team_ratings (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.profiles(id) on delete cascade,
  rater_id uuid not null references public.profiles(id) on delete cascade,
  milestone_id uuid references public.milestones(id) on delete cascade,
  rating integer not null check (rating >= 1 and rating <= 5),
  review text,
  created_at timestamptz not null default now(),
  unique(rater_id, milestone_id)
);

-- Plugin/dependency revenue splits
create table public.plugin_splits (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  plugin_name text not null,
  plugin_owner text,
  split_percentage numeric not null check (split_percentage >= 0 and split_percentage <= 100),
  is_required boolean not null default false,
  created_at timestamptz not null default now()
);

-- Token ledger (tracks estimated vs actual token usage)
create table public.token_ledger (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references public.milestones(id) on delete cascade,
  provider text not null,
  model text not null,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  cost_usd numeric not null default 0,
  receipt_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Project categories for discovery
create table public.project_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  icon text,
  created_at timestamptz not null default now()
);

-- Insert default categories
insert into public.project_categories (name, description) values
  ('Research', 'Academic and scientific research problems'),
  ('Public Good', 'Civic and community-benefit projects'),
  ('Developer Tools', 'Tools and infrastructure for developers'),
  ('Video Creation', 'AI video generation and creative projects'),
  ('Math & Verification', 'Mathematical proofs and verification'),
  ('Open Source', 'Funded open source development'),
  ('AI Safety', 'AI alignment and safety research');
```

**Step 2:** Verify SQL is valid by running through Supabase SQL editor (or local Postgres if available).

---

### Task 3: Add Supabase auth (email/password + GitHub OAuth)

**Objective:** Let users sign up, log in, and have a profile. Teams have `is_team=true`.

**Files:**
- Create: `src/lib/auth.tsx` (Auth context provider)
- Create: `src/components/auth/SignupForm.tsx`
- Create: `src/components/auth/LoginForm.tsx`
- Create: `src/app/auth/page.tsx` (auth page)
- Modify: `src/app/layout.tsx` (wrap with AuthProvider)

**Step 1:** Create auth context that wraps the app, exposes `user`, `profile`, `signIn`, `signUp`, `signOut`.

**Step 2:** Create signup/login forms with email + password. On signup, insert into `profiles` table.

**Step 3:** Add a "Sign up as Team" toggle that sets `is_team=true`.

**Step 4:** Add GitHub OAuth button (for developer-friendly signup).

**Step 5:** Wrap `layout.tsx` with `<AuthProvider>`.

**Step 6:** Verify: navigate to `/auth`, create account, see profile in Supabase.

---

### Task 4: Wire Stripe webhook to persist funding to Supabase

**Objective:** Replace the TODO in the webhook handler with actual Supabase writes.

**Files:**
- Modify: `src/app/api/stripe/webhook/route.ts` (lines 47-68)

**Step 1:** Import supabase admin client (service role key, not anon).

**Step 2:** On `checkout.session.completed`:
- Insert into `ledger_entries` (kind: 'funding', amount, project_id)
- Insert into `supporter_receipts` (stripe_payment_intent, amount, supporter email)
- Update `projects` table: increment `compute_balance_cents` and `supporter_count`

**Step 3:** Add error handling — if Supabase write fails, log error but still return 200 to Stripe (don't cause retries).

**Step 4:** Test with Stripe CLI: `stripe trigger checkout.session.completed`

---

## Phase 2: Milestones + Token Efficiency (Tasks 5-9)

### Task 5: Create Milestone type and data layer

**Objective:** Add TypeScript types and Supabase CRUD functions for milestones.

**Files:**
- Create: `src/types/milestone.ts`
- Create: `src/lib/milestones.ts`

**Step 1:** Define `Milestone` type with: id, projectId, title, description, successCriteria, estimatedTokens, actualTokens, status, assignedTeamId, deadline, tokenLedger entries.

**Step 2:** Create CRUD functions: `createMilestone`, `getMilestones`, `updateMilestone`, `completeMilestone`.

**Step 3:** `completeMilestone` calculates: `leftoverTokens = estimatedTokens - actualTokens`. If leftover > 0 and status = complete, mark as "team reward" in token ledger.

**Step 4:** Verify types compile: `npx tsc --noEmit`

---

### Task 6: Add Milestone UI components

**Objective:** Build the UI for viewing, creating, and completing milestones on a project page.

**Files:**
- Create: `src/components/milestones/MilestoneList.tsx`
- Create: `src/components/milestones/MilestoneCard.tsx`
- Create: `src/components/milestones/MilestoneForm.tsx`
- Modify: `src/app/page.tsx` (add milestones section to project view)

**Step 1:** `MilestoneCard` shows: title, status badge, estimated vs actual tokens, progress bar, success criteria, assigned team, deadline.

**Step 2:** `MilestoneForm` (for project creators): title, description, success criteria, estimated tokens, deadline. Zod validation.

**Step 3:** `MilestoneList` renders all milestones for a project, sorted by status (active first, then proposed, then complete).

**Step 4:** Add to project landing page: below the funding section, show milestones.

**Step 5:** Verify: create a milestone on a seed project, see it render.

---

### Task 7: Token efficiency display — estimates vs actuals

**Objective:** Publicly show the estimated vs actual token usage for each milestone.

**Files:**
- Create: `src/components/milestones/TokenEfficiencyBar.tsx`
- Modify: `src/components/milestones/MilestoneCard.tsx`

**Step 1:** `TokenEfficiencyBar` is a visual component: two bars side by side (estimated = gray, actual = green if under, red if over).

**Step 2:** If milestone is complete and `actualTokens < estimatedTokens`, show "Team saved X% — leftover tokens rewarded to team" badge.

**Step 3:** If milestone failed (ran out of tokens), show "Project exceeded estimate by X%" warning.

**Step 4:** This data is PUBLIC — visible to all visitors, not just logged-in users.

**Step 5:** Verify: complete a milestone with actual < estimated, see the efficiency badge.

---

### Task 8: Leftover token allocation

**Objective:** When a team completes a milestone under budget, allocate leftover tokens to the team.

**Files:**
- Modify: `src/lib/milestones.ts` (completeMilestone function)
- Create: `src/lib/token-allocation.ts`

**Step 1:** `allocateLeftoverTokens(milestoneId)`:
- Calculate `leftover = estimated - actual`
- If leftover > 0: create token_ledger entry with kind "team_reward"
- Update team profile: add to a `token_balance` column (need to add to schema)

**Step 2:** Add `token_balance` to profiles schema (alter table).

**Step 3:** Team can use leftover tokens for:
- Stack: transfer to their next milestone (increase its estimated_tokens)
- Transfer: send to another team's project
- External: withdraw (future feature, for now just track balance)

**Step 4:** Verify: complete milestone under budget, check team token_balance increased.

---

### Task 9: Compute run receipts with real token tracking

**Objective:** When a compute run happens, track actual token usage and cost.

**Files:**
- Create: `src/lib/compute-runner.ts`
- Modify: `src/app/api/stripe/webhook/route.ts` (no change needed, separate path)

**Step 1:** `runCompute(milestoneId, prompt, provider, model)`:
- Call the LLM provider API (OpenAI/Anthropic/xAI)
- Capture `usage.prompt_tokens` and `usage.completion_tokens` from response
- Insert into `token_ledger` with actual token counts
- Update milestone `actual_tokens` = sum of all token_ledger entries for that milestone
- Generate public receipt (prompt, provider, model, tokens, cost, output summary)

**Step 2:** Receipt is PUBLIC — shown on the milestone card. Anyone can see what was asked, what model was used, how many tokens it cost, and the output.

**Step 3:** Add a "Run Compute" button on active milestones (only project creator/team).

**Step 4:** Verify: run a compute call, see receipt appear, see actual_tokens update.

---

## Phase 3: Community + Ratings (Tasks 10-14)

### Task 10: Community voting on milestones

**Objective:** Let the community vote on which proposed milestones should be funded/activated next.

**Files:**
- Create: `src/components/community/VoteButton.tsx`
- Create: `src/lib/votes.ts`
- Modify: `src/components/milestones/MilestoneCard.tsx`

**Step 1:** `VoteButton` on proposed milestones — upvote/downvote, shows vote count.

**Step 2:** `castVote(voterId, milestoneId, weight)` — inserts into `community_votes`. One vote per user per milestone.

**Step 3:** Milestones with more votes rise to top of the list and get a "Community Priority" badge.

**Step 4:** Project-level voting too — vote on which projects deserve attention.

**Step 5:** Verify: vote on a milestone, see count increase, see ordering change.

---

### Task 11: Team rating system

**Objective:** After a milestone completes, the community can rate the team's performance.

**Files:**
- Create: `src/components/ratings/TeamRating.tsx`
- Create: `src/components/ratings/RatingForm.tsx`
- Create: `src/lib/ratings.ts`

**Step 1:** `RatingForm` appears on completed milestones — 1-5 stars + optional review text. Only logged-in users can rate. One rating per user per milestone.

**Step 2:** `submitRating(raterId, teamId, milestoneId, rating, review)` — inserts into `team_ratings`.

**Step 3:** Team profile shows aggregate rating (average + count) and recent reviews.

**Step 4:** Low-rated teams (avg < 2.5) get a "Needs Improvement" badge. High-rated teams (avg >= 4.5) get a "Top Performer" badge.

**Step 5:** Verify: complete a milestone, rate the team, see rating on team profile.

---

### Task 12: Project discovery page with categories and search

**Objective:** Improve the Discovery view with categories, filters, and trending projects.

**Files:**
- Modify: `src/app/page.tsx` (Discovery component)
- Create: `src/components/discovery/CategoryFilter.tsx`
- Create: `src/components/discovery/ProjectGrid.tsx`
- Create: `src/components/discovery/TrendingSection.tsx`

**Step 1:** `CategoryFilter` — chips for each category (Research, Public Good, Developer Tools, Video Creation, etc.). Multi-select.

**Step 2:** `ProjectGrid` — responsive card grid showing project title, summary, funded %, supporter count, top milestone status.

**Step 3:** `TrendingSection` — top 3 projects by vote count this week.

**Step 4:** Search bar filters by title, creator, category, summary (already exists in v0, enhance it).

**Step 5:** Verify: filter by category, see filtered grid, search works.

---

### Task 13: Plugin/dependency revenue splits UI

**Objective:** Project creators can designate plugin/dependency splits when creating a project.

**Files:**
- Create: `src/components/plugins/PluginSplitEditor.tsx`
- Create: `src/lib/plugins.ts`
- Modify: `src/components/ProjectForm` (add to project creation flow)

**Step 1:** `PluginSplitEditor` — add plugins by name, set split percentage. Required plugins (like ComfyUI) get higher percentages. Total splits must sum to <= 100% (rest goes to the project team).

**Step 2:** Show on project page: "This project shares X% with: ComfyUI (Y%), Obsidian (Z%)".

**Step 3:** When compute runs, calculate the split — how much of the funding goes to each plugin maintainer.

**Step 4:** Default suggestion: required dependencies get 10% each, project team gets the rest.

**Step 5:** Verify: create project with ComfyUI at 10%, see split on project page.

---

### Task 14: Public linktree landing page

**Objective:** A simple, shareable landing page with all our links — GitHub, YouTube, X, Compute Fund, ComfyUI Video UI.

**Files:**
- Create: `src/app/links/page.tsx`
- Create: `src/components/LinkTree.tsx`

**Step 1:** `LinkTree` component — list of links with icons, titles, descriptions. Clean, mobile-first design. Green theme matching Compute Fund.

**Step 2:** Links to include:
- Compute Fund platform (this app)
- ComfyUI Video UI (GitHub repo when ready)
- GitHub organization
- YouTube channel
- X/Twitter
- Discord/community (when ready)

**Step 3:** Donation CTA at top: "Support our work — fund AI compute for real problems" linking to the Compute Fund.

**Step 4:** Accessible at `/links` — short URL for sharing on social media.

**Step 5:** Verify: navigate to `/links`, see all links, click through.

---

## Phase 4: Launch Prep (Tasks 15-18)

### Task 15: Replace mock data with Supabase queries

**Objective:** Remove the `initialProjects` hardcoded array and load from Supabase.

**Files:**
- Modify: `src/app/page.tsx` (remove initialProjects, add useEffect to fetch)
- Create: `src/lib/projects.ts`

**Step 1:** `getProjects()` — fetch all active projects from Supabase with their milestones, ledger entries, and plugin splits.

**Step 2:** `getProject(id)` — fetch single project with full detail.

**Step 3:** Fallback: if Supabase is not configured (no env vars), use mock data so local dev still works.

**Step 4:** Loading states — skeleton loaders while fetching.

**Step 5:** Verify: with Supabase configured, see real data. Without, see mock data.

---

### Task 16: Supabase project creation flow

**Objective:** When a user creates a project, persist it to Supabase (not just local state).

**Files:**
- Modify: `src/app/page.tsx` (createProject function)
- Create: `src/lib/projects.ts` (createProject function)

**Step 1:** `createProject(creatorId, title, summary, goal, category)` — inserts into Supabase `projects` table.

**Step 2:** Also create initial plugin splits if specified.

**Step 3:** Redirect to the new project's landing page after creation.

**Step 4:** Only logged-in users can create projects.

**Step 5:** Verify: create project, see it in Supabase, see it in Discovery.

---

### Task 17: SEO + meta tags + Open Graph

**Objective:** Make the platform shareable on social media with proper link previews.

**Files:**
- Modify: `src/app/layout.tsx` (metadata export)
- Create: `src/app/opengraph-image.tsx` (dynamic OG image)
- Create: `src/app/robots.ts`
- Create: `src/app/sitemap.ts`

**Step 1:** Add metadata: title, description, OG tags, Twitter card.

**Step 2:** Dynamic OG image showing project title + funded amount.

**Step 3:** `robots.ts` — allow all crawlers.

**Step 4:** `sitemap.ts` — list all public project pages.

**Step 5:** Verify: share link on social, see preview card.

---

### Task 18: Deploy to Vercel + Stripe webhook setup

**Objective:** Get the platform live on the internet.

**Files:**
- Modify: `next.config.ts` (if needed for Vercel)
- Create: `DEPLOY.md`

**Step 1:** Push to GitHub repo (create `compute-fund` repo under Gui's account).

**Step 2:** Connect to Vercel, set environment variables (Supabase URL, anon key, Stripe keys, base URL).

**Step 3:** Set up Stripe webhook endpoint in Stripe dashboard pointing to `https://[domain]/api/stripe/webhook`.

**Step 4:** Run Supabase schema migration (v1) against production Supabase instance.

**Step 5:** Smoke test: create account, create project, fund it (test Stripe mode), see ledger entry, create milestone, run compute, rate team.

**Step 6:** Update the `/links` page with the live URL.

---

## Implementation Order + Timeline

| Phase | Tasks | Focus | Priority |
|---|---|---|---|
| 1 | 1-4 | Foundation: Supabase, auth, Stripe persistence | CRITICAL |
| 2 | 5-9 | Milestones + token efficiency + compute runs | CRITICAL |
| 3 | 10-14 | Community voting, ratings, plugin splits, linktree | HIGH |
| 4 | 15-18 | Real data, SEO, deploy | LAUNCH |

**Bootstrap sequence:**
1. Ship ComfyUI Video UI MVP (separate session)
2. Create linktree page (Task 14) — first thing shareable
3. Phase 1 + 2 of Compute Fund — core platform works
4. Start advertising: share linktree + Video UI on social media
5. Phase 3 — community features as users arrive
6. Phase 4 — deploy and go live

## Key Design Decisions

- **Token estimates are public** — every visitor sees what a milestone was estimated to cost and what it actually cost
- **Leftover tokens = team reward** — incentivizes efficiency, teams keep the difference
- **Ratings deter copycats** — underpriced projects that fail get bad ratings, self-correcting market
- **Popular projects can charge more** — community willingly overfunds projects they're excited about
- **Plugin splits are transparent** — visitors see exactly how much goes to ComfyUI, Obsidian, etc.
- **Platform fee % via community vote** — not hardcoded, democratic
- **No Hermes dependency** — this is a standalone Next.js app, deployable anywhere

## Risks

- **Supabase free tier** — 500MB database, 50K monthly active users. Should be fine for launch.
- **Stripe fees** — 2.9% + 30c per transaction. Need to factor into pricing model.
- **LLM provider costs** — token costs vary by model. Need a provider adapter layer that routes to cheapest capable model.
- **Auth complexity** — Supabase auth is straightforward but needs careful session handling in Next.js 16.
- **Next.js 16 breaking changes** — the AGENTS.md warns that this version has breaking changes from training data. Read `node_modules/next/dist/docs/` before writing code.