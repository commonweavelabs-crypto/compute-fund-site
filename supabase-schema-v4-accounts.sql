-- Compute Fund — migration v4: accounts, business membership, project roles (idempotent, safe to re-run).
-- Add after supabase-schema.sql + supabase-schema-v1.sql + v2-mirror + v3-bulk-import.
-- Spec: docs/SPECS/accounts-roles-profiles.md
--   1. Personal account = the floor.
--   2. Business/entity account = created BY a personal owner; co-owned by 2+ users;
--      both personal and business accounts can OWN projects. Business account is a
--      profiles row with profile_type = 'business' (one table, cleaner RLS).
--   3. Project roles: owner / manager / contributor / viewer. The OWNER role is NOT
--      shareable — co-ownership happens only at the business level.
-- Membership is stewardship, not equity: exit loses the seat, no buyout; forks are
-- the escape hatch. Vocabulary law: tokens only.

-- ── Profiles extension: account type + showcase fields ───────────────────────
alter table public.profiles add column if not exists profile_type text
  not null default 'personal';                                                   -- personal | business
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists links jsonb
  not null default '{}'::jsonb;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists visibility text
  not null default 'private';                                                    -- public | private

-- Check constraints (idempotent via duplicate_object swallow).
do $$ begin
  alter table public.profiles
    add constraint profiles_profile_type_check
    check (profile_type in ('personal', 'business'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.profiles
    add constraint profiles_visibility_check
    check (visibility in ('public', 'private'));
exception when duplicate_object then null; end $$;

-- ── Business membership: stewardship, not equity ─────────────────────────────
-- The founding owner inserts themselves (added_by = self). Later members are
-- added by owners. A partner exit deletes their own row and loses the seat —
-- nothing to buy out. Ranges: role check named for idempotent re-runs.
create table if not exists public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.profiles(id) on delete cascade,
  member_user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'partner' check (role in ('owner', 'partner')),
  added_at timestamptz not null default now(),
  added_by uuid references public.profiles(id),
  unique (business_id, member_user_id)
);

-- ── Project membership: roles on a single owned project ──────────────────────
-- owner (≤1) / manager (sweep tokens, edit showcase, manage roles below owner)
-- / contributor / viewer. The owner row is immutable: nobody may rewrite or
-- remove it except the owner themselves (deleted-by-owner escape).
create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  member_profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'contributor', 'viewer')),
  added_at timestamptz not null default now(),
  added_by uuid references public.profiles(id),
  unique (project_id, member_profile_id)
);

-- ── SECURITY DEFINER helpers (avoid RLS self-subquery recursion) ─────────────
create or replace function public.is_account_owner(target_business_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.business_members bm
    where bm.business_id = target_business_id
      and bm.member_user_id = auth.uid()
      and bm.role = 'owner'
  );
$$;

create or replace function public.has_project_role(target_project_id uuid, allowed_roles text[])
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.projects p
    where p.id = target_project_id and p.creator_id = auth.uid()
  ) or exists (
    select 1 from public.project_members pm
    where pm.project_id = target_project_id
      and pm.member_profile_id = auth.uid()
      and pm.role = any (allowed_roles)
  );
$$;

-- ── RLS: business_members ─────────────────────────────────────────────────────
-- Roster is public (stewardship transparency: supporters see who stands behind
-- an account). Writes are authenticated-only; owners manage, members exit.
alter table public.business_members enable row level security;

drop policy if exists "public read business members" on public.business_members;
create policy "public read business members" on public.business_members
  for select using (true);

drop policy if exists "owners add business members" on public.business_members;
create policy "owners add business members" on public.business_members
  for insert to authenticated with check (
    (member_user_id = auth.uid() and added_by = auth.uid()) -- founding owner row
    or (role <> 'owner' and public.is_account_owner(business_id))
  );

drop policy if exists "owners update business members" on public.business_members;
create policy "owners update business members" on public.business_members
  for update to authenticated
  using (public.is_account_owner(business_id))
  with check (public.is_account_owner(business_id));

drop policy if exists "members exit, owners remove" on public.business_members;
create policy "members exit, owners remove" on public.business_members
  for delete to authenticated
  using (member_user_id = auth.uid() or public.is_account_owner(business_id));

-- ── RLS: project_members ──────────────────────────────────────────────────────
-- 'public' readable by anon; writes only authenticated. Owner row immutable
-- except deleted-by-owner (the owner removing their own row).
alter table public.project_members enable row level security;

drop policy if exists "public read project members" on public.project_members;
create policy "public read project members" on public.project_members
  for select using (true);

drop policy if exists "owners register self" on public.project_members;
create policy "owners register self" on public.project_members
  for insert to authenticated with check (
    member_profile_id = auth.uid()
    and role = 'owner'
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.creator_id = auth.uid()
    )
  );

drop policy if exists "owners and managers add members" on public.project_members;
create policy "owners and managers add members" on public.project_members
  for insert to authenticated with check (
    role <> 'owner'
    and public.has_project_role(project_id, array['owner', 'manager'])
  );

drop policy if exists "owner rows immutable on update" on public.project_members;
create policy "owner rows immutable on update" on public.project_members
  for update to authenticated
  using (role <> 'owner')
  with check (role <> 'owner');

drop policy if exists "owner rows immutable except deleted-by-owner" on public.project_members;
create policy "owner rows immutable except deleted-by-owner" on public.project_members
  for delete to authenticated
  using (
    (role <> 'owner' and public.has_project_role(project_id, array['owner', 'manager']))
    or (role <> 'owner' and member_profile_id = auth.uid())
    or (role = 'owner' and member_profile_id = auth.uid())
  );

-- ── Backfill: intentionally EMPTY ─────────────────────────────────────────────
-- No legacy memberships exist to migrate yet (is_team stays a legacy flag;
-- personal projects carry ownership in projects.creator_id alone). The
-- statement below is guarded with `where false` — a guaranteed no-op kept for
-- shape. Do not remove the guard.
insert into public.project_members (project_id, member_profile_id, role, added_by)
select p.creator_id, p.creator_id, 'owner', p.creator_id
from public.projects p
where false -- no-op by design
on conflict (project_id, member_profile_id) do nothing;

-- ── Grants (tables are exposed explicitly; anon reads, authenticated writes) ──
grant usage on schema public to anon, authenticated;
grant select on public.business_members to anon, authenticated;
grant select on public.project_members to anon, authenticated;
grant insert, update, delete on public.business_members to authenticated;
grant insert, update, delete on public.project_members to authenticated;
grant execute on function public.is_account_owner(uuid) to anon, authenticated;
grant execute on function public.has_project_role(uuid, text[]) to anon, authenticated;

-- Notes for the next Gui round (non-blocking, from the spec):
--   * profiles RLS already allows public reads; the new `visibility` column does
--     not yet filter rows — a per-row visibility filter policy is parent-owned.
--   * is_team (legacy flag) can be dropped once profile_type is the only signal.