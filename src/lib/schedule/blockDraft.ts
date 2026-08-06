import { atMinutes, localDateKey, minutesOfDay, toDateKey } from "./geometry";

/** Where a block lands when nobody has said. 9am reads as "the start of the working day". */
const DEFAULT_START_MINUTE = 9 * 60;
/** Blocks snap to the half hour, matching the calendar's own `slotDuration`. */
const SNAP_MINUTES = 30;
const MINUTES_IN_DAY = 24 * 60;

/**
 * The time `Schedule block…` proposes for a row, before the drawer opens on it.
 *
 * The command arrives from another module — right-click a task on `/tasks` and you land on the
 * week with a drawer open — so there is no pointer position to read a time from the way
 * drag-select gives one. This picks the answer a person would: **today if today is in the week
 * you are looking at**, at the next half hour, and 9am on the first day otherwise.
 *
 * Appointments are true instants (`dates.md`), so this builds local times through `atMinutes`
 * rather than doing arithmetic on a date key.
 *
 * A block that would run past midnight is pulled back to end at midnight instead of spilling
 * into the next day — FullCalendar draws `slotMaxTime="24:00:00"`, so the overflow would simply
 * be invisible.
 */
export function defaultBlockRange(
  days: readonly Date[],
  now: Date,
  durationMinutes: number,
): { start: Date; end: Date } {
  const todayKey = localDateKey(now);
  const day = days.find((entry) => toDateKey(entry) === todayKey) ?? days[0];
  const isToday = day !== undefined && toDateKey(day) === todayKey;

  const duration = Math.max(SNAP_MINUTES, Math.round(durationMinutes));
  const proposed = isToday
    ? Math.ceil(minutesOfDay(now) / SNAP_MINUTES) * SNAP_MINUTES
    : DEFAULT_START_MINUTE;
  // Never start so late that the block has nowhere to go.
  const startMinute = Math.max(0, Math.min(proposed, MINUTES_IN_DAY - duration));

  return {
    start: atMinutes(day, startMinute),
    end: atMinutes(day, startMinute + duration),
  };
}
