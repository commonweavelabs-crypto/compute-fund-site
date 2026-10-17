-- Compute Fund v1 schema extension.
-- Run AFTER supabase-schema.sql (base: profiles, projects, ledger_entries, compute_runs, supporter_receipts).
-- Mirrors src/types/compute-fund.ts.

-- profiles extension: team flag + rating + leftover-token balance (plan Task 8)
alter table public.profiles add column if not exists team_rating integer not null default 0;
alter table public.profiles add column if not exists is_team boolean not null default false;
alter table public.profiles add column if not exists token_balance integer not null default 0;
alter table public.profiles add column if not exists email text;

-- Milestones (plan Task 5/2)
create table if not exists public.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  description text not null,
  success_criteria text not null,
  estimated_tokens integer not null check (estimated_tokens > 0),
  actual_tokens integer,
  status text not null default 'proposed'
    check (status in ('proposed', 'funded', 'active', 'complete', 'failed')),
  assigned_team_id uuid references public.profiles(id),
  deadline timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Community votes: one per voter per milestone (and per project) (plan Task 10)
create table if not exists public.community_votes (
  id uuid primary key default gen_random_uuid(),
  voter_id uuid not null references public.profiles(id) on delete cascade,
  milestone_id uuid references public.milestones(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  vote_weight integer not null default 1,
  created_at timestamptz not null default now(),
  unique(voter_id, milestone_id),
  unique(voter_id, project_id)
);

-- Team ratings: one per rater per milestone (plan Task 11)
create table if not exists public.team_ratings (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.profiles(id) on delete cascade,
  rater_id uuid not null references public.profiles(id) on delete cascade,
  milestone_id uuid references public.milestones(id) on delete cascade,
  rating integer not null check (rating >= 1 and rating <= 5),
  review text,
  created_at timestamptz not null default now(),
  unique(rater_id, milestone_id)
);

-- Plugin/dependency revenue splits (plan Task 13)
create table if not exists public.plugin_splits (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  plugin_name text not null,
  plugin_owner text,
  split_percentage numeric not null check (split_percentage >= 0 and split_percentage <= 100),
  is_required boolean not null default false,
  created_at timestamptz not null default now()
);

-- Token ledger: actual token usage per run + team rewards (plan Task 8/9)
create table if not exists public.token_ledger (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references public.milestones(id) on delete cascade,
  kind text not null default 'run' check (kind in ('run', 'team_reward')),
  provider text not null,
  model text not null,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  cost_usd numeric not null default 0,
  receipt_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Project categories for discovery (plan Task 2/12)
create table if not exists public.project_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  icon text,
  created_at timestamptz not null default now()
);

insert into public.project_categories (name, description) values
  ('Research', 'Academic and scientific research problems'),
  ('Public Good', 'Civic and community-benefit projects'),
  ('Developer Tools', 'Tools and infrastructure for developers'),
  ('Video Creation', 'AI video generation and creative projects'),
  ('Math & Verification', 'Mathematical proofs and verification'),
  ('Open Source', 'Funded open source development'),
  ('AI Safety', 'AI alignment and safety research')
on conflict (name) do nothing;

-- Denormalized counters are updated by the app layer, not triggers (keeps webhook writes simple):
--   projects.compute_balance_cents, projects.supporter_count -- from base schema
--   milestones.votes is computed with count(community_votes) at read time

-- RLS: token data and ratings are PUBLIC by design (plan: "This data is PUBLIC").
-- Votes/ratings require an authenticated voter; everything reads are open.
alter table public.milestones enable row level security;
alter table public.community_votes enable row level security;
alter table public.team_ratings enable row level security;
alter table public.plugin_splits enable row level security;
alter table public.token_ledger enable row level security;
alter table public.project_categories enable row level security;

create policy "public read milestones" on public.milestones for select using (true);
create policy "public read votes" on public.community_votes for select using (true);
create policy "public read ratings" on public.team_ratings for select using (true);
create policy "public read plugin splits" on public.plugin_splits for select using (true);
create policy "public read token ledger" on public.token_ledger for select using (true);
create policy "public read categories" on public.project_categories for select using (true);

create policy "insert votes (authenticated)" on public.community_votes
  for insert to authenticated with check (voter_id = auth.uid());
create policy "insert ratings (authenticated)" on public.team_ratings
  for insert to authenticated with check (rater_id = auth.uid());
create policy "project team manages milestones" on public.milestones
  for all to authenticated using (
    assigned_team_id = auth.uid()
    or project_id in (select id from public.projects where creator_id = auth.uid())
  );
-- ── Profile auto-creation trigger (robust against email-confirmation flow) ──
-- The client no longer inserts its own profiles row: one fires on first auth
-- signup regardless of confirmation state. Runs as definer → bypasses RLS.
create schema if not exists auth; -- exists by default; no-op safeguard for local pg

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email, is_team, team_rating, token_balance)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), 'patron'),
    new.email,
    coalesce((new.raw_user_meta_data ->> 'is_team')::boolean, false),
    0,
    0
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

grant execute on function public.handle_new_user() to supabase_auth_admin;

-- service role (webhook/compute-runner) bypasses RLS by design: use SUPABASE_SERVICE_ROLE_KEY.

-- ── Base tables: explicit RLS (they are auto-exposed to the Data API) ────────
-- Reads are PUBLIC by design (receipts are the product). Writes need an
-- authenticated user; the webhook/compute-runner use the service-role key.
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.compute_runs enable row level security;
alter table public.supporter_receipts enable row level security;

-- Grants (some projects are created with "automatically expose new tables"
-- unchecked — add them explicitly so the publishable/anon key can read):
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update on public.profiles to authenticated;
grant insert on public.projects to authenticated;
grant insert, update, delete on public.milestones to authenticated;
grant insert, update, delete on public.community_votes to authenticated;
grant insert, update, delete on public.team_ratings to authenticated;
grant insert, update, delete on public.plugin_splits to authenticated;
grant insert on public.token_ledger to authenticated;
grant insert on public.project_categories to authenticated;

create policy "public read profiles" on public.profiles for select using (true);
create policy "insert own profile" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "update own profile" on public.profiles
  for update to authenticated using (id = auth.uid());

create policy "public read projects" on public.projects for select using (true);
create policy "creators create projects" on public.projects
  for insert to authenticated with check (creator_id = auth.uid());

create policy "public read ledger" on public.ledger_entries for select using (true);
create policy "public read compute runs" on public.compute_runs for select using (true);
create policy "public read supporter receipts" on public.supporter_receipts for select using (true);

-- ── Seed: first-connect demo board (idempotent, fixed uuids) ─────────────────
insert into public.profiles (id, display_name, is_team, team_rating, email) values
  ('00000000-0000-0000-0000-00000000a101', 'Open Research Guild', true, 91, null),
  ('00000000-0000-0000-0000-00000000a102', 'Civic Systems Lab', true, 68, null),
  ('00000000-0000-0000-0000-00000000a103', 'Gui Labs', true, 97, null)
on conflict (id) do nothing;

insert into public.projects
  (id, creator_id, title, slug, category, summary, compute_goal_cents, compute_balance_cents, supporter_count, priority_score) values
  ('00000000-0000-0000-0000-00000000b101', '00000000-0000-0000-0000-00000000a101',
   'Astra Math Verification Sprint', 'astra-math-verification-sprint', 'Research',
   'Pool compute to test frontier models against a difficult proof search with every run logged for supporters.',
   1200000, 742000, 186, 91),
  ('00000000-0000-0000-0000-00000000b102', '00000000-0000-0000-0000-00000000a102',
   'Rural Clinic Scheduling Optimizer', 'rural-clinic-scheduling-optimizer', 'Public Good',
   'Use sponsored model credits to reduce wait times for a small clinic without buying expensive enterprise software.',
   680000, 312000, 74, 68),
  ('00000000-0000-0000-0000-00000000b103', '00000000-0000-0000-0000-00000000a103',
   'Open Source Bug Bounty Agent', 'open-source-bug-bounty-agent', 'Developer Tools',
   'Backers fund AI debugging passes for issues maintainers cannot afford to investigate manually.',
   950000, 891000, 241, 97)
on conflict (id) do nothing;

insert into public.ledger_entries (id, project_id, kind, label, amount_cents) values
  ('00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-00000000b101', 'funding', 'Community compute sponsorship', 520000),
  ('00000000-0000-0000-0000-00000000c102', '00000000-0000-0000-0000-00000000b101', 'compute', 'OpenAI reasoning batch', -82000),
  ('00000000-0000-0000-0000-00000000c103', '00000000-0000-0000-0000-00000000b102', 'funding', 'Local sponsor pool', 312000),
  ('00000000-0000-0000-0000-00000000c104', '00000000-0000-0000-0000-00000000b103', 'funding', 'Monthly supporter credits', 891000),
  ('00000000-0000-0000-0000-00000000c105', '00000000-0000-0000-0000-00000000b103', 'compute', 'xAI code analysis run', -64000)
on conflict (id) do nothing;

insert into public.compute_runs (id, project_id, provider, model, prompt, cost_cents, status, output_summary) values
  ('00000000-0000-0000-0000-00000000d101', '00000000-0000-0000-0000-00000000b101',
   'openai', 'o4-reasoning', 'Search for proof sketches and counterexamples', 82000, 'complete',
   '3 promising proof routes, 1 invalidated assumption, next run queued.'),
  ('00000000-0000-0000-0000-00000000d102', '00000000-0000-0000-0000-00000000b102',
   'anthropic', 'claude-planning', 'Generate appointment optimization plan from sample constraints', 24000, 'queued',
   'Waiting for creator approval.'),
  ('00000000-0000-0000-0000-00000000d103', '00000000-0000-0000-0000-00000000b103',
   'xai', 'grok-code', 'Investigate flaky parser failures in issue #184', 64000, 'complete',
   'Found race condition around shared fixture initialization.')
on conflict (id) do nothing;

insert into public.milestones
  (id, project_id, title, description, success_criteria, estimated_tokens, actual_tokens, status, assigned_team_id, deadline, completed_at) values
  ('00000000-0000-0000-0000-00000000e101', '00000000-0000-0000-0000-00000000b101',
   'Proof-search sweep round 2', 'Run 12 frontier reasoning passes over the two open lemmas.',
   'At least one lemma with a complete proof path or all paths refuted.',
   4000000, 3100000, 'complete', '00000000-0000-0000-0000-00000000a101', '2026-09-30T00:00:00Z', '2026-09-28T15:00:00Z'),
  ('00000000-0000-0000-0000-00000000e102', '00000000-0000-0000-0000-00000000b101',
   'Verifier harness hardening', 'Automate the checker so every claimed proof path is machine-verified.',
   'Checker re-runs a full sweep unattended with logged diffs.',
   2000000, null, 'active', '00000000-0000-0000-0000-00000000a101', '2026-10-20T00:00:00Z', null),
  ('00000000-0000-0000-0000-00000000e103', '00000000-0000-0000-0000-00000000b101',
   'Public proof notes for run 12', 'Write the open noteset for the completed sweep, receipts attached.',
   'Noteset published with every run linked.',
   400000, null, 'proposed', null, null, null),
  ('00000000-0000-0000-0000-00000000e104', '00000000-0000-0000-0000-00000000b102',
   'Wait-time analysis plan', 'Model anonymized schedule constraints and draft the optimization plan.',
   'Plan reduces modelled average wait by 15% without adding staff hours.',
   1200000, null, 'funded', '00000000-0000-0000-0000-00000000a102', '2026-10-15T00:00:00Z', null),
  ('00000000-0000-0000-0000-00000000e105', '00000000-0000-0000-0000-00000000b103',
   'Issue #184 race-condition patch', 'Isolate the shared-fixture race and land a fix with regression tests.',
   'Flaky parser suite green over 200 runs.',
   3500000, 2800000, 'complete', '00000000-0000-0000-0000-00000000a103', '2026-09-05T00:00:00Z', '2026-09-01T11:02:00Z'),
  ('00000000-0000-0000-0000-00000000e106', '00000000-0000-0000-0000-00000000b103',
   'Run 08: parser regression sweep', 'Use stacked tokens to sweep the parser suite across matrix builds.',
   'Zero flakes in 500 consecutive CI runs.',
   1700000, null, 'active', '00000000-0000-0000-0000-00000000a103', '2026-10-25T00:00:00Z', null)
on conflict (id) do nothing;

insert into public.token_ledger (id, milestone_id, kind, provider, model, tokens_in, tokens_out, cost_usd, receipt_data) values
  ('00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e101', 'run', 'openai', 'o4-reasoning',
   2600000, 500000, 820, '{"prompt": "Search for proof sketches and counterexamples", "outputSummary": "3 promising proof routes, 1 invalidated assumption"}'),
  ('00000000-0000-0000-0000-00000000f102', '00000000-0000-0000-0000-00000000e101', 'team_reward', 'internal', 'token-allocation',
   0, 900000, 0, '{"prompt": "leftover allocation", "outputSummary": "22.5% under estimate - 900k tokens rewarded to Open Research Guild"}'),
  ('00000000-0000-0000-0000-00000000f103', '00000000-0000-0000-0000-00000000e105', 'run', 'xai', 'grok-code',
   2400000, 400000, 640, '{"prompt": "Investigate flaky parser failures in issue #184", "outputSummary": "Found race condition around shared fixture initialization"}'),
  ('00000000-0000-0000-0000-00000000f104', '00000000-0000-0000-0000-00000000e105', 'team_reward', 'internal', 'token-allocation',
   0, 700000, 0, '{"prompt": "leftover allocation", "outputSummary": "20% under estimate - 700k tokens stacked for run 08"}')
on conflict (id) do nothing;

insert into public.plugin_splits (id, project_id, plugin_name, plugin_owner, split_percentage, is_required) values
  ('00000000-0000-0000-0000-000000009101', '00000000-0000-0000-0000-00000000b103', 'ComfyUI', 'comfyanonymous', 10, true),
  ('00000000-0000-0000-0000-000000009102', '00000000-0000-0000-0000-00000000b102', 'Obsidian', 'obsidian', 10, true)
on conflict (id) do nothing;

-- team token balances from the seeded leftovers
update public.profiles set token_balance = 900000 where id = '00000000-0000-0000-0000-00000000a101';
update public.profiles set token_balance = 700000 where id = '00000000-0000-0000-0000-00000000a103';