"use client";

// Milestone creator form — Terminal Commons styling, square corners, tokens only.
// zod 4 validation; errors render inline in mono, no browser default popups.

import { FormEvent, useState } from "react";
import { z } from "zod";

export const milestoneFormSchema = z.object({
  title: z.string().trim().min(3, "TITLE TOO SHORT — MIN 3 CHARS"),
  description: z.string().trim().min(10, "DESCRIPTION TOO SHORT — MIN 10 CHARS"),
  successCriteria: z.string().trim().min(5, "SUCCESS CRITERIA TOO SHORT — MIN 5 CHARS"),
  estimatedTokens: z.coerce
    .number()
    .int("ESTIMATED TOKENS MUST BE A WHOLE NUMBER")
    .positive("ESTIMATED TOKENS MUST BE POSITIVE"),
  deadline: z
    .string()
    .trim()
    .refine((s) => s === "" || !Number.isNaN(Date.parse(s)), "DEADLINE NOT A VALID DATE"),
});

export type MilestoneFormValues = z.infer<typeof milestoneFormSchema>;

type Props = {
  onSubmit?: (values: MilestoneFormValues) => void | Promise<void>;
  /** preset projectId retained for callers that need it; the values object only carries milestone fields */
  projectId?: string;
  className?: string;
};

const INPUT_CLASS =
  "mono h-9 w-full border border-line bg-panel2 px-3 text-[12px] text-tx outline-none placeholder:text-dim focus:border-phos";
const LABEL_CLASS = "mono text-[11px] uppercase tracking-[0.14em] text-dim";

export default function MilestoneForm({ onSubmit, projectId, className = "" }: Props) {
  const [values, setValues] = useState({
    title: "",
    description: "",
    successCriteria: "",
    estimatedTokens: "",
    deadline: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = milestoneFormSchema.safeParse(values);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      setSubmitted(false);
      return;
    }
    setErrors({});
    setSubmitted(true);
    setValues({ title: "", description: "", successCriteria: "", estimatedTokens: "", deadline: "" });
    await onSubmit?.(parsed.data);
  }

  function bind(field: keyof typeof values) {
    return {
      value: values[field],
      onChange: (e: { target: { value: string } }) =>
        setValues((v) => ({ ...v, [field]: e.target.value })),
    };
  }

  return (
    <form onSubmit={handleSubmit} className={`border border-line bg-panel p-4 ${className}`} noValidate>
      <span className={LABEL_CLASS}>
        PROPOSE MILESTONE{projectId ? ` · ${projectId.toUpperCase()}` : ""}
      </span>

      <div className="mt-3 space-y-3">
        <div>
          <label htmlFor="milestone-title" className={LABEL_CLASS}>TITLE</label>
          <input id="milestone-title" {...bind("title")} placeholder="Sweep round 3" className={`mt-1 ${INPUT_CLASS}`} />
          {errors.title && <p className="mono mt-1 text-[11px] text-red">{errors.title.toUpperCase()}</p>}
        </div>

        <div>
          <label htmlFor="milestone-description" className={LABEL_CLASS}>DESCRIPTION</label>
          <textarea id="milestone-description" {...bind("description")} rows={3}
            placeholder="What the sponsored tokens will run, as given to supporters."
            className="mono mt-1 w-full border border-line bg-panel2 px-3 py-2 text-[12px] text-tx outline-none placeholder:text-dim focus:border-phos" />
          {errors.description && <p className="mono mt-1 text-[11px] text-red">{errors.description.toUpperCase()}</p>}
        </div>

        <div>
          <label htmlFor="milestone-criteria" className={LABEL_CLASS}>SUCCESS CRITERIA</label>
          <input id="milestone-criteria" {...bind("successCriteria")} placeholder="Zero flakes in 500 consecutive CI runs"
            className={`mt-1 ${INPUT_CLASS}`} />
          {errors.successCriteria && <p className="mono mt-1 text-[11px] text-red">{errors.successCriteria.toUpperCase()}</p>}
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label htmlFor="milestone-est" className={LABEL_CLASS}>ESTIMATED TOKENS</label>
            <input id="milestone-est" {...bind("estimatedTokens")} inputMode="numeric" placeholder="4000000"
              className={`mt-1 ${INPUT_CLASS}`} />
            {errors.estimatedTokens && <p className="mono mt-1 text-[11px] text-red">{errors.estimatedTokens.toUpperCase()}</p>}
          </div>
          <div className="flex-1">
            <label htmlFor="milestone-deadline" className={LABEL_CLASS}>DEADLINE</label>
            <input id="milestone-deadline" {...bind("deadline")} placeholder="Oct 20, 2026"
              className={`mt-1 ${INPUT_CLASS}`} />
            {errors.deadline && <p className="mono mt-1 text-[11px] text-red">{errors.deadline.toUpperCase()}</p>}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          className="mono border border-phos bg-phos px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-bg"
        >
          ▸ SUBMIT MILESTONE
        </button>
        {submitted && (
          <span className="mono text-[11px] uppercase tracking-[0.14em] text-phos">✓ LOGGED FOR VOTE</span>
        )}
      </div>
    </form>
  );
}