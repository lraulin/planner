import { asBoolean, asRecord } from "./parse";
import { SETTINGS_VERSION } from "./scopes";

/**
 * How the week draws itself: slot height and whether the weekend is shown.
 *
 * Achieve put both on the calendar's own right-click menu (`visuals/achieve-schedule-menu.png`)
 * and nowhere else, which is exactly right — they are properties of the grid you are pointing
 * at, not of the app. Stored under `schedule` so the choice survives a reload; a granularity
 * you have to re-pick every visit is one you stop using.
 */

/**
 * Achieve's list, kept whole including the odd one.
 *
 * **6 minutes** looks like a typo and is not: a tenth of an hour is how billable time is
 * recorded, and Achieve shipped it for exactly that. Dropping it because it looks strange would
 * be reading the UI instead of the intent.
 */
export const SLOT_MINUTES = [5, 6, 10, 15, 30, 60] as const;
export type SlotMinutes = (typeof SLOT_MINUTES)[number];

export type ScheduleViewSettings = {
  slotMinutes: SlotMinutes;
  /** Achieve's Work Week Mode: Monday–Friday only. */
  workWeek: boolean;
};

export const DEFAULT_SCHEDULE_VIEW: ScheduleViewSettings = {
  // What the calendar drew before this was configurable. A default that changes what existing
  // users see is a migration, not a default.
  slotMinutes: 30,
  workWeek: false,
};

export function parseScheduleView(value: unknown): ScheduleViewSettings {
  const record = asRecord(value);
  if (!record) return DEFAULT_SCHEDULE_VIEW;

  return {
    // Membership-checked rather than range-checked: an arbitrary minute count would draw a
    // grid whose lines do not land on the hour, and `asOneOf` only speaks strings.
    slotMinutes: isSlotMinutes(record.slotMinutes)
      ? record.slotMinutes
      : DEFAULT_SCHEDULE_VIEW.slotMinutes,
    workWeek: asBoolean(record.workWeek, DEFAULT_SCHEDULE_VIEW.workWeek),
  };
}

function isSlotMinutes(value: unknown): value is SlotMinutes {
  return (SLOT_MINUTES as readonly number[]).includes(value as number);
}

export function serializeScheduleView(settings: ScheduleViewSettings): unknown {
  return { v: SETTINGS_VERSION, ...settings };
}

/** `slotDuration` as FullCalendar wants it: `"HH:MM:SS"`. */
export function slotDurationOf(minutes: SlotMinutes): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}:00`;
}
