// Team rating aggregate: big mono average + count + badge + recent reviews.

import type { TeamProfile } from "@/types/compute-fund";
import { teamBadge } from "@/types/compute-fund";
import type { TeamReview } from "@/lib/ratings";

type TeamRatingProps = {
  profile: TeamProfile;
  reviews?: TeamReview[];
};

function stars(avg: number): string {
  const filled = Math.round(avg);
  return "★".repeat(Math.max(0, filled)) + "✩";
}

export default function TeamRating({ profile, reviews = [] }: TeamRatingProps) {
  const badge = teamBadge(profile.teamRating, profile.ratingCount);

  return (
    <div className="border border-line bg-panel">
      <div className="flex items-center gap-3 border-b border-line bg-panel2 px-3 py-2">
        <p className="mono text-[11px] uppercase tracking-[0.14em] text-dim">team rating</p>
        <span className="live" />
        <span className="mono text-[11px] text-dim">{profile.name}</span>
        {badge && (
          <span
            className={`mono border px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] ${
              badge === "Top Performer" ? "border-phos text-phos" : "border-red text-red"
            }`}
          >
            {badge}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-3 px-3 py-3">
        <span className="mono text-[32px] leading-none text-phos">
          {profile.ratingCount > 0 ? profile.teamRating.toFixed(1) : "—"}
        </span>
        <span className="mono text-[11px] text-dim">{stars(profile.teamRating)}</span>
        <span className="mono text-[11px] text-dim">
          {profile.ratingCount > 0 ? `${profile.ratingCount} ratings` : "unrated"}
        </span>
      </div>
      {reviews.length > 0 && (
        <div className="stream-line border-t border-line px-3 py-2">
          <p className="mono mb-2 text-[11px] uppercase tracking-[0.14em] text-dim">recent reviews ▸</p>
          <ul className="flex flex-col gap-2">
            {reviews.map((r) => (
              <li key={r.id} className="mono text-[11px] text-tx">
                <span className="text-amber">{"★".repeat(r.rating)}</span>
                <span className="text-dim"> {r.review}</span>
                <span className="ml-2 text-dim">{r.raterId}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}