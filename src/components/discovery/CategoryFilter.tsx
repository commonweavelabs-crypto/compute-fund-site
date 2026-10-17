"use client";

// Category multi-select chips — mono uppercase, phos when selected.

import { ALL_CATEGORIES, type Category } from "@/types/compute-fund";

type CategoryFilterProps = {
  selected: Category[];
  onToggle: (category: Category) => void;
};

export default function CategoryFilter({ selected, onToggle }: CategoryFilterProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="mono text-[11px] uppercase tracking-[0.14em] text-dim">categories ▸</p>
      {ALL_CATEGORIES.map((cat) => {
        const active = selected.includes(cat);
        return (
          <button
            key={cat}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(cat)}
            className={`mono uppercase tracking-[0.14em] px-2 py-1 text-[11px] border ${
              active
                ? "border-phos bg-phos/10 text-phos"
                : "border-line bg-panel text-dim hover:border-phos hover:text-phos"
            }`}
          >
            {active ? "▸ " : ""}
            {cat}
          </button>
        );
      })}
    </div>
  );
}