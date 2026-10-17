# SPEC — Compute Fund landing redesign + mirror-claim model

Status: APPROVED via interview 2026-10-16 (2 rounds + fork round timed out — fork defaults marked PENDING-CONFIRMATION)
Milestone family: M-L (Landing) — feature pass. Consolidation pass to follow per spec-first rhythm.

## Problem statement (user's view)
The landing page is a bare hero + cards. Gui wants the initial page to look like his
mockups: rich, dynamic, photo-carrying — a real destination, not a prototype. And the
platform should mirror REAL open-source projects from the vetted link archive (real tools,
real people), so creators organically discover their project here, claim it, and unlock
donations — without us fabricating demo products.

## Solution (user's view)
A redesigned landing page per the approved MERGE layout + a mirror-claim model: real,
vetted projects mirrored with UNCLAIMED status + parked-funds disclosure; creators claim
(verified control), forks create competing units with lineage. Creators get outreach
emails only after claim flow + ToS exist.

## Approved decisions (interview)
1. LAYOUT = Merge: Design A structure (photo right of hero → Featured Project big card →
   Recommended grid → strip) with Design B's compact "Open for funding" strip replacing
   A's "More projects" row.
2. PHOTOS = hosted partner model via catalog (cost accepted). Scope: EVERYWHERE
   (landing, discover cards, project pages). Art must be THEMED on the project's WORK —
   never logos/wordmarks, never registered IP (the mockup's "Street Fighter" card must
   not exist).
3. MIRROR SOURCING = real projects from the vetted link archive (558 links / 109 GitHub
   repos). NOT fictional demo products.
4. DYNAMICS = working category tabs + Trending/Newest/Ending soon/Community-priority
   sorting + count-up animations + auto-rotating featured project + animated receipt
   cascades + ticker (exists).
5. CLAIMING RULE = GitHub-verified control: claimant signs in with GitHub, must own or
   hold push access on the repo (API-verified). Non-owners file a claim request →
   review queue. NEVER open claiming.
6. FORKS (PENDING-CONFIRMATION — timed-out round, defaults here are recommendations):
   - Entry: platform "Fork this unit" button → we mirror the user's actual GitHub fork
     (API-verified ownership of the fork).
   - Inheritance: 'Forked from <parent>' + parent's receipt history attributed (lineage);
     fork funding auto-splits upstream (default 10%, editable, cap 50%) — reuses the
     plugin-split mechanic. Fork starts with 0 funds; parent's PATRON funds never copy.
   - Forker auto-claims their fork (owning your fork repo IS the verification).
   - Forks need a new name — trademark rules of Q2 apply equally.
   - FORK RENT PRICING (Gui-confirmed 2026-10-16 night): the verified owner of a
     CLAIMED project sets the fork rent from PRESETS: 5% (open door) / 10% (standard,
     default) / 15% / 20% premium+ — ceiling 20%, floor 5%. Rate is PERMANENT for
     existing forks (grandfathered); changes affect only FUTURE forks. Unclaimed
     mirrors carry the platform default 10% (only a verified claimant sets custom
     rates — no squatter tolls). Donor-facing transparency: the fork's rent is shown
     before funding ("90% → fork team · 10% → upstream"). Time-limited rent terms
     (10%×5yr / 5%×10yr style licensing) = FUTURE refinement parked until real fork
     behavior data exists. One-hop rule above governs direction; combined cap with
     plugin splits: team keeps ≥50%.
   - FRACTAL FORKS (Gui-confirmed 2026-10-16 night): any fork can itself be forked —
     lineage is a TREE; UI shows the chain ("Forked from F2 ← F1 ← parent") + whole-
     ancestry receipt lineage. Anti-squat guard applies at EVERY hop (each fork needs
     ≥1 commit ahead of ITS parent to enter redirect menus).
   - FORKS ARE FIRST-CLASS PROJECTS (Gui-confirmed): from birth, a fork is claimed by
     its forker, and anyone can FUND A FORK DIRECTLY like any other unit. The
     redirect mechanism is ONLY the safety valve (dead pools / passing of the baton)
     + competition incentive — never a fork's funding dependency.
   - One-hop upstream rule (RECOMMENDED DEFAULT, pending confirmation): fork → parent
     shares flow ONE hop up the chain per link (each link default 10%, editable);
     grandchildren share with their parent only — deep chains must not multiply
     overhead to starving leaves.
   - No-gates clarification: gates exist ONLY on identity/control (anti-impersonation).
     Funding, following, voting, forking-at-will = open. No gatekeepers.
7. PARKED FUNDS (revised 2026-10-16 evening — supersedes the 6-month version):
   "The Passing of the Torch" mechanism:
   - Disclosure at funding: unclaimed → tokens parked; day 90 they follow the
     community (choose a fork / another project / silence = majority-follow; opt-out
     preset at payment: "return to my balance if unclaimed").
   - Claim window day 0→90 anchored to the PROJECT'S FIRST PLEDGE (one date per
     project). Claim (GitHub-verified) → all parked tokens credit instantly.
   - Creator urgency: email at day 60 ("funds parked on YOUR project — claim it").
   - Day 90 with forks existing: REDIRECT PERIOD (30 days) — per-user allocation,
     no winner-takes-all; the vote IS the allocation; silence = follow the majority
     (delegated, disclosed, changeable until close).
   - Fork eligibility for the redirect menu: owner + ≥1 real commit ahead of parent
     (GitHub API) — anti-squat guard.
   - Day 90 with NO forks: parked tokens convert to the patron's platform credit +
     notice (the legal pressure valve; never zero-out).
   - Law: no surprise transfers (all defaults disclosed at funding + changeable
     anytime). Money stays in tokens; ToS counsel before real charges.
8. LEGAL POSTURE = descriptive naming + permanent disclaimer ("Independent, not
   affiliated, creator has not endorsed this") + NO logos/wordmarks + themed AI art +
   takedown on request (honor same-day, no fight).
9. OUTREACH = later milestone, only after claim flow + ToS exist; then email creators
   ("your project is live here; claim it to unlock donations").
11. STEWARDSHIP SWEEP (Gui-confirmed 2026-10-16 night):
   - Managers actively claim incoming tokens via a "Claim available tokens" button on
     the project page (anytime, one click). No forced cadence.
   - Per-token sweep-age clock: ≤30d quiet; 30d+ amber notice on project page +
     dashboard ("tokens pending your claim"); 90d+ UNSWEPT → those tokens enter the
     fork redirect pool. Every token is either swept or aging toward redirection —
     no dead pools can form.
   - The last-sweep timestamp is PUBLIC (stewardship pulse as a receipt).
12. VERIFICATION LADDER (Gui-confirmed): 1) GitHub OAuth instant (own/push via API);
    2) claim-file-in-repo (COMPUTE-FUND.toml with claim code pushed to the repo's
    default branch — works on ANY git host, verified by fetch); 3) DNS TXT record at
    the project's domain; 4) review queue (evidence incl. email from the project's
    own domain) — human review. Ladder order = automation order.
13. INFRA-STATE: Supabase is LIVE as of 2026-10-16 (mock mode = fallback only) — mirror
    data seeds the real DB; schema needs image_url + mirror/claim/stewardship columns,
    added idempotently.

## User stories
1. As a visitor, I want a striking hero with a project photo, so I immediately understand this is a working platform.
2. As a visitor, I want live platform stats in the status bar (patrons/active runs/receipts), so I trust activity.
3. As a visitor, I want to browse by category chips, so I find work I care about fast.
4. As a visitor, I want a big Featured Project card with photo + funding bar + receipts line, so I get the platform in one look.
5. As a visitor, I want Recommended cards with photos, funded %, patron counts and tags, so I can pick where to give.
6. As a visitor, I want to filter with Trending/Newest/Ending soon/Community priority, so sorting feels alive.
7. As a visitor, I want the featured project to auto-rotate, so repeat visits show me breadth.
8. As a visitor, I want receipts to cascade in, so the "you watch the commons work" feel is real.
9. As a donor, I want to SEE if a project is UNCLAIMED before paying, so I know funds park until a verified creator claims.
10. As a donor, I want my parked funds traceable and time-boxed, so my money is never dead or abandoned.
11. As a creator, I want to find my own project mirrored, and claim it by verifying my GitHub control, so I unlock funding with zero marketing funnel.
12. As a creator, I want to know my brand is treated fairly (no logos, disclaimer, takedown), so I don't fear being impersonated.
13. As a fork author, I want my fork to carry the parent's receipt lineage, so my work inherits credibility.
14. As a fork author, I want to auto-claim my own fork, so I can compete on merit instantly.
15. As a platform owner (Gui), I want claims verified, so impersonation never happens.
16. As the community, I want forked projects to share a slice upstream, so competition doesn't starve the original work.

## Implementation decisions
- New landing page structure: status bar (exists) → nav (search + Explore/How it works/For creators/Sign in + Fund a run) → hero (headline + Explore/How-it-works + hero panel photo + handwritten-style annotation) → category chips → Featured Project panel (photo card + side stats) → Recommended grid (tabs + 4 cards) → Open-for-funding compact strip (B-style) → value-props row (3 panels) → live ticker (exists).
- Data: projects table gains image_url, mirror_url (github), claim_status (unclaimed|claimed|fork), claimed_by, parked_cents, featured flag, upstream_split — added via idempotent SQL migration; mirror seeded only from the approved roster.
- Photos: partner-model generation at seed time (one themed art per project, 4:3 and wide hero crops); stored where the app serves them; hero image for featured.
- Sorting tabs computed from real data (votes/date/(goal-funded)/claim+priority).
- Count-up + rotating featured + receipt cascade = CSS/JS light motion, prefers-reduced-motion respected.
- Claim flow: GitHub OAuth → repo-control check via API → claim (or claim request). UI button on unclaimed units NOW, verification goes LIVE when GitHub provider keys land.
- ToS page skeleton with the disclaimer + parked-funds + expiry language (required before ANY real charge goes live on unclaimed mirrors).

## Testing decisions
- Seams: REST endpoints + the rendered page (Playwright screenshot + click-through), like the M-1 verification.
- Photo pipeline verified by generating ONE image end-to-end before batch.
- Claim verification seam = GitHub API "viewer has push access" path (mock-mode testable pre-OAuth-keys).

## Out of scope (this pass)
- Real money movement changes (parked accounting is bookkeeping; Stripe wiring is its own milestone)
- Outreach emails; on-chain "open to verify" language (mockup says on-chain — receipts stay honest off-chain ledger for v1)
- Mobile responsiveness (desktop-first law)

## Further notes
- Mockup's "on-chain and open to verify" line = aspiration language; do NOT claim on-chain until receipts actually are. Honest copy until then.
- The 3 seed demo projects (Astra/Clinic/BugBounty) remain as platform-owned demo units, clearly labeled, until replaced by real mirrors.