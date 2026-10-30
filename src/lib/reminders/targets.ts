import type { ReminderSourceKind } from "@/db/schema";
import { hrefWithViewState } from "@/lib/url/viewState";

/**
 * Where a reminder's **Open** and **View tasks** go, and how the panel says when it was due.
 * Pure, so the destinations live in one table rather than in a click handler.
 */

export function reminderOpenHref(reminder: {
  sourceKind: ReminderSourceKind;
  sourceId: string;
  dueAt: Date;
  dayKey: string;
}): string {
  const id = encodeURIComponent(reminder.sourceId);
  switch (reminder.sourceKind) {
    case "task":
    case "project":
      // Revealed and opened, like a Find result: the row visible *and* the drawer open.
      return `/plan/outline?select=${id}&detail=${id}`;
    case "appointment":
      return hrefWithViewState(
        "/schedule/calendar",
        new URLSearchParams({ start: reminder.dayKey }),
        { detail: reminder.sourceId },
      );
    case "bill":
      return `/finances/budget?detail=${id}`;
    case "ready_to_assign":
      return "/finances/budget";
  }
}

/** Achieve's View Tasks button on a project block: that project's tasks, narrowed. */
export function viewTasksHref(projectId: string): string {
  return `/plan/tasks?scope=${encodeURIComponent(projectId)}`;
}

/**
 * "due 12 min ago", "starts in 5 min". An appointment's moment is its start, so it reads as
 * one; everything else was due.
 */
export function dueLabel(kind: ReminderSourceKind, dueAt: Date, now: Date): string {
  const minutes = Math.round((dueAt.getTime() - now.getTime()) / 60_000);
  const span = spanLabel(Math.abs(minutes));
  if (kind === "appointment") {
    if (minutes === 0) return "starting now";
    return minutes > 0 ? `starts in ${span}` : `started ${span} ago`;
  }
  if (minutes === 0) return "due now";
  return minutes > 0 ? `due in ${span}` : `due ${span} ago`;
}

function spanLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}
