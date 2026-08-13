/**
 * The schedule's range as a list of rows instead of a grid of blocks.
 *
 * Achieve had no such view — `docs/achieve-planner/grid-columns.md` lists every grid in the
 * product and there is no appointments one. This is Google Calendar's "Schedule" view: the
 * same days, read top to bottom, with a **days left** column that a time grid has no way to
 * show. Twenty columns of mostly-empty hours answers "when is my week busy"; this answers
 * "what is coming".
 *
 * Pure — the ordering and the day-membership rule are the whole of it, and both are easy to
 * get subtly wrong, so they live here rather than inside a component.
 */

import type { AppointmentCheck } from "@/db/schema";
import { localDateKey } from "./geometry";
import type { ScheduleOccurrence } from "./queries";

export type AgendaRow = {
  /** The occurrence key — unique per instance of a series, which the grid needs for a row id. */
  id: string;
  /** The stored appointment. Recurring instances share one. */
  appointmentId: string;
  /** Local calendar day the row sits under, `YYYY-MM-DD`. */
  dayKey: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  subject: string;
  projectId: string | null;
  /**
   * Resolved here rather than in the cell, because the grid sorts and filters on column
   * values and those only see the row — a name looked up at render time could be displayed
   * but never sorted by.
   */
  projectName: string;
  checkState: AppointmentCheck;
  isRecurring: boolean;
};

/**
 * Occurrences as agenda rows, restricted to the days actually on screen and ordered the way
 * a day reads.
 *
 * **Filtered by visible day, not by the range's span.** In Work Week Mode the range runs
 * across weekends it does not draw, and a Saturday row the calendar is hiding must not
 * appear in the list beside it — same range, same contents, one rule.
 *
 * The day is the occurrence's **local** day (`localDateKey`), because that is the column the
 * grid drew it in. Reading UTC components off an instant puts a 9pm appointment on tomorrow.
 */
export function agendaRows(
  occurrences: readonly ScheduleOccurrence[],
  days: readonly Date[],
  projectNames: ReadonlyMap<string, string> = new Map(),
): AgendaRow[] {
  const visible = new Set(days.map(localDateKey));

  return occurrences
    .filter((occurrence) => visible.has(localDateKey(occurrence.startAt)))
    .map((occurrence) => ({
      id: occurrence.occurrenceKey,
      appointmentId: occurrence.id,
      dayKey: localDateKey(occurrence.startAt),
      startAt: occurrence.startAt,
      endAt: occurrence.endAt,
      allDay: occurrence.allDay,
      subject: occurrence.subject,
      projectId: occurrence.projectId,
      projectName: occurrence.projectId
        ? (projectNames.get(occurrence.projectId) ?? "")
        : "",
      checkState: occurrence.checkState,
      isRecurring: occurrence.isRecurring,
    }))
    .sort(compareRows);
}

/**
 * Day, then all-day events, then start time, then subject.
 *
 * All-day first because that is where the calendar puts them — the row across the top of the
 * column — and because "the conference" is the context for the meetings inside it. The
 * subject tiebreak only exists so the order is stable: two appointments at the same minute
 * would otherwise shuffle between renders.
 */
function compareRows(a: AgendaRow, b: AgendaRow): number {
  if (a.dayKey !== b.dayKey) return a.dayKey < b.dayKey ? -1 : 1;
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  const byStart = a.startAt.getTime() - b.startAt.getTime();
  if (byStart !== 0) return byStart;
  return a.subject.localeCompare(b.subject);
}
