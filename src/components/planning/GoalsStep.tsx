"use client";

import { useMemo, useState } from "react";
import { formatDateKey } from "@/lib/dateFormat";
import { selectGoalsForReview } from "@/lib/planning/review";
import type { StepContext } from "./types";

type Props = {
  ctx: StepContext;
};

/**
 * Step 2 — reread each dream/goal and write a weekly restatement.
 * The rewrite is plan-scoped history; it never overwrites the goal itself.
 */
export function GoalsStep({ ctx }: Props) {
  const items = useMemo(() => selectGoalsForReview(ctx.nodes), [ctx.nodes]);
  const [index, setIndex] = useState(0);
  const item = items[index] ?? null;
  const entry = item ? ctx.entryFor(item.id) : null;
  const previous = item ? ctx.previousRewrites.get(item.id) : undefined;

  const [rewriteDraft, setRewriteDraft] = useState(entry?.rewrite ?? "");
  const [prevId, setPrevId] = useState(item?.id ?? null);
  if (item && item.id !== prevId) {
    setPrevId(item.id);
    setRewriteDraft(ctx.entryFor(item.id).rewrite);
  }

  if (items.length === 0) {
    return (
      <div className="p-6 text-[0.875rem] text-ink-muted">
        No New/Active priority-A goals or dreams to review. Raise a goal to A, or skip
        ahead with Next.
      </div>
    );
  }

  if (!item || !entry) return null;

  function saveRewrite() {
    if (!item) return;
    const trimmed = rewriteDraft;
    if (trimmed === entry?.rewrite) {
      if (!entry?.reviewed) ctx.patchEntry(item.id, { reviewed: true });
      return;
    }
    ctx.patchEntry(item.id, { rewrite: rewriteDraft, reviewed: true });
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[0.875rem] text-ink">
          <span className="text-ink-muted">{item.isDream ? "Dream" : "Goal"}:</span>
          <select
            className="max-w-md rounded border border-rule bg-surface px-2 py-1 text-ink outline-none focus:border-select-edge"
            value={item.id}
            onChange={(e) => {
              const next = items.findIndex((g) => g.id === e.target.value);
              if (next >= 0) setIndex(next);
            }}
          >
            {items.map((g) => (
              <option key={g.id} value={g.id}>
                {g.isDream ? "★ " : ""}
                {g.name || "Untitled"}
                {g.priorityLetter ? ` (${g.priorityLetter})` : ""}
              </option>
            ))}
          </select>
        </label>
        <span className="text-[0.75rem] tabular text-ink-faint">
          {index + 1} of {items.length}
        </span>
        <div className="ml-auto flex gap-1">
          <button
            type="button"
            disabled={index === 0}
            className="rounded border border-rule bg-surface px-2 py-1 text-[0.8125rem] text-ink hover:bg-surface-raised disabled:opacity-40"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
          >
            Previous
          </button>
          <button
            type="button"
            disabled={index >= items.length - 1}
            className="rounded border border-rule bg-surface px-2 py-1 text-[0.8125rem] text-ink hover:bg-surface-raised disabled:opacity-40"
            onClick={() => setIndex((i) => Math.min(items.length - 1, i + 1))}
          >
            Next
          </button>
        </div>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
          Description
        </span>
        <div className="min-h-[6rem] whitespace-pre-wrap rounded border border-rule bg-surface-raised px-2 py-1.5 text-[0.875rem] text-ink">
          {item.definition || item.notes || (
            <span className="text-ink-faint">No description.</span>
          )}
        </div>
      </label>

      {previous && (
        <div className="rounded border border-rule bg-shell px-3 py-2 text-[0.8125rem]">
          <div className="mb-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
            Last week&apos;s rewrite
            <span className="ml-2 font-normal normal-case text-ink-faint">
              ({formatDateKey(previous.weekStart, "MMM D")})
            </span>
          </div>
          <p className="whitespace-pre-wrap text-ink-muted">{previous.rewrite}</p>
        </div>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
          Rewrite
        </span>
        <textarea
          className="min-h-[5rem] w-full resize-y rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] text-ink outline-none focus:border-select-edge"
          value={rewriteDraft}
          placeholder="Restate this goal in your own words for this week…"
          onChange={(e) => setRewriteDraft(e.target.value)}
          onBlur={saveRewrite}
        />
      </label>
    </div>
  );
}
