create table public.profiles (
  id uuid primary key,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references public.profiles(id),
  title text not null,
  slug text not null unique,
  category text not null default 'New Project',
  summary text not null,
  compute_goal_cents integer not null check (compute_goal_cents > 0),
  compute_balance_cents integer not null default 0,
  supporter_count integer not null default 0,
  priority_score integer not null default 50,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null check (kind in ('funding', 'compute', 'badge', 'adjustment')),
  label text not null,
  amount_cents integer not null default 0,
  provider_reference text,
  created_at timestamptz not null default now()
);

create table public.compute_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  provider text not null,
  model text not null,
  prompt text not null,
  cost_cents integer not null check (cost_cents >= 0),
  status text not null check (status in ('queued', 'running', 'complete', 'failed')),
  output_summary text,
  raw_receipt jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.supporter_receipts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  supporter_id uuid references public.profiles(id),
  stripe_payment_intent text,
  amount_cents integer not null check (amount_cents > 0),
  priority_weight integer not null default 1,
  badge_label text not null default 'Compute Sponsor',
  created_at timestamptz not null default now()
);
