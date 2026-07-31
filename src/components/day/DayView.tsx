"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { NodeState } from "@/db/schema";
import { ErrorBanner } from "@/components/tabs/tabChrome";
import type { DayAssignment } from "@/lib/day/priority";
import { sortDayItems } from "@/lib/day/priority";
import type { DailyItemView, DayPayload } from "@/lib/day/types";
import {
  createDailyItemAction,
  deleteDailyItemAction,
  moveDailyItemToDayAction,
  promoteToTaskAction,
  setDailyItemStateAction,
  setDailyPrioritiesAction,
  updateDailyItemTitleAction,
  type ActionResult,
} from "@/app/day/actions";
import { AppointmentsPane, type DayAppointment } from "./AppointmentsPane";
import { DailyItemsGrid } from "./DailyItemsGrid";
import { DailyNotesPane } from "./DailyNotesPane";
import { DayHeader } from "./DayHeader";

/**
 * The Day tab: appointments, today's task list, and the day's notes.
 *
 * Writes are optimistic then reconciled by `router.refresh()`, the same idiom the Schedule
 * and Notes tabs use — a check box that waits for a round trip before it ticks makes the
 * list feel like a form rather than a page you are working from.
 */
export function DayView({
  initial,
  today,
  appointments,
}: {
  initial: DayPayload;
  today: string;
  appointments: DayAppointment[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<DailyItemView[]>(initial.items);
  const [error, setError] = useState<string | null>(null);

  // Re-sync when the server sends a new day (navigation or refresh) rather than in an
  // effect — the compare-props idiom `ScheduleView` and `WeeklyPlanView` already use.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setItems(initial.items);
  }

  const settle = useCallback(
    async (result: Promise<ActionResult>) => {
      const outcome = await result;
      if (!outcome.ok) setError(outcome.error);
      router.refresh();
    },
    [router],
  );

  const patch = useCallback((itemId: string, changes: Partial<DailyItemView>) => {
    setItems((current) =>
      sortDayItems(
        current.map((item) => (item.id === itemId ? { ...item, ...changes } : item)),
      ),
    );
  }, []);

  const onCreate = useCallback(
    (title: string) => {
      // No optimistic row: the id comes from the server, and a placeholder id would break
      // the very next drag or check box aimed at it.
      void settle(createDailyItemAction({ day: initial.day, title }));
    },
    [initial.day, settle],
  );

  const onToggleComplete = useCallback(
    (itemId: string, done: boolean) => {
      patch(itemId, {
        completedAt: done ? new Date() : null,
        state: done ? "completed" : "not_started",
      });
      void settle(setDailyItemStateAction(itemId, done ? "completed" : "not_started"));
    },
    [patch, settle],
  );

  const onSetState = useCallback(
    (itemId: string, state: NodeState) => {
      patch(itemId, { state });
      void settle(setDailyItemStateAction(itemId, state));
    },
    [patch, settle],
  );

  const onApplyPriorities = useCallback(
    (assignments: DayAssignment[]) => {
      if (assignments.length === 0) return;
      setItems((current) => {
        const byId = new Map(assignments.map((a) => [a.id, a]));
        return sortDayItems(
          current.map((item) => {
            const next = byId.get(item.id);
            return next
              ? { ...item, priorityLetter: next.letter, priorityRank: next.rank }
              : item;
          }),
        );
      });
      void settle(setDailyPrioritiesAction(assignments));
    },
    [settle],
  );

  const onRename = useCallback(
    (itemId: string, title: string) => {
      patch(itemId, { title });
      void settle(updateDailyItemTitleAction(itemId, title));
    },
    [patch, settle],
  );

  const onDelete = useCallback(
    (itemId: string) => {
      setItems((current) => current.filter((item) => item.id !== itemId));
      void settle(deleteDailyItemAction(itemId));
    },
    [settle],
  );

  const onMoveToDay = useCallback(
    (itemId: string, target: string) => {
      setItems((current) => current.filter((item) => item.id !== itemId));
      void settle(moveDailyItemToDayAction(itemId, target));
    },
    [settle],
  );

  const onPromote = useCallback(
    (itemId: string) => {
      void settle(promoteToTaskAction(itemId));
    },
    [settle],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <DayHeader day={initial.day} today={today} mode="day" />
      {error && <ErrorBanner message={error} />}

      <div className="flex min-h-0 flex-1">
        <AppointmentsPane appointments={appointments} weekKey={initial.day} />

        <div className="flex min-h-0 flex-1 flex-col">
          <DailyItemsGrid
            items={items}
            onCreate={onCreate}
            onToggleComplete={onToggleComplete}
            onSetState={onSetState}
            onApplyPriorities={onApplyPriorities}
            onRename={onRename}
            onPromote={onPromote}
            onDelete={onDelete}
            onMoveToDay={onMoveToDay}
            emptyHint="Nothing here yet. Type below to add what you are doing today, or drag tasks in from the Task Chooser."
          />
        </div>

        <DailyNotesPane
          key={initial.day}
          day={initial.day}
          initialBody={initial.journal?.body ?? ""}
        />
      </div>
    </div>
  );
}
