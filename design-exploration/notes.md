# Compute Fund — First UI Page · Design Exploration Round 01

Date: 2026-10-06 · Method: oil-ui skill (design-direction + style-explorer) · Status: awaiting Gui's pick

## Task
Explore three distinct design directions for Compute Fund's first UI page (project card grid +
funding progress + patron tier buttons), all derived from the manifesto ethos and rendered as one
offline side-by-side comparison page for Gui to choose from. Baseline: existing v0 deep-green page
NOT modified — read at src/app/page.tsx.

## Ethos distilled from MANIFESTO.md
- Radical transparency: every run produces a public receipt (model, tokens, cost, output);
  ledger fully auditable — receipts are the product, not a feature.
- Patronage language only: supporters/patrons/community; NEVER investors, returns, shares.
- Community decides: milestone votes, community-priority badges, team ratings.
- No gatekeepers / no underclass: distributed allocation vs Zuck's pay-more auction.
- Anti-AI-slop: no dark-purple-glow landing template (antislop skill spirit honored).

## Category & benchmark read (oil-ui step 1)
Category: crowdfunding platform (Kickstarter-like) + public ledger (audit tool). Benchmarks torn
down for what to keep/drop: Kickstarter (content-first grid, big funded-% figure, deadline
pressure — kept), Stripe Dashboard (clean data rows — kept in D3 only), civic posters/ledgers
(the engines, not clones). v0 kept: grid-of-projects, card-per-project, tier buttons; v0 dropped:
deep-green palette, soft-grey dashboard neutrality, generic 3-button footers everywhere.

## The three directions

### 01 — Carbon Ledger   (engine: historical medium × frontier tech — audit ledger as document)
- North star: "Using it feels like reading a trustworthy public filing cabinet, not a storefront."
- Audience: researchers, grant officers, audit-minded patrons. Hero: the ledger card itself.
- Palette: paper #f4efe3 / ink #181614 / audit-seal red #b3372b (+ #3e6b3a green accents).
- Type: serif (Iowan/Georgia) titles+body, mono for every number/ledger line — human speaks
  serif, machine speaks mono.
- Observable traits: aged-paper + faint ruled texture, dashed perforation rules, dotted leader
  lines between labels and values, 45°-hatched ink progress bar with mono % overlay, red PATRON
  tier table, "View full receipt / Sign commitment" actions.
- Motion (if built): paper register — new receipt line types itself in like a typewriter strike;
  hatched bar fills with ink-bleed ease; "Sign commitment" presses a seal down 2px.
- Gives up: rounded-soft dashboard friendliness, flat bright accent blocks.

### 02 — Public Address   (engine: specific scene — civic kiosk / public noticeboard)
- North star: "The community decides — the page announces it like serious street media."
- Audience: the broad crowd (first-time backers, community voters). Hero: giant funding-% figure.
- Palette: wheat paper #fbf7f1 / notice-board black #111111 / civic red #d43d1a
  (+ #141c46 blue category tags).
- Type: Archivo Black/Arial Black uppercase display (percent IS the headline, 56px), Work Sans
  summaries, mono uppercase metadata.
- Observable traits: 3px black borders everywhere, block-segment funding bar (each block = a
  funding chunk), poster-strip headers, blue civic tags overlapping the frame, receipt strip per
  card, FUND THIS / READ RECEIPTS split footer.
- Motion (if built): poster register — percent rolls up split-flap on load, bar blocks snap in
  200ms, community-priority tag flips rotateX; hero move: border flashes red for one beat at 100%.
- Gives up: subtle pastel tints, thin lines, dashboard density.

### 03 — Terminal Commons   (engine: role prototype — master control panel of shared machine-time)
- North star: "The public receipt IS the interface — you watch the commons work."
- Audience: builders, agents-economy natives, technical patrons. Hero: streaming receipt block.
- Palette: near-black #0c1013 / phosphor green #5cff9d / amber #ffc95c / signal red #ff6b57.
- Type: mono for machine voice (streams, tiers, ticker), sans only for human-chosen unit titles
  (Inter 16px) — mono is the machine, sans is the people.
- Observable traits: live receipt stream per unit (run · model · −cost · ✓ output), glowing
  gauge + neon bar, amber unit IDs/priority, ▸-selected tier rows, live-ledger ticker, status
  bar reading "investors: none", voting/rating lines (▲votes, ★team).
- Motion (if built): instrument register — receipt lines cascade in 30ms steps, patron counter
  ticks live, gauge breathes once per confirmed run (no loops); hero move: funding appends
  yourself into the public stream.
- Deliberately NOT the AI slop template: no purple gradients, no floating particles, no glow
  diffuse blobs — mono receipt typography carries the identity, color is functional signal.
- Gives up: warm human materials, photography-friendly surfaces.

## Difference check (passed)
- Skeletons differ: D1 = document cards on ruled paper; D2 = poster wall with %-as-headline and
  block bars; D3 = dark instrument grid with streaming panels.
- Four-item test: any two directions share at most one of {skeleton, type, palette, hero}.
- Not split by light/dark: D1 wheat vs D2 ivory differ by hue/material (paper vs poster), D3 dark
  is justified by the terminal engine, not as "the dark option".
- At least one extreme: D3 (mono-led dark, anti-dashboard). At least one breaks category
  convention: D2's percent-as-headline card structure.
- None collide with the deep-green v0 baseline; baseline shown as "现状" candidate 01 (现状 slot).

## Files
- manifest.json — explorer manifest with full direction cards
- candidates/00-baseline-v0.html, 01-carbon-ledger.html, 02-public-address.html, 03-terminal-commons.html
- compare.html — the offline single-file comparison page (open directly in any browser)
- shots/ — verification screenshots (1280x900, full shell + scroll to 4th candidate)
- report.json issues: only favicon 404 (environment, not UI). No layout/console/paint problems.

## Verification done
- build_explorer.py ran clean: 4 candidates embedded, single offline file.
- Screenshots inspected: all 4 candidates render distinctly; text legible at comparison size;
  no blank frames, no clipping. Selection button (选择), per-candidate notes and design说明
  toggle present in the explorer shell.

## Not done (honest gaps)
- Motion described in cards but not implemented (exploration round = static mockups by design).
- No independent isolated reviewer pass; this round goes to Gui first per oil-ui protocol.
- page.tsx untouched, as required.