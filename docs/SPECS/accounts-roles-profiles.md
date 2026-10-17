# Spec: Accounts, Roles, Profiles, and the Split Mechanism

Status: DRAFT — Gui-voice decisions recorded 2026-10-17, refinements mine, marked.
Supersedes nothing; extends landing-mirror-claim.md.

## Gui's hierarchy (locked intent)
1. **Personal account** = the floor (basic account, from sign-in).
2. **Business/entity account** — created BY a personal owner; may be co-owned by 2+ users;
   both personal and business accounts can OWN projects.
3. **Project** — owned by a personal or business account; roles (owner / manager / dev /
   viewer) grant others participation; the OWNER role is NOT shareable; co-ownership
   happens only at the business level (business owns project, partners own the business).

## Why this is the right shape (my endorsement)
- Matches Facebook-business mental model users already know.
- Owner-not-shareable keeps the VERIFICATION LADDER clean: one accountable claimant per
  project (GitHub-verified). Co-ownership = co-owned business account = still one owner
  entity. Claims, rent, and liability stay unambiguous.
- Forks remain the escape hatch: anyone unhappy forks (forker auto-claims; rent to parent).

## The split problem (Gui's question) — proposed answer: NO RENT BETWEEN PARTNERS
**"What if the two owners of a business account decide to split? Who owns it? Rent?"**

The mechanism that makes this simple: **platform accounts are not equity**. Business
membership = access + stewardship, not shares. There is nothing to buy out.
- A leaving partner simply exits: loses their seat; the remaining partner(s) keep the
  account and its projects. No payout, no rent.
- If the leaving partner wants their work to go with them: they FORK the project (fork
  = full new project they own; one-hop rent to the parent account per the standing
  fork-rent rules — that's the only rent, to the ACCOUNT they left, not "to the person").
- If partners can't agree who keeps the account: the tokens stay safe (parked per the
  stewardship rules); either partner forks everything; supporters keep receipts.
- Law to write into ToS: "Business accounts are stewardship arrangements, not equity.
  Disputes resolve via forks — the platform never adjudicates internal splits."

This is simple, transparent, legally coherent (consistent with patronage-not-investment),
and it REUSES the two mechanics we already built (fork rent + parked-fund safety).

## Account model (build order)
- profiles: + profile_type (personal|business, default personal), bio, links,
  avatar_url, visibility (public|private), display_name (exists), is_team (legacy flag → migrate to profile_type).
- business_members (business_id, member_user_id, role, added_at, added_by).
- project_members (project_id, member_profile_id, role, added_at) — roles at minimum:
  owner (≤1), manager (sweep tokens, edit showcase, manage roles below owner),
  contributor, viewer. Owner row immutable except deleted-by-owner.
- RLS: members see private projects they're in; public showcase readable by anon.
- Invite flow: by username first (email invite = needs email service, later).

## Project page = the showcase (Kickstarter comparison, Gui's words)
- Hero image + gallery (owner/manager upload via Supabase storage; size/type limits),
  description + story (rich text), full history (ledger + milestones + forks+ claim
  status + stewardship pulse), tags. This EMBEDS the existing unit page and extends it.
- Art: uploaded images beat generated default art; generated art stays as placeholder.

## Open questions recorded for the next Gui round (PENDING, non-blocking)
1. Personal-profile visibility default: I recommend PUBLIC for project owners
   (stewardship transparency), PRIVATE default for plain patrons.
2. Business account naming: does it need its own display namespace, or reuse profiles
   rows with profile_type=business (my recommendation — one table, cleaner RLS)?
3. Can a business also FORK under itself (owned by the business = shared parent rent)?
   My default: yes, rent flows to the parent account (business or personal alike).
4. Role ceiling: should 'manager' be able to add contributors (my default: yes) or
   must owners handle all role changes?

## Import policy (Gui's licensing question — answered 2026-10-17)
We host FUNDING PROFILES about projects (text + generated art + links) — we do NOT
redistribute their code. Listing/pointing at public projects is what awesome-lists,
SaaSHub, AlternativeTo do daily. Therefore: ANY public repo is listable with
attribution + the standing disclaimer + takedown-on-request. Licenses (MIT/Apache/GPL)
govern CODE REUSE (= our future fork feature), not listing. We still exclude
not-a-fit/skip verdicts internally for brand quality. No permission needed; claiming =
the courtesy handshake that made this product.