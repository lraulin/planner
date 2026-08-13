import {
  ANCHOR_MODES,
  isDayCount,
  type AnchorMode,
  type DayCount,
} from "@/lib/schedule/range";
import { asBoolean, asOneOf, asRecord } from "./parse";
import { SETTINGS_VERSION } from "./scopes";

/**
 * How the Weekly Schedule is arranged: the week grid's slot height and weekend, and the four
 * switches on the Projects rail beside it.
 *
 * Achieve put the first two on the calendar's own right-click menu
 * (`visuals/achieve-schedule-menu.png`) and nowhere else, which is exactly right — they are
 * properties of the grid you are pointing at, not of the app. Stored under `schedule` so the
 * choice survives a reload; a granularity you have to re-pick every visit is one you stop
 * using, and the same is true of a rail that forgets you wanted tasks on it.
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

/** Calendar grid or the same range as a list of rows. See `AgendaGrid`. */
export const SCHEDULE_VIEW_MODES = ["calendar", "agenda"] as const;
export type ScheduleViewMode = (typeof SCHEDULE_VIEW_MODES)[number];

export type ScheduleViewSettings = {
  slotMinutes: SlotMinutes;
  /** Achieve's Work Week Mode: Monday–Friday only. */
  workWeek: boolean;
  /** How many day columns, from Achieve's View menu. See `lib/schedule/range.ts`. */
  dayCount: DayCount;
  /** Whether the range starts on today or on the week boundary. */
  anchorMode: AnchorMode;
  viewMode: ScheduleViewMode;
  /**
   * The schedule-specific right pane (mini calendar + projects rail). Separate from the
   * Commands panel, which is a shell setting — this one is only meaningful on `/schedule`.
   */
  railOpen: boolean;
  /** Projects rail: include finished work in the drag source. */
  railShowCompleted: boolean;
  railGroupByArea: boolean;
  /** Projects rail: tasks as well as projects, so a single task can be blocked out. */
  railShowTasks: boolean;
  railSortByPriority: boolean;
};

export const DEFAULT_SCHEDULE_VIEW: ScheduleViewSettings = {
  // What the calendar drew before this was configurable. A default that changes what existing
  // users see is a migration, not a default.
  slotMinutes: 30,
  workWeek: false,
  dayCount: 7,
  /*
   * The one default here that *does* change what an existing stored blob renders: the
   * calendar used to open on the week containing today, and now opens on today itself.
   *
   * That is the feature, not an oversight — a schedule whose left-hand third is already
   * spent is a schedule you read around. `aligned` restores the Sunday-anchored week
   * exactly, so nothing was taken away; it just stopped being the assumption.
   */
  anchorMode: "rolling",
  viewMode: "calendar",
  railOpen: true,
  railShowCompleted: false,
  railGroupByArea: false,
  railShowTasks: false,
  railSortByPriority: false,
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
    // Membership-checked for the same reason as `slotMinutes`: two days is drawable and is
    // not one of Achieve's widths, so a stray value has to fall back rather than render.
    dayCount: isDayCount(record.dayCount)
      ? record.dayCount
      : DEFAULT_SCHEDULE_VIEW.dayCount,
    anchorMode: asOneOf(
      record.anchorMode,
      ANCHOR_MODES,
      DEFAULT_SCHEDULE_VIEW.anchorMode,
    ),
    viewMode: asOneOf(
      record.viewMode,
      SCHEDULE_VIEW_MODES,
      DEFAULT_SCHEDULE_VIEW.viewMode,
    ),
    railOpen: asBoolean(record.railOpen, DEFAULT_SCHEDULE_VIEW.railOpen),
    railShowCompleted: asBoolean(
      record.railShowCompleted,
      DEFAULT_SCHEDULE_VIEW.railShowCompleted,
    ),
    railGroupByArea: asBoolean(
      record.railGroupByArea,
      DEFAULT_SCHEDULE_VIEW.railGroupByArea,
    ),
    railShowTasks: asBoolean(record.railShowTasks, DEFAULT_SCHEDULE_VIEW.railShowTasks),
    railSortByPriority: asBoolean(
      record.railSortByPriority,
      DEFAULT_SCHEDULE_VIEW.railSortByPriority,
    ),
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
