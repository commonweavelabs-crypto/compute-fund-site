# Compute Fund v0 — Mission

## One-Line Mission

Build a community-funded AI compute platform where anyone can fund compute to solve problems, cover popular questions/ideas, and directly fund new projects.

## Expanded Mission

Compute Fund lets supporters contribute compute credits to projects, questions, and ideas. Creators can add a project, supporters can fund compute credits, the project balance and priority score update, compute runs generate public receipts, and the ledger records money in and compute out. The manifesto framing avoids investment, share, and return language.

## Current Build Status

The v0 prototype is local and seeded. It demonstrates the core mechanics before live Stripe, Supabase, and model-provider credentials are connected:

- Creators can add a project
- Supporters can fund compute credits
- Project balance and priority score update
- Compute runs generate public receipts
- Ledger records money in and compute out
- Manifesto framing avoids investment/share/return language

## Goals

### Immediate
- Complete the working v0 prototype pages (landing, project list/detail, funding, receipts)
- Connect local seeded state to Supabase reads and mutations

### Near-Term
- Ship a minimum viable product (past v0)
- Add Stripe checkout and webhook routes
- Add provider adapters for OpenAI, Anthropic, and xAI receipts
- Token efficiency incentive system — estimates vs actuals, leftover tokens rewarded to teams
- Community voting on milestones — upvote/downvote, priority ranking
- Team rating system — 1-5 stars, reviews, Top Performer / Needs Improvement badges
- Plugin/dependency revenue split editor — transparent splits shown on project pages
- Open-knowledge opt-in — projects that choose to open-source all generated data to the community
- Contribution tier system — subscription/patronage levels unlock LLM token allowances on the platform

### Long-Term
- Full community funding platform
- Popular questions/ideas coverage
- Direct project funding on-platform
- Community-voted platform fee percentage
- Cross-team token transfers (stack, transfer, external)
- Democratic governance over AI compute allocation

## Why This Matters Now

Mark Zuckerberg's August 2026 essay "The Future Is For Everyone" proposes three principles: individual empowerment, invention over automation, and balance of power. But his implementation contains a fatal contradiction — free baseline compute for everyone, with a dynamic auction for additional compute. The result: whoever can afford more gets more intelligence, creating a **permanent capability underclass**.

**Compute Fund v0 is the antidote.**

Instead of one company controlling the spigot, we let communities fund the projects that matter to them. The crowd decides what gets built, not a central allocator. This is decentralized, crowdsourced compute — exactly what Zuck's essay calls for but fails to deliver.

## Core Values (from Zuck Essay Analysis)

1. **Individual empowerment with meaningful access** — not toy compute, but enough to run a real project
2. **Invention over automation** — fund creation, not displacement. The platform rewards builders and problem-solvers
3. **Balance of power through distribution** — no single entity controls who gets compute; the crowd decides
4. **No permanent underclass** — anyone with a good idea can get funded, regardless of starting capital

## v0 Principle

Fund AI work. See every run. Collect proof you helped.
