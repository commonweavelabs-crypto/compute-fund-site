# Compute Fund v0 — Initial Roadmap

## Milestone Family Overview

| Milestone | Title | Effort | Status | Dependencies |
|-----------|-------|--------|--------|--------------|
| cfv-ms-001 | Initial project alignment | small | in_progress | — |
| cfv-ms-002 | First bounded build pass | medium | pending | cfv-ms-001 |
| cfv-ms-003 | Milestone review and next-step refresh | small | pending | cfv-ms-002 |
| cfv-ms-004 | Connect live Supabase backend | medium | pending | cfv-ms-003 |
| cfv-ms-005 | Tick-Tock review (Supabase phase) | small | pending | cfv-ms-004 |
| cfv-ms-006 | Supabase auth + Stripe webhook persistence | medium | pending | cfv-ms-005 |
| cfv-ms-007 | Milestone system + token tracking data layer | medium | pending | cfv-ms-006 |
| cfv-ms-008 | Token efficiency UI — estimates vs actuals (CRITICAL) | medium | pending | cfv-ms-007 |
| cfv-ms-009 | Leftover token allocation engine (CRITICAL) | medium | pending | cfv-ms-008 |
| cfv-ms-010 | Compute run receipts with real token tracking | medium | pending | cfv-ms-009 |
| cfv-ms-011 | Tick-Tock review (incentive engine) | small | pending | cfv-ms-010 |
| cfv-ms-012 | Community voting on milestones | medium | pending | cfv-ms-011 |
| cfv-ms-013 | Team rating system — 1-5 stars + reviews | medium | pending | cfv-ms-012 |
| cfv-ms-014 | Plugin/dependency revenue split editor | medium | pending | cfv-ms-013 |
| cfv-ms-014a | Open-knowledge opt-in + contribution tier system | medium | pending | cfv-ms-013 |
| cfv-ms-015 | Linktree landing page (shareable) | small | pending | cfv-ms-006 |
| cfv-ms-016 | Tick-Tock review (community features) | small | pending | cfv-ms-014, cfv-ms-014a |
| cfv-ms-017 | Replace mock data with Supabase + project creation flow | medium | pending | cfv-ms-016 |
| cfv-ms-018 | SEO + Open Graph + deploy to Vercel | medium | pending | cfv-ms-017 |

## Phase 1: v0 Prototype (cfv-ms-001 -> cfv-ms-002)

**Goal:** Complete the working v0 prototype pages with seeded local state.

### Work Lanes (Next-Step Queue)

1. **nsq-001** — Complete v0 prototype pages toward MVP *(in progress)*
   - Review existing pages: landing, project list/detail, funding, receipts
   - Continue building toward minimum viable product

2. **nsq-002** — Wire local seeded state to Supabase *(pending)*
   - Run supabase-schema.sql
   - Add env values
   - Replace local seeded reads/mutations with Supabase

## Phase 2: Production Wiring (cfv-ms-003 -> cfv-ms-005)

### Work Lanes

3. **nsq-003** — Add Stripe checkout and webhook routes *(pending)*
   - Create Stripe checkout and webhook routes for real funding

4. **nsq-004** — Add provider receipt adapters *(pending)*
   - OpenAI, Anthropic, xAI receipt adapters for compute-run proof

## Phase 3: Incentive Engine — CRITICAL (cfv-ms-007 -> cfv-ms-010)

**Goal:** Build the token efficiency incentive system that makes the platform self-regulating.

### Work Lanes

5. **nsq-005** — Milestone system + token tracking data layer
   - Create milestones table, CRUD functions, TypeScript types
   - Track estimated_tokens vs actual_tokens per milestone

6. **nsq-006** — Token efficiency UI — estimates vs actuals (CRITICAL)
   - Public display of estimated vs actual token usage
   - Visual bars: estimated (gray), actual (green if under, red if over)
   - "Team saved X%" badge when milestone completed under budget

7. **nsq-007** — Leftover token allocation engine (CRITICAL)
   - allocateLeftoverTokens(milestoneId) — calculate and assign
   - Team token balance tracking
   - Stack (roll into next milestone), Transfer (to another team), External (withdraw)

8. **nsq-008** — Compute run receipts with real token tracking
   - Call LLM provider, capture usage tokens
   - Insert into token_ledger with actual counts
   - Generate PUBLIC receipt (prompt, provider, model, tokens, cost, output)

## Phase 4: Community Features (cfv-ms-012 -> cfv-ms-015)

### Work Lanes

9. **nsq-009** — Community voting on milestones
   - Upvote/downvote on proposed milestones
   - Vote-based priority ranking
   - "Community Priority" badge

10. **nsq-010** — Team rating system
    - 1-5 stars + review text after milestone completion
    - Aggregate rating on team profile
    - "Top Performer" (>= 4.5) / "Needs Improvement" (< 2.5) badges

11. **nsq-011** — Plugin/dependency revenue split editor
    - Project creators designate split percentages
    - Required plugins (ComfyUI) get higher %, optional (Obsidian) get lower
    - Transparent display on project page

12. **nsq-012** — Linktree landing page
    - Shareable at /links — all our links in one place
    - Donation CTA at top
    - GitHub, YouTube, X, Compute Fund, ComfyUI Video UI

12a. **nsq-012a** — Open-knowledge opt-in + contribution tier system
    - Projects can opt in to open-source ALL generated data, outputs, and findings to the platform community
    - Open-knowledge projects get an "Open Knowledge" badge — visible to all visitors
    - All compute run outputs, research findings, and generated artifacts are publicly accessible
    - Contribution tier system: subscription/patronage levels unlock LLM token allowances
      - $20/mo patron = baseline token allowance on the platform
      - $100/mo patron = higher allowance
      - One-time contributors get proportional token allotment
    - Both creators and patrons receive token usage based on their tier
    - The community funds the platform; the platform returns tokens to its contributors

## Phase 5: Launch (cfv-ms-017 -> cfv-ms-018)

### Work Lanes

13. **nsq-013** — Replace mock data with Supabase + project creation flow
    - Remove initialProjects hardcoded array
    - Real Supabase queries with mock fallback
    - Project creation persisted to Supabase

14. **nsq-014** — SEO + Open Graph + deploy
    - Meta tags, OG image, robots, sitemap
    - Push to GitHub, connect Vercel
    - Stripe webhook endpoint setup
    - Full smoke test on production

## Key Technical Notes

- **Stack:** Next.js (v16) + React 19 + Tailwind + TypeScript
- **Auth:** Supabase auth (email/password + GitHub OAuth, team accounts with is_team flag)
- **Payments:** Stripe checkout + webhook (already built in v0, needs Supabase persistence)
- **Backend:** Supabase (Postgres — extended schema v1 with milestones, votes, ratings, token_ledger, plugin_splits)
- **Providers:** OpenAI, Anthropic, xAI adapters (token tracking from API usage response)
- **Deploy:** Vercel

## Hard Constraints

- No investment/share/return language
- Must use Next.js (v16) + React 19 + Tailwind
- Token estimates and actuals MUST be public — this is the core transparency mechanism
- Leftover tokens are the team's reward — this is non-negotiable incentive design
- Platform fee percentage is community-voted, not hardcoded
- No Hermes dependency — standalone deployable app
- Open-knowledge projects MUST open-source all generated data to the community
- Contribution tiers (subscription/patronage) unlock LLM token allowances — different sizes unlock different usage levels
