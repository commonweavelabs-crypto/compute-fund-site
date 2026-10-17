Compute Fund v0 is the first working prototype for a community-funded AI compute platform.

The current build is local and seeded. It demonstrates the core mechanics before live Stripe,
Supabase, and model-provider credentials are connected:

- creators can add a project
- supporters can fund compute credits
- the project balance and priority score update
- compute runs generate public receipts
- the ledger records money in and compute out
- the manifesto framing is patronage-based (no investment, share, or return language)

## Run Locally

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Production Wiring

1. Create a Supabase project and run `supabase-schema.sql`.
2. Add the values from `.env.example`.
3. Create Stripe checkout and webhook routes.
4. Replace local seeded state with Supabase reads and mutations.
5. Add provider adapters for OpenAI, Anthropic, and xAI receipts.

## v0 Principle

Fund AI work. See every run. Collect proof you helped.
