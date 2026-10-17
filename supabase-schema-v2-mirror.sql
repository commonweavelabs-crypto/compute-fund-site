-- Compute Fund — migration v2: mirror-claim model (idempotent, safe to re-run).
-- Add after supabase-schema.sql + supabase-schema-v1.sql.

-- ── Projects: mirror / claim / stewardship / rent / photos ───────────────────
alter table public.projects add column if not exists image_url text;
alter table public.projects add column if not exists hero_image_url text;
alter table public.projects add column if not exists origin_repo text;            -- 'owner/repo' for mirrors
alter table public.projects add column if not exists claim_status text
  not null default 'unclaimed';                                                  -- unclaimed | claimed | review
alter table public.projects add column if not exists claimed_by uuid
  references public.profiles(id);
alter table public.projects add column if not exists claimed_at timestamptz;
alter table public.projects add column if not exists featured boolean not null default false;
alter table public.projects add column if not exists forked_from uuid
  references public.projects(id);
alter table public.projects add column if not exists fork_rent_pct integer
  not null default 10;                                                           -- one-hop upstream share, %
alter table public.ledger_entries add column if not exists swept_at timestamptz;  -- null = pending manager sweep
alter table public.compute_runs add column if not exists swept_at timestamptz;

-- ── Claim requests (review queue for non-GitHub / edge-case claims) ──────────
create table if not exists public.claim_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  claimant_id uuid references public.profiles(id),
  method text not null check (method in ('github', 'repo-file', 'dns-txt', 'manual')),
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

-- ── Categories: extended set for the landing chips ───────────────────────────
insert into public.project_categories (name, description) values
  ('AI Research', 'Frontier model and machine-learning research'),
  ('Civic Tech', 'Technology for communities and public institutions'),
  ('Games & Media', 'Game development, creative and media tools'),
  ('Education', 'Learning tools and open knowledge'),
  ('Science', 'Scientific computing and open data'),
  ('Environment', 'Climate, nature and sustainability tooling'),
  ('Creative Tools', 'Editors, art and design tooling'),
  ('Agent Infra', 'Infrastructure for AI agents and automation')
on conflict (name) do nothing;

-- ── Platform steward profile (mirror owner until a creator claims) ──────────
insert into public.profiles (id, display_name, is_team, team_rating, email)
values ('00000000-0000-0000-0000-0000000a2000', 'Compute Fund Mirror', false, 0, null)
on conflict (id) do nothing;

-- ── Roster seed: 12 real mirrored projects (vetted link archive) ────────────
-- UNCLAIMED by design: funded 0, parked starts empty, disclaimer on every card.
insert into public.projects
  (id, creator_id, title, slug, category, summary, compute_goal_cents,
   compute_balance_cents, supporter_count, priority_score, claim_status,
   origin_repo, image_url) values
  ('00000000-0000-0000-0000-0000000c2001', '00000000-0000-0000-0000-0000000a2000',
   'Crawl4AI', 'mirror-crawl4ai', 'Developer Tools',
   'Open-source, LLM-friendly web crawler and scraper for AI pipelines. Independent mirror: funds park until the maintainers claim this unit.',
   800000, 0, 0, 78, 'unclaimed', 'unclecode/crawl4ai', '/project-art/crawl4ai.png'),
  ('00000000-0000-0000-0000-0000000c2002', '00000000-0000-0000-0000-0000000a2000',
   'ScrapeGraphAI', 'mirror-scrapegraph-ai', 'AI Research',
   'LLM-powered web scraping library. Independent mirror: funds park until the maintainers claim this unit.',
   900000, 0, 0, 76, 'unclaimed', 'ScrapeGraphAI/Scrapegraph-ai', '/project-art/scrapegraph-ai.png'),
  ('00000000-0000-0000-0000-0000000c2003', '00000000-0000-0000-0000-0000000a2000',
   'Diffusers', 'mirror-diffusers', 'AI Research',
   'The go-to diffusion model library — state-of-the-art generative models for everyone. Independent mirror: funds park until claimed.',
   1200000, 0, 0, 82, 'unclaimed', 'huggingface/diffusers', '/project-art/diffusers.png'),
  ('00000000-0000-0000-0000-0000000c2004', '00000000-0000-0000-0000-0000000a2000',
   'Outlines', 'mirror-outlines', 'AI Research',
   'Structured outputs for LLMs: generation you can program. Independent mirror: funds park until claimed.',
   700000, 0, 0, 74, 'unclaimed', 'dottxt-ai/outlines', '/project-art/outlines.png'),
  ('00000000-0000-0000-0000-0000000c2005', '00000000-0000-0000-0000-0000000a2000',
   'croc', 'mirror-croc', 'Open Source',
   'Secure file transfer between any two computers, with a code phrase. Independent mirror: funds park until claimed.',
   400000, 0, 0, 66, 'unclaimed', 'schollz/croc', '/project-art/croc.png'),
  ('00000000-0000-0000-0000-0000000c2006', '00000000-0000-0000-0000-0000000a2000',
   'Plausible Analytics', 'mirror-plausible-analytics', 'Civic Tech',
   'Simple, privacy-first web analytics — an alternative to surveillance ad-tech. Independent mirror: funds park until claimed.',
   800000, 0, 0, 71, 'unclaimed', 'plausible/analytics', '/project-art/plausible.png'),
  ('00000000-0000-0000-0000-0000000c2007', '00000000-0000-0000-0000-0000000a2000',
   'Plane', 'mirror-plane', 'Open Source',
   'Open-source planning and tracking — a Jira/Linear alternative for teams. Independent mirror: funds park until claimed.',
   900000, 0, 0, 70, 'unclaimed', 'makeplane/plane', '/project-art/plane.png'),
  ('00000000-0000-0000-0000-0000000c2008', '00000000-0000-0000-0000-0000000a2000',
   'PixiEditor', 'mirror-pixieditor', 'Creative Tools',
   'Universal 2D editor — pixel art, vectors and animation in one open toolbox. Independent mirror: funds park until claimed.',
   600000, 0, 0, 64, 'unclaimed', 'PixiEditor/PixiEditor', '/project-art/pixieditor.png'),
  ('00000000-0000-0000-0000-0000000c2009', '00000000-0000-0000-0000-0000000a2000',
   'Sandcastle', 'mirror-sandcastle', 'Agent Infra',
   'AFK software factory: sandboxed parallel coding agents shipping while you sleep. Independent mirror: funds park until claimed.',
   700000, 0, 0, 73, 'unclaimed', 'mattpocock/sandcastle', '/project-art/sandcastle.png'),
  ('00000000-0000-0000-0000-0000000c2010', '00000000-0000-0000-0000-0000000a2000',
   'OpenSandbox', 'mirror-opensandbox', 'Agent Infra',
   'Sandbox runtime for AI agents — safe execution environments at scale. Independent mirror: funds park until claimed.',
   800000, 0, 0, 72, 'unclaimed', 'opensandbox-group/OpenSandbox', '/project-art/opensandbox.png'),
  ('00000000-0000-0000-0000-0000000c2011', '00000000-0000-0000-0000-0000000a2000',
   'Motrix', 'mirror-motrix', 'Open Source',
   'Full-featured download manager — HTTP, torrents, everything, open. Independent mirror: funds park until claimed.',
   500000, 0, 0, 62, 'unclaimed', 'agalwood/Motrix', '/project-art/motrix.png'),
  ('00000000-0000-0000-0000-0000000c2012', '00000000-0000-0000-0000-0000000a2000',
   'LingBot-Map', 'mirror-lingbot-map', 'Video Creation',
   'Streaming 3D scene reconstruction from plain video. Independent mirror: funds park until claimed.',
   700000, 0, 0, 63, 'unclaimed', 'Robbyant/lingbot-map', '/project-art/lingbot-map.png')
on conflict (id) do nothing;

-- ── Claim requests RLS + policies ────────────────────────────────────────────
alter table public.claim_requests enable row level security;
create policy "public read claim requests" on public.claim_requests for select using (true);
create policy "authenticated file claim requests" on public.claim_requests
  for insert to authenticated with check (claimant_id = auth.uid());

grant usage on schema public to anon, authenticated;
grant select on public.claim_requests to anon, authenticated;
grant insert on public.claim_requests to authenticated;

-- ── Demo unit art (platform-owned units keep their generated art) ────────────
update public.projects set image_url = '/project-art/diffusers.png'
  where id = '00000000-0000-0000-0000-00000000b101';
update public.projects set image_url = '/project-art/plane.png'
  where id = '00000000-0000-0000-0000-00000000b102';
update public.projects set image_url = '/project-art/sandcastle.png'
  where id = '00000000-0000-0000-0000-00000000b103';
update public.projects set claim_status = 'claimed'
  where id in ('00000000-0000-0000-0000-00000000b101','00000000-0000-0000-0000-00000000b102','00000000-0000-0000-0000-00000000b103');
update public.projects set featured = true
  where id = '00000000-0000-0000-0000-00000000b103';