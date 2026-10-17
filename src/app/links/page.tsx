import type { Metadata } from "next";
import LinkTree from "@/components/LinkTree";

export const metadata: Metadata = {
  title: "CommonWeave Labs — Links",
  description: "Compute Fund, open AI tooling, and community-funded machine-time.",
};

export default function LinksPage() {
  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center bg-bg px-4 py-12 sm:px-6">
      <div className="w-full max-w-xl">
        <header className="mb-8 flex items-center justify-between border-b border-line pb-4">
          <span className="mono text-[11px] tracking-widest text-dim">COMMONWEAVE LABS</span>
          <span className="mono text-[11px] tracking-widest text-amber">/links</span>
        </header>

        <LinkTree />

        <footer className="mt-8 flex items-center justify-between border-t border-line pt-4">
          <span className="mono text-[10px] tracking-widest text-dim">MACHINE-TIME, PUBLIC RECEIPTS</span>
          <span className="mono text-[10px] tracking-widest text-dim">NO INVESTORS</span>
        </footer>
      </div>
    </main>
  );
}