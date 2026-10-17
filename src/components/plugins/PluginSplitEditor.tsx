"use client";

// Plugin split editor: rows of {name, owner, %, required}, live validation
// with remainder-to-team; readOnly renders the public split declaration.

import { useEffect, useMemo, useState } from "react";
import { validateSplits, type SplitLine } from "@/lib/plugins";

type PluginSplitEditorProps = {
  initialSplits: SplitLine[];
  onChange?: (splits: SplitLine[]) => void;
  disabled?: boolean;
  readOnly?: boolean;
};

function emptyRow(): SplitLine {
  return { pluginName: "", pluginOwner: null, splitPercentage: 10, isRequired: true };
}

export default function PluginSplitEditor({
  initialSplits,
  onChange,
  disabled = false,
  readOnly = false,
}: PluginSplitEditorProps) {
  const [rows, setRows] = useState<SplitLine[]>(initialSplits);

  useEffect(() => setRows(initialSplits), [initialSplits]);

  const validation = useMemo(() => validateSplits(rows), [rows]);

  if (readOnly) {
    const declared = rows.filter((r) => r.pluginName.trim() && r.splitPercentage > 0);
    if (declared.length === 0) {
      return (
        <p className="mono text-[11px] uppercase tracking-[0.14em] text-dim">
          no plugin splits declared — 100% to project team
        </p>
      );
    }
    const share = validation.total;
    const parts = declared.map((r) => `${r.pluginName} (${r.splitPercentage}%)`).join(", ");
    return (
      <p className="mono text-[11px] text-tx">
        This project shares {share}% with: {parts}.
        {validation.remainderToTeam > 0 ? ` Remaining ${validation.remainderToTeam}% funds the project team.` : ""}
      </p>
    );
  }

  const update = (i: number, patch: Partial<SplitLine>) => {
    if (disabled) return;
    const next = rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    setRows(next);
    onChange?.(next);
  };

  const addRow = () => {
    if (disabled) return;
    const next = [...rows, emptyRow()];
    setRows(next);
    onChange?.(next);
  };

  const removeRow = (i: number) => {
    if (disabled) return;
    const next = rows.filter((_, idx) => idx !== i);
    setRows(next);
    onChange?.(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="mono text-[11px] uppercase tracking-[0.14em] text-dim">plugin splits</p>
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={row.pluginName}
            onChange={(e) => update(i, { pluginName: e.target.value })}
            disabled={disabled}
            placeholder="plugin name"
            className="mono w-40 border border-line bg-panel2 px-2 py-1 text-[11px] text-tx placeholder:text-dim focus:border-phos focus:outline-none"
          />
          <input
            value={row.pluginOwner ?? ""}
            onChange={(e) => update(i, { pluginOwner: e.target.value || null })}
            disabled={disabled}
            placeholder="owner"
            className="mono w-32 border border-line bg-panel2 px-2 py-1 text-[11px] text-tx placeholder:text-dim focus:border-phos focus:outline-none"
          />
          <input
            type="number"
            min={0}
            max={100}
            value={row.splitPercentage}
            onChange={(e) => update(i, { splitPercentage: Number(e.target.value) })}
            disabled={disabled}
            className="mono w-16 border border-line bg-panel2 px-2 py-1 text-[11px] text-amber focus:border-phos focus:outline-none"
          />
          <label className="mono flex items-center gap-1 text-[11px] text-dim">
            <input
              type="checkbox"
              checked={row.isRequired}
              onChange={(e) => update(i, { isRequired: e.target.checked })}
              disabled={disabled}
              className="accent-[var(--phos)]"
            />
            required
          </label>
          <button
            type="button"
            onClick={() => removeRow(i)}
            disabled={disabled}
            className="mono border border-line bg-panel px-2 py-1 text-[11px] text-dim hover:border-red hover:text-red"
          >
            ✕
          </button>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={addRow}
          disabled={disabled}
          className="mono border border-line bg-panel px-2 py-1 text-[11px] text-tx hover:border-phos hover:text-phos"
        >
          ▸ add plugin
        </button>
        <span
          className={`mono text-[11px] ${validation.valid ? "text-dim" : "text-red"}`}
        >
          {validation.valid ? "✓" : "✕"} total {validation.total}% · remainder to team {validation.remainderToTeam}%
        </span>
      </div>
      {validation.errors.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {validation.errors.map((e, i) => (
            <li key={i} className="mono text-[11px] text-red">
              ✕ {e}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}