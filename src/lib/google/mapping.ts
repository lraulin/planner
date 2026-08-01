/**
 * Translate between Google Calendar events and our `appointments` columns. Pure — no I/O.
 *
 * Google owns the columns produced here; the planner's own annotations (`checkState`,
 * `priority*`, `contexts`, `private`, `projectId`) are deliberately absent from
 * `GoogleOwnedFields` so a mirror upsert built from it cannot clobber them. See
 * `agent-os/specs/2026-07-31-2046-google-calendar-sync/`.
 */

import type {
  Appointment,
  RecurrenceEnd,
  RecurrenceFrequency,
  ShowAs,
} from "@/db/schema";
import { fromDateKey, toDateKey } from "@/lib/schedule/geometry";

/** The subset of Google's Event resource we read. */
export type GoogleEvent = {
  id?: string;
  etag?: string;
  status?: string;
  summary?: string;
  location?: string;
  description?: string;
  start?: GoogleEventTime;
  end?: GoogleEventTime;
  recurringEventId?: string;
  transparency?: string;
  eventType?: string;
  visibility?: string;
  updated?: string;
};

export type GoogleEventTime = {
  /** All-day events: `YYYY-MM-DD`. The end date is **exclusive**. */
  date?: string;
  /** Timed events: RFC3339. */
  dateTime?: string;
  timeZone?: string;
};

/** Exactly the columns the mirror is allowed to write. */
export type GoogleOwnedFields = {
  subject: string;
  location: string;
  notes: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  showAs: ShowAs;
  externalSource: "google";
  externalId: string;
  externalSeriesId: string | null;
  externalCalendarId: string;
  externalEtag: string | null;
  externalUpdatedAt: Date | null;
};

/** What we send to Google on insert/patch. */
export type GoogleEventWrite = {
  summary: string;
  location: string;
  description: string;
  start: GoogleEventTime;
  end: GoogleEventTime;
  transparency: "opaque" | "transparent";
  eventType?: "default" | "outOfOffice";
  recurrence?: string[];
};

const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

/**
 * `recurrenceByWeekday` is 0=Sun…6=Sat (JS `getDay()`); RRULE spells the same thing
 * `SU,MO,TU,…`. Two representations of one idea is exactly where an off-by-one hides.
 */
export function weekdayToByDay(weekday: number): string {
  const code = WEEKDAY_CODES[weekday];
  if (!code) throw new Error(`Weekday out of range: ${weekday}`);
  return code;
}

export function byDayToWeekday(code: string): number {
  // Tolerate the ordinal prefix RRULE allows ("3TU") by reading only the trailing letters.
  // We never emit one, but a rule round-tripped through Google may carry it.
  const letters = code.trim().toUpperCase().slice(-2);
  const index = WEEKDAY_CODES.indexOf(letters as (typeof WEEKDAY_CODES)[number]);
  if (index < 0) throw new Error(`Unrecognised BYDAY code: ${code}`);
  return index;
}

/**
 * Google has no per-event "tentative" — tentativeness is an attendee's response, not a
 * property of the event — so that value maps out to plain busy and cannot come back. The
 * asymmetry is deliberate; the alternative is inventing a private extended property that
 * only this app would ever read.
 */
export function showAsFromGoogle(event: GoogleEvent): ShowAs {
  if (event.eventType === "outOfOffice") return "out_of_office";
  if (event.transparency === "transparent") return "free";
  return "busy";
}

export function showAsToGoogle(showAs: ShowAs): {
  transparency: "opaque" | "transparent";
  eventType?: "default" | "outOfOffice";
} {
  if (showAs === "free") return { transparency: "transparent", eventType: "default" };
  if (showAs === "out_of_office") {
    return { transparency: "opaque", eventType: "outOfOffice" };
  }
  return { transparency: "opaque", eventType: "default" };
}

/**
 * Read one Google time. All-day dates go through `fromDateKey` so `"2026-07-27"` becomes
 * local midnight — `new Date("2026-07-27")` would parse as **UTC** midnight and render a
 * day early anywhere west of Greenwich, which is the whole bug class this feature could
 * have shipped invisibly.
 */
export function readEventTime(time: GoogleEventTime | undefined): Date | null {
  if (!time) return null;
  if (time.date) return fromDateKey(time.date);
  if (time.dateTime) {
    const parsed = new Date(time.dateTime);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/**
 * Google-owned columns for one event, or null when the event cannot be mirrored —
 * cancelled, or missing the id or times we key and place it by. Callers skip nulls rather
 * than guessing at defaults; a placeholder row is worse than an absent one.
 */
export function googleEventToFields(
  event: GoogleEvent,
  calendarId: string,
): GoogleOwnedFields | null {
  if (!event.id) return null;
  if (event.status === "cancelled") return null;

  const startAt = readEventTime(event.start);
  const endAt = readEventTime(event.end);
  if (!startAt || !endAt) return null;

  const allDay = Boolean(event.start?.date);
  const updated = event.updated ? new Date(event.updated) : null;

  return {
    subject: event.summary ?? "",
    location: event.location ?? "",
    notes: event.description ?? "",
    startAt,
    endAt,
    allDay,
    showAs: showAsFromGoogle(event),
    externalSource: "google",
    externalId: event.id,
    externalSeriesId: event.recurringEventId ?? null,
    externalCalendarId: calendarId,
    externalEtag: event.etag ?? null,
    externalUpdatedAt: updated && !Number.isNaN(updated.getTime()) ? updated : null,
  };
}

/** RRULE `UNTIL` is UTC basic format: `20260731T235959Z`. */
function formatUntil(until: Date, allDay: boolean): string {
  // Our expander treats `recurrenceUntil` as inclusive of its calendar day, so anchor to
  // the end of that local day before converting. Truncating to the raw timestamp would
  // silently drop the final occurrence of a series that ends "on" a date.
  const endOfDay = new Date(until);
  endOfDay.setHours(23, 59, 59, 0);
  const iso = endOfDay
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  return allDay ? `${iso.slice(0, 8)}` : iso;
}

const FREQ_BY_FREQUENCY: Record<Exclude<RecurrenceFrequency, "none">, string> = {
  daily: "DAILY",
  weekly: "WEEKLY",
  monthly: "MONTHLY",
  yearly: "YEARLY",
};

export type RecurrenceFields = {
  recurrenceFrequency: RecurrenceFrequency;
  recurrenceInterval: number;
  recurrenceByWeekday: number[] | null;
  recurrenceEnd: RecurrenceEnd;
  recurrenceCount: number | null;
  recurrenceUntil: Date | null;
  allDay: boolean;
};

/**
 * Our recurrence model as an RRULE line, or undefined for a one-off.
 *
 * The mapping is lossless in this direction only because our model is a strict subset of
 * RRULE — `FREQ`/`INTERVAL`/`BYDAY`/`COUNT`/`UNTIL` and nothing else. We never parse an
 * arbitrary RRULE back: Google expands series for us, so a rule it owns (`BYSETPOS`,
 * `BYMONTHDAY`) never has to survive a round trip through this model.
 */
export function buildRecurrenceRule(fields: RecurrenceFields): string[] | undefined {
  const { recurrenceFrequency: freq } = fields;
  if (freq === "none") return undefined;

  const parts = [`FREQ=${FREQ_BY_FREQUENCY[freq]}`];

  const interval = Math.max(1, fields.recurrenceInterval || 1);
  if (interval > 1) parts.push(`INTERVAL=${interval}`);

  if (freq === "weekly" && fields.recurrenceByWeekday?.length) {
    const days = [...new Set(fields.recurrenceByWeekday)]
      .sort((a, b) => a - b)
      .map(weekdayToByDay);
    parts.push(`BYDAY=${days.join(",")}`);
  }

  if (fields.recurrenceEnd === "count" && fields.recurrenceCount != null) {
    parts.push(`COUNT=${Math.max(1, fields.recurrenceCount)}`);
  } else if (fields.recurrenceEnd === "until" && fields.recurrenceUntil) {
    parts.push(`UNTIL=${formatUntil(fields.recurrenceUntil, fields.allDay)}`);
  }

  return [`RRULE:${parts.join(";")}`];
}

/**
 * Write one Google time. All-day uses `toDateKey` for the same local-midnight reason as
 * `readEventTime`; our `endAt` is already the exclusive midnight the week grid expects,
 * which is also what Google's exclusive `end.date` means, so it passes straight through.
 */
export function writeEventTime(at: Date, allDay: boolean): GoogleEventTime {
  return allDay ? { date: toDateKey(at) } : { dateTime: at.toISOString() };
}

/** Build the Google write body for an appointment. */
export function appointmentToGoogleEvent(
  appointment: Pick<
    Appointment,
    | "subject"
    | "location"
    | "notes"
    | "startAt"
    | "endAt"
    | "allDay"
    | "showAs"
    | "recurrenceFrequency"
    | "recurrenceInterval"
    | "recurrenceByWeekday"
    | "recurrenceEnd"
    | "recurrenceCount"
    | "recurrenceUntil"
  >,
): GoogleEventWrite {
  const { transparency, eventType } = showAsToGoogle(appointment.showAs);

  return {
    summary: appointment.subject,
    location: appointment.location,
    description: appointment.notes,
    start: writeEventTime(appointment.startAt, appointment.allDay),
    end: writeEventTime(appointment.endAt, appointment.allDay),
    transparency,
    eventType,
    recurrence: buildRecurrenceRule({
      recurrenceFrequency: appointment.recurrenceFrequency,
      recurrenceInterval: appointment.recurrenceInterval,
      recurrenceByWeekday: appointment.recurrenceByWeekday,
      recurrenceEnd: appointment.recurrenceEnd,
      recurrenceCount: appointment.recurrenceCount,
      recurrenceUntil: appointment.recurrenceUntil,
      allDay: appointment.allDay,
    }),
  };
}
