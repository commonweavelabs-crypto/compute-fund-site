import Link from "next/link";
import type { Metadata } from "next";

// ARCHIVED FRONT DOOR (2026-11-04, per the consolidation pass): the rich v0
// reference app lives at /archive — reachable, untouched. The platform of
// record is the main-line repo (commonweavelabs-crypto/compute-fund), which
// carries the live auth/funding/receipts/claim rails. The public surface
// returns at the live domain when it goes to production.
export const metadata: Metadata = {
  title: "Compute Fund — archived design reference (v0)",
  robots: { index: false, follow: false },
};

export default function ArchivedFrontDoor() {
  const row = { display: "flex", gap: 8, margin: "14px 0" } as const;
  const link = { color: "#7ef0b0", textDecoration: "underline" } as const;
  const card = {
    border: "1px solid #22402f", borderRadius: 12, padding: "18px 22px",
    background: "#0b1410", maxWidth: 560, marginTop: 22,
  } as const;
  return (
    <main style={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace", background: "#08110d", color: "#d7ead9", minHeight: "100vh", padding: "48px 24px" }}>
      <p style={{ letterSpacing: 3, color: "#7ef0b0", fontSize: 12 }}>COMPUTE FUND — COMMONWEAVE LABS</p>
      <h1 style={{ fontSize: 30, margin: "10px 0 6px" }}>This page is the archived design reference (v0).</h1>
      <p style={{ maxWidth: 620, lineHeight: 1.6 }}>
        The platform of record — auth, funding, governed compute, public receipts, the
        claim flow — lives in the main-line repository and its current deployment. The
        v0 reference kept everything that made it worth studying: the art batch, the
        living hero, the interaction ideas. Nothing was deleted; it moved to{" "}
        <Link href="/archive" style={link}>/archive</Link>.
      </p>
      <div style={card}>
        <p style={{ marginTop: 0, color: "#7ef0b0" }}>IF YOU ARE LOOKING FOR</p>
        <div style={row}>The real platform → <span>the current deployment (dev tunnel / live domain when announced)</span></div>
        <div style={row}>The v0 experience → <Link href="/archive" style={link}>/archive — the full old app</Link></div>
        <div style={row}>The terms → <Link href="/tos" style={link}>/tos</Link></div>
        <div style={row}>The source of record → <a style={link} href="https://github.com/commonweavelabs-crypto/compute-fund" target="_blank" rel="noopener noreferrer">github.com/commonweavelabs-crypto/compute-fund</a></div>
      </div>
      <p style={{ color: "#5c7466", fontSize: 13, marginTop: 24 }}>
        Patronage, not investment — no equity, no returns. Compute credits are prepaid,
        single-purpose and non-transferable. Public receipts for every run.
      </p>
    </main>
  );
}
