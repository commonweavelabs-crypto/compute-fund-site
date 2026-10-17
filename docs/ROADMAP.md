# Compute.Fund — Roadmap

Board state 2026-10-17: **53 units live** (50 real mirrors UNCLAIMED + 3 demo), repo
pushed, prod deployed, GitHub sign-in live, migrations-by-runner + auth-config-by-API.

Legend: 🤖 = Gui-free (agent runs it) · 🤝 = needs a Gui session (decisions/credentials)

## ✅ Shipped (no action)
Photos 13/13 · Terminal Commons landing (MERGE mockup) · mirror-claim model + ToS ·
v2/v3 schema + 50-mirror import · GitHub repo · Vercel deploy · GitHub OAuth sign-in ·
redirect allowlist fixed via Management API.

## 🤖 Autonomous milestones (agent-only, no Gui needed)
- [DONE 10/17] **A1. Verify state-of-the-code vs. the new asks** — create-project path exists in v0 but untested live; roles/membership/profile pages DO NOT exist. (partially done this session)
- [DONE 10/17] **A2. Claim flow, rung 1** — signed-in GitHub user: fetch provider identity → GitHub API check (owner/collaborator of origin_repo) → "Maintainers: claim it" becomes functional for real. Requires no new credentials (sessions live).
- [DONE 10/17] **A3. Claim ladder rung 2–4** — COMPUTE-FUND.toml claim-file (fetch repo default branch), DNS TXT probe, manual review queue UI (claim_requests table exists).
- [DONE 10/17] **A4. Fork flow** — platform fork button → GitHub-verified mirror fork; lineage chain + owner = forker; fork rent presets (5/10/15/20%, default 10%, cap 20%) stored at fork birth; "Forked from" UI.
- [DONE 10/17] **A5. 50 art renders** — one ComfyUI batch (≈13s each ≈ 10 min total) filling the NULL image_url rows; contact-sheet QA at the end.
- [DONE 10/17] **A6. Profile/user pages backend** — profiles table extensions: bio, links, avatar_url, profile_type (personal|business), visibility.
- [DONE 10/17] **A7. Roles/memberships backend** — project_members + business_members tables (owner/manager/dev/viewer), RLS by role; owner-not-transferable law enforced at DB level (owner row immutable except delete).
- [DONE 10/17] **A8. Project showcase build-out** — image upload (Supabase storage bucket, owner/manager-only writes), gallery on unit page, description/story editing, Kickstarter-style layout.
- [DONE 10/17] **A9. Sweep/claim buttons on project page** — Claim available tokens (anytime), stewardship pulse timestamps public; unswept-token clocks (30d amber, 90d → redirect pool).

## 🤝 Gui-session milestones (decisions/credentials/hands-on)
- **G1. Stripe (test mode)** — create/get keys together, checkout + webhook re-verified, real-patron path. ToS page already law-compliant. [deferred twice; when ready — 1 session]
- **G2. Business-account UX design review** — roles UI (Facebook-business-like), invite-by-email/username, owner seat rules. Backend (A7) precedes it.
- **G3. Import policy sign-off** — the 50-unit import is conditionally-good + worth-it verdicts only; Gui reviews edge verdicts.
- **G4. Go-live commercial review** — Stripe keys + Vercel Pro switch + counsel pass on ToS for real charges. [after G1]
- **G5. Outreach to mirror creators** — ONLY after claim flow + ToS live (spec law).
- **G6. Vercel Login Connection** (auto-deploy on push) — 1 minute at vercel.com/account/login-connections; optional (CLI deploy works).
- **G7. Roadmap review / planning session** — walk ROADMAP together, re-prioritize, answer PENDING-CONFIRMATION defaults (fork interview 3).