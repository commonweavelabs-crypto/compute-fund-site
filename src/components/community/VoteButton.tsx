"use client";

// ▲ vote button — Terminal Commons mono styling, no emojis.

type VoteButtonProps = {
  count: number;
  onVote: () => void;
  disabled?: boolean;
  hasVoted?: boolean;
};

export default function VoteButton({ count, onVote, disabled = false, hasVoted = false }: VoteButtonProps) {
  const active = !disabled && !hasVoted;

  return (
    <button
      type="button"
      onClick={onVote}
      disabled={!active}
      title={hasVoted ? "vote recorded" : active ? "cast vote" : "voting unavailable"}
      className={`mono flex items-center gap-2 border px-2 py-1 text-[11px] ${
        hasVoted
          ? "border-phos text-phos"
          : active
            ? "border-line bg-panel text-tx hover:border-phos hover:text-phos"
            : "border-line bg-panel text-dim"
      }`}
    >
      <span aria-hidden="true">▲</span>
      <span>{count > 0 ? count.toLocaleString() : "0"}</span>
    </button>
  );
}