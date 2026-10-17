"use client";

// Star-glyph rating form: 'stars' via ★ buttons, optional written review.

import { useState } from "react";

type RatingFormProps = {
  onSubmit: (rating: number, review: string) => void;
  disabled?: boolean;
  compact?: boolean;
};

const STARS = [1, 2, 3, 4, 5];

export default function RatingForm({ onSubmit, disabled = false, compact = false }: RatingFormProps) {
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const settled = rating > 0;
  const canSubmit = settled && !disabled;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(rating, review.trim());
  };

  return (
    <div className={compact ? "flex items-center gap-3" : "flex flex-col gap-3"}>
      {!compact && (
        <p className="mono text-[11px] uppercase tracking-[0.14em] text-dim">rate this team&apos;s work</p>
      )}
      <div className="flex items-center gap-1">
        {STARS.map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onClick={() => setRating(n)}
            className={`mono text-[13px] leading-none ${
              n <= rating ? "text-amber" : "text-dim"
            } ${disabled ? "opacity-40" : "hover:text-tx"} px-0.5`}
          >
            ★
          </button>
        ))}
        {compact ? (
          <span className="mono ml-1 text-[11px] text-dim">{rating > 0 ? `${rating}/5` : "stars"}</span>
        ) : null}
      </div>
      {!compact && (
        <textarea
          value={review}
          onChange={(e) => setReview(e.target.value)}
          disabled={disabled}
          placeholder="optional review — receipts appreciated"
          rows={2}
          className="mono w-full border border-line bg-panel2 px-2 py-1.5 text-[11px] text-tx placeholder:text-dim focus:border-phos focus:outline-none"
        />
      )}
      {!compact && (
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className={`mono px-3 py-1 text-[11px] uppercase tracking-[0.14em] ${
            canSubmit
              ? "border border-phos bg-phos text-bg"
              : "border border-line bg-panel text-dim"
          }`}
        >
          {disabled ? "⟳ locked" : "submit rating"}
        </button>
      )}
    </div>
  );
}