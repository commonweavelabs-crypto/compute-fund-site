import Link from "next/link";

export type LinkCard = {
  title: string;
  description: string;
  href: string;
  /** open in a new tab (external ecosystem links) */
  external?: boolean;
  /** renders a mono "soon" tag and disables the link */
  soon?: boolean;
};

const LINKS: LinkCard[] = [
  {
    title: "Compute Fund",
    description: "Fund AI compute for real problems — every run lands on a public receipt.",
    href: "/",
  },
  {
    title: "ComfyUI Video UI",
    description: "Open video-pipeline tooling, built and maintained in public.",
    href: "https://github.com/commonweavelabs-crypto",
    external: true,
  },
  {
    title: "GitHub",
    description: "Source, issues, and roadmap work-in-progress from the labs.",
    href: "https://github.com/commonweavelabs-crypto",
    external: true,
  },
  {
    title: "YouTube",
    description: "Build walkthroughs, run commentary, and field notes.",
    href: "https://www.youtube.com/@CommonWeaveLabs",
    external: true,
  },
  {
    title: "X / Twitter",
    description: "Funding calls, spend receipts, and short lab signals.",
    href: "https://x.com/CommonweaveLab",
    external: true,
  },
];

const SOON_LINKS: LinkCard[] = [
  {
    title: "Discord",
    description: "Community room for proposal debates and live run reviews.",
    href: "#",
    soon: true,
  },
];

function External({ className }: { className?: string }) {
  return (
    <span className={`mono text-dim ${className ?? ""}`} aria-hidden="true">
      ↗
    </span>
  );
}

export default function LinkTree() {
  return (
    <div className="flex w-full flex-col gap-3">
      {/* top CTA */}
      <Link
        href="/"
        className="group flex items-center justify-between gap-4 border border-phos/40 bg-panel px-5 py-5 transition-colors hover:bg-panel2"
      >
        <span className="flex min-w-0 flex-col gap-1.5">
          <span className="mono flex items-center text-[11px] tracking-widest text-phos">
            <span className="live" />
            COMMONWEAVE LABS
          </span>
          <span className="display text-balance text-lg leading-snug text-tx sm:text-xl">
            Support our work — fund AI compute for real problems
          </span>
        </span>
        <span className="mono shrink-0 text-xl text-phos transition-transform group-hover:translate-x-0.5" aria-hidden="true">
          →
        </span>
      </Link>

      {/* live links */}
      {LINKS.map((item) =>
        item.external ? (
          <a
            key={item.title}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center justify-between gap-4 border border-line bg-panel px-5 py-4 transition-colors hover:bg-panel2"
          >
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-base text-tx">{item.title}</span>
              <span className="text-[13px] leading-snug text-dim">{item.description}</span>
            </span>
            <External className="shrink-0 text-base transition-colors group-hover:text-phos" />
          </a>
        ) : (
          <Link
            key={item.title}
            href={item.href}
            className="group flex items-center justify-between gap-4 border border-line bg-panel px-5 py-4 transition-colors hover:bg-panel2"
          >
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-base text-tx">{item.title}</span>
              <span className="text-[13px] leading-snug text-dim">{item.description}</span>
            </span>
            <span className="mono shrink-0 text-base text-dim transition-colors group-hover:text-phos" aria-hidden="true">
              →
            </span>
          </Link>
        ),
      )}

      {/* placeholders, clearly not clickable */}
      {SOON_LINKS.map((item) => (
        <div
          key={item.title}
          aria-disabled="true"
          className="flex items-center justify-between gap-4 border border-line bg-panel px-5 py-4 opacity-60"
        >
          <span className="flex min-w-0 flex-col gap-1">
            <span className="flex items-center gap-2">
              <span className="text-base text-tx">{item.title}</span>
              <span className="mono border border-line px-1.5 py-0.5 text-[10px] leading-none tracking-widest text-dim">
                soon
              </span>
            </span>
            <span className="text-[13px] leading-snug text-dim">{item.description}</span>
          </span>
          <span className="mono shrink-0 text-base text-dim" aria-hidden="true">
            ·
          </span>
        </div>
      ))}
    </div>
  );
}