import type { Metadata } from "next";

// /tos — How funding works: the mirror-claim model, the torch, and the sweep.
// Required before ANY real charge goes live on unclaimed mirrors (spec law).

export const metadata: Metadata = {
  title: "How funding works — Compute Fund",
  description:
    "The mirror-claim model: parked tokens, verified claiming, the passing of the torch, and stewardship sweeps — in plain language.",
};

const SECTIONS: { head: string; lines: string[] }[] = [
  {
    head: "The premise",
    lines: [
      "Compute Fund is patronage, not investment: you fund machine-time for open-source work you believe in. No equity, no profit rights, no returns, no investors — patrons and receipts only.",
    ],
  },
  {
    head: "Mirror units — and what they are not",
    lines: [
      "Many units on this platform are INDEPENDENT MIRRORS of real open-source projects, listed by the community so open work can collect compute support.",
      "A mirrored unit is not affiliated with, endorsed by, or operated by the original project unless it appears as CLAIMED. We do not use project logos or brand marks; illustration art is original and themed on the work, not on any trademark.",
      "Rights holders who want a unit changed or removed can request takedown — honored promptly, no fight.",
    ],
  },
  {
    head: "Parked tokens — before a claim",
    lines: [
      "Funding an UNCLAIMED unit parks the tokens: nothing is released, and the card told you so before you paid.",
      "The claim window runs 90 days from the unit's first funding. A verified maintainer claiming within the window releases everything to the project instantly.",
      "If nobody claims by day 90 and forks exist, patrons choose where their tokens go — a fork, or another project. Your own allocation is your vote; there is no winner-takes-all sweep of anyone's tokens.",
      "If a patron does nothing, their tokens follow the community majority (allocated early to the leading destination). If you prefer certainty, choose 'return to my balance if unclaimed' when funding — set it once, and your tokens always come back to your platform credit instead.",
      "If no forks exist at expiry, all parked tokens return to each patron's credit balance automatically. Tokens never vanish while a unit remains unclaimed.",
    ],
  },
  {
    head: "Keeping claimed projects honest",
    lines: [
      "Maintainers of claimed units sweep incoming tokens with the 'claim available tokens' action on their project page — no schedule, one click, and the timestamp is public on the unit.",
      "Tokens left unswept show an amber notice after 30 days and, after 90 days, enter the same redirect pool as unclaimed work. A project nobody stewards passes the torch; the community carries what it wants forward.",
    ],
  },
  {
    head: "Verification",
    lines: [
      "Claiming requires proof of control, in automation order: (1) sign in with GitHub and hold ownership or push access on the mirrored repository; (2) push a COMPUTE-FUND.toml claim file with your claim code to the repository's default branch (works on any git host); (3) add a DNS TXT record at the project's website; or (4) file a manual claim request with evidence from the project's own domain — reviewed by the stewards.",
      "Impersonation is the one gate: proving you control the work. Funding, following, voting, and forking stay open to everyone.",
    ],
  },
  {
    head: "Forks and the fractal",
    lines: [
      "Any unit may be forked; forks are first-class projects: claimed by their forker, fundable directly, with a new name and public lineage ('forked from ...' chains).",
      "Fork rent: a claimed project's verified owner sets what building on their work costs — presets from 5% to 20%, one hop up the lineage. Existing forks keep their locked rate forever; changes affect only new forks.",
      "Rent flows one hop up the lineage. When the parent unit is still unclaimed, the rent parks there too — original creators who claim late collect everything their forks' success has been accumulating.",
    ],
  },
  {
    head: "Tokens, not money",
    lines: [
      "The platform deals in compute tokens and run receipts, published openly. There are no investors anywhere in the ledger. These terms cover test-phase operation; production payment terms arrive with live payments, drafted with counsel, and will be summarized here in the same plain language.",
    ],
  },
];

export default function TosPage() {
  return (
    <main className="mono mx-auto max-w-3xl px-4 py-10 text-[12px] leading-6 text-dim sm:px-6">
      <p className="text-[11px] uppercase tracking-[0.2em] text-amber">transparency</p>
      <h1 className="display mt-3 text-4xl font-semibold tracking-tight text-tx">
        How funding works
      </h1>
      <p className="mt-3">
        Plain language, no fine print games. The receipts are the product; this page is
        their rulebook.
      </p>

      <div className="mt-8 space-y-6">
        {SECTIONS.map((section) => (
          <section key={section.head} className="border border-line bg-panel">
            <div className="border-b border-line bg-panel2 px-4 py-2">
              <h2 className="text-[11px] uppercase tracking-[0.14em] text-phos">
                <span className="live" />
                {section.head}
              </h2>
            </div>
            <div className="space-y-3 p-4">
              {section.lines.map((line) => (
                <p key={line.slice(0, 24)}>&gt; {line}</p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <a href="/" className="mt-8 inline-block text-dim transition hover:text-phos">
        &lt; back to the commons
      </a>
    </main>
  );
}