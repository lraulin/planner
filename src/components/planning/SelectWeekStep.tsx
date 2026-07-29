"use client";

import { useState } from "react";
import { fromDateKey, startOfWeek, toDateKey, weekDays } from "@/lib/schedule/geometry";
import { asyncHandler } from "@/lib/eventHandler";

type Props = {
  weekKey: string;
  weekStartsOn: number;
  reviewAreasGoals: boolean;
  hasPlan: boolean;
  onStart: (input: {
    weekKey: string;
    weekStartsOn: number;
    reviewAreasGoals: boolean;
  }) => Promise<void>;
  /** When a plan already exists, flipping the review toggle updates it in place. */
  onUpdateReview?: (value: boolean) => void;
};

function rangeLabel(weekKey: string, weekStartsOn: number): string {
  const start = startOfWeek(fromDateKey(weekKey), weekStartsOn);
  const days = weekDays(start);
  return `${days[0].toLocaleDateString()} – ${days[6].toLocaleDateString()}`;
}

/**
 * Step 0 — Achieve's "Select Week" dialog as a page step.
 * Starting creates (or resumes) the plan row; Next is then free to walk the rest.
 */
export function SelectWeekStep({
  weekKey,
  weekStartsOn: initialStartsOn,
  reviewAreasGoals: initialReview,
  hasPlan,
  onStart,
  onUpdateReview,
}: Props) {
  const [weekOf, setWeekOf] = useState(weekKey);
  const [weekStartsOn, setWeekStartsOn] = useState(initialStartsOn === 1 ? 1 : 0);
  const [reviewAreasGoals, setReviewAreasGoals] = useState(initialReview);
  const [busy, setBusy] = useState(false);

  async function handleContinue() {
    setBusy(true);
    try {
      await onStart({ weekKey: weekOf, weekStartsOn, reviewAreasGoals });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-5 p-6">
      <p className="text-[0.875rem] text-ink">
        Perform weekly planning for week{" "}
        <span className="font-medium tabular">{rangeLabel(weekOf, weekStartsOn)}</span>
      </p>

      <label className="flex flex-col gap-1">
        <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
          Week of
        </span>
        <input
          type="date"
          className="rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] text-ink tabular outline-none focus:border-select-edge"
          value={weekOf}
          onChange={(e) => {
            if (!e.target.value) return;
            setWeekOf(toDateKey(fromDateKey(e.target.value)));
          }}
          disabled={hasPlan}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
          Start week on
        </span>
        <select
          className="rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] text-ink outline-none focus:border-select-edge"
          value={weekStartsOn}
          onChange={(e) => setWeekStartsOn(Number(e.target.value) === 1 ? 1 : 0)}
          disabled={hasPlan}
        >
          <option value={0}>Sunday</option>
          <option value={1}>Monday</option>
        </select>
      </label>

      <label className="flex items-center gap-2 text-[0.875rem] text-ink">
        <input
          type="checkbox"
          checked={reviewAreasGoals}
          onChange={(e) => {
            const value = e.target.checked;
            setReviewAreasGoals(value);
            onUpdateReview?.(value);
          }}
        />
        Perform Result Area &amp; Goal Review
      </label>

      {!hasPlan ? (
        <button
          type="button"
          disabled={busy}
          className="self-start rounded border border-select-edge bg-select px-4 py-2 text-[0.875rem] font-medium text-ink hover:opacity-90 disabled:opacity-50"
          onClick={asyncHandler(handleContinue, () => undefined)}
        >
          {busy ? "Starting…" : "Start Planning"}
        </button>
      ) : (
        <p className="text-[0.8125rem] text-ink-muted">
          This week&apos;s plan is open. Use the step strip or Next to continue where
          you left off.
        </p>
      )}
    </div>
  );
}
