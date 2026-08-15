/**
 * All-day appointments are a pair of calendar days with an exclusive end — the same
 * convention Google Calendar uses (`start.date` inclusive, `end.date` exclusive).
 *
 * A timed event flipped to all-day still carries same-day instants (9:00–10:00). Sending
 * those through `toDateKey` produces `start.date === end.date`, which Google rejects as
 * "Invalid start time." This is the one place that rewrite happens.
 */

import { fromDateKey, localDateKey, shiftDateKey } from "./geometry";

export type AllDayRange = {
  startAt: Date;
  endAt: Date;
};

/**
 * Calendar-day bounds for an all-day event.
 *
 * Uses the wall-clock day of each instant (`localDateKey`), not `toDateKey`: a 9pm Eastern
 * appointment is still that evening, even though its UTC date is tomorrow. An end already
 * on exclusive local midnight (the week grid's all-day drop, the organizer) is left as that
 * next day rather than pushed one further.
 */
export function allDayRange(start: Date, end: Date): AllDayRange {
  const startKey = localDateKey(start);
  const endIsExclusiveMidnight =
    end.getTime() > start.getTime() &&
    end.getHours() === 0 &&
    end.getMinutes() === 0 &&
    end.getSeconds() === 0 &&
    end.getMilliseconds() === 0;
  const endKey = endIsExclusiveMidnight
    ? localDateKey(end)
    : shiftDateKey(localDateKey(end), 1);
  const exclusiveEnd = endKey <= startKey ? shiftDateKey(startKey, 1) : endKey;
  return { startAt: fromDateKey(startKey), endAt: fromDateKey(exclusiveEnd) };
}

/**
 * What the appointment drawer should open with after a calendar selection.
 *
 * FullCalendar's all-day strip yields midnight→next-midnight with `allDay: true`. If that
 * flag is dropped, the same instants become a 24-hour timed event. The flag is the
 * discriminator — do not infer all-day from a 24-hour span.
 */
export function draftFromCalendarSelect(
  start: Date,
  end: Date,
  allDay: boolean,
): { startAt: Date; endAt: Date; allDay: boolean } {
  if (!allDay) return { startAt: start, endAt: end, allDay: false };
  const range = allDayRange(start, end);
  return { startAt: range.startAt, endAt: range.endAt, allDay: true };
}
