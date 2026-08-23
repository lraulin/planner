"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { linkTransactionAction, listSchedulesAction } from "@/app/finances/actions";
import { ModalShell } from "@/components/detail/ModalShell";
import { useToday } from "@/components/grid/useToday";
import type { ScheduleListRow } from "@/lib/finances/schedules/queries";
import { DEFAULT_UPCOMING_LENGTH } from "@/lib/finances/schedules/status";

export function LinkScheduleDialog({
  transactionId,
  onClose,
  onLinked,
}: {
  transactionId: string;
  onClose: () => void;
  onLinked: () => void;
}) {
  const titleId = useId();
  const today = useToday() ?? "2026-01-01";
  const [schedules, setSchedules] = useState<ScheduleListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const result = await listSchedulesAction(today, DEFAULT_UPCOMING_LENGTH);
      if (result.ok) setSchedules(result.data);
      else setError(result.error);
    });
  }, [today]);

  function pick(scheduleId: string) {
    setError(null);
    startTransition(async () => {
      const result = await linkTransactionAction(scheduleId, transactionId);
      if (!result.ok) setError(result.error);
      else onLinked();
    });
  }

  return (
    <ModalShell open onClose={onClose} labelledBy={titleId} width="max-w-sm">
      <div className="flex flex-col gap-3 p-4">
        <h2 id={titleId} className="text-[1rem] font-medium text-ink">
          Link to schedule
        </h2>
        {error ? <p className="text-[0.8125rem] text-priority-a">{error}</p> : null}
        <ul className="max-h-[50vh] space-y-1 overflow-auto">
          {(schedules ?? []).map((schedule) => (
            <li key={schedule.id}>
              <button
                type="button"
                className="w-full rounded px-2 py-1.5 text-left text-[0.8125rem] text-ink hover:bg-surface-raised disabled:opacity-50"
                disabled={saving}
                onClick={() => pick(schedule.id)}
              >
                {schedule.name}
              </button>
            </li>
          ))}
        </ul>
        {schedules?.length === 0 ? (
          <p className="text-[0.8125rem] text-ink-muted">No schedules yet.</p>
        ) : null}
        <div className="flex justify-end">
          <button
            type="button"
            className="px-3 py-1.5 text-[0.8125rem] text-ink-muted"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
