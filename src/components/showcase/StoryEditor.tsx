"use client";

// Story editor (spec: "Project page = the showcase" — description + story,
// owner/manager write). Plain textarea in v0; props-driven, self-contained.

import { useEffect, useState } from "react";

type StoryEditorProps = {
  story: string | null | undefined;
  onSave: (story: string) => void | Promise<void>;
  saving?: boolean;
  disabled?: boolean;
  maxLength?: number;
};

export default function StoryEditor({
  story,
  onSave,
  saving = false,
  disabled = false,
  maxLength = 5000,
}: StoryEditorProps) {
  const [value, setValue] = useState(story ?? "");
  const [dirty, setDirty] = useState(false);

  // Re-sync when the parent loads the persisted story (different from this
  // editor's uncommitted local edits).
  useEffect(() => {
    if (!dirty) setValue(story ?? "");
  }, [story, dirty]);

  const edit = (next: string) => {
    setValue(next);
    setDirty(true);
  };

  const save = async () => {
    if (!dirty || disabled || saving) return;
    await onSave(value.trim().slice(0, maxLength));
    setDirty(false);
  };

  const canSave = dirty && !disabled && !saving;

  return (
    <section aria-label="Project story" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="mono text-[11px] uppercase tracking-[0.14em] text-dim">the story</p>
        {dirty && (
          <span className="mono text-[10px] uppercase tracking-[0.14em] text-amber">
            unsaved
          </span>
        )}
      </div>

      <textarea
        value={value}
        onChange={(e) => edit(e.target.value)}
        disabled={disabled || saving}
        aria-label="Project story — what this project is and why it matters"
        rows={8}
        maxLength={maxLength}
        placeholder="what this project is, how it will spend its compute, what success looks like"
        className="mono w-full border border-line bg-panel2 px-2 py-1.5 text-[12px] leading-relaxed text-tx placeholder:text-dim focus:border-phos focus:outline-none disabled:opacity-50"
      />
      <p className="mono text-[10px] text-dim" aria-live="polite">
        {value.length}/{maxLength}
      </p>

      <button
        type="button"
        onClick={save}
        disabled={!canSave}
        className={`mono self-start px-3 py-1 text-[11px] uppercase tracking-[0.14em] ${
          canSave ? "border border-phos bg-phos text-bg" : "border border-line bg-panel text-dim"
        }`}
      >
        {saving ? "saving" : "save story"}
      </button>
    </section>
  );
}