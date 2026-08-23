"use client";

import { useId, useState } from "react";

import { ModalShell } from "@/components/detail/ModalShell";
import type { ScheduleSnapshot } from "@/lib/finances/budget/templates/schedule";
import type { BudgetRow } from "@/lib/finances/budget/rows";
import { formatUsd } from "@/lib/finances/money";

/**
 * Stack the schedules you already have onto one envelope, in one gesture.
 *
 * Only schedules not already attached to *some* envelope are offered: one schedule funding two
 * envelopes would be counted twice on Apply, and nothing downstream would notice. Re-running is
 * therefore safe and shows an empty list rather than a second copy of everything.
 *
 * This writes templates only. Assigning is still `Apply templates` — a picker that also moved
 * money would be two decisions behind one confirmation (`ux-principles.md`).
 */
export function AddFromSchedulesDialog({
  candidates,
  envelopes,
  defaultCategoryId,
  onCancel,
  onAdd,
}: {
  candidates: readonly ScheduleSnapshot[];
  envelopes: readonly BudgetRow[];
  defaultCategoryId: string;
  onCancel: () => void;
  onAdd: (categoryId: string, scheduleIds: string[]) => void;
}) {
  const headingId = useId();
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(candidates.map((schedule) => schedule.id)),
  );

  function toggle(id: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  const none = candidates.length === 0;

  return (
    <ModalShell open onClose={onCancel} labelledBy={headingId}>
      <form
        className="flex flex-col gap-3 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!none && picked.size > 0) onAdd(categoryId, [...picked]);
        }}
      >
        <h2 id={headingId} className="text-[1rem] font-medium text-ink">
          Add schedules as templates
        </h2>

        {none ? (
          <p className="text-[0.8125rem] text-ink-muted">
            Every active schedule is already attached to an envelope. Add a schedule on
            the Schedules page, or edit an envelope&rsquo;s templates directly.
          </p>
        ) : (
          <>
            <p className="text-[0.8125rem] text-ink-muted">
              These schedules do not fund an envelope yet. Adding them writes a template
              line each — nothing is assigned until you run Apply templates.
            </p>

            <ul className="flex max-h-64 flex-col gap-1 overflow-auto rounded border border-rule p-2">
              {candidates.map((schedule) => (
                <li key={schedule.id}>
                  <label className="flex min-h-tap items-center gap-2 text-[0.8125rem] text-ink md:min-h-0">
                    <input
                      type="checkbox"
                      checked={picked.has(schedule.id)}
                      onChange={() => toggle(schedule.id)}
                    />
                    <span className="min-w-0 flex-1 truncate">{schedule.name}</span>
                    <span className="tabular flex-none text-ink-muted">
                      {formatUsd(Math.abs(schedule.amountCents))}
                    </span>
                  </label>
                </li>
              ))}
            </ul>

            <label className="flex flex-col gap-1 text-[0.8125rem] text-ink-muted">
              Onto
              <select
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                className="min-h-tap rounded border border-rule bg-surface px-2 py-1 text-base text-ink md:min-h-0 md:text-[0.8125rem]"
              >
                {envelopes.map((envelope) => (
                  <option key={envelope.id} value={envelope.id}>
                    {envelope.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-tap rounded border border-rule px-3 py-1 text-[0.8125rem] text-ink hover:bg-surface-raised md:min-h-0"
          >
            {none ? "Close" : "Cancel"}
          </button>
          {none ? null : (
            <button
              type="submit"
              disabled={picked.size === 0}
              title={picked.size === 0 ? "Pick at least one schedule" : undefined}
              className="min-h-tap rounded border border-rule bg-surface-raised px-3 py-1 text-[0.8125rem] text-ink hover:bg-surface disabled:opacity-60 md:min-h-0"
            >
              Add {picked.size === 1 ? "1 template" : `${picked.size} templates`}
            </button>
          )}
        </div>
      </form>
    </ModalShell>
  );
}
