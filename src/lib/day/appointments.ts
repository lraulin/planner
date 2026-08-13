/**
 * Which appointments belong on a Day-tab date.
 *
 * The Day page used to filter with `toDateKey(startAt)`. That helper reads UTC date
 * components and is correct for stored calendar days (deadlines, note dates). A timed
 * appointment is an instant: 9pm Eastern is already tomorrow in UTC, so the pane filed
 * it on the next day. Agenda already uses the wall-clock day; this is the same rule.
 */

import type { AppointmentCheck } from "@/db/schema";
import { localDateKey } from "@/lib/schedule/geometry";

export type DayAppointment = {
  id: string;
  subject: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  checkState: AppointmentCheck;
};

type DayOccurrence = {
  occurrenceKey: string;
  subject: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  checkState: AppointmentCheck;
};

/**
 * Occurrences whose wall-clock start falls on `dayKey`.
 *
 * Membership is `localDateKey(startAt)`, never `toDateKey`. All-day rows stored as UTC
 * noon still land on that calendar day in the pinned Eastern zone; timed rows keep the
 * evening they were drawn on.
 */
export function appointmentsForDay(
  occurrences: readonly DayOccurrence[],
  dayKey: string,
): DayAppointment[] {
  return occurrences
    .filter((occurrence) => localDateKey(occurrence.startAt) === dayKey)
    .map((occurrence) => ({
      id: occurrence.occurrenceKey,
      subject: occurrence.subject,
      startAt: occurrence.startAt,
      endAt: occurrence.endAt,
      allDay: occurrence.allDay,
      checkState: occurrence.checkState,
    }));
}
