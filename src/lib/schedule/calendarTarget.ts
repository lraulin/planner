/**
 * What is under the pointer on the week calendar.
 *
 * FullCalendar exposes no `contextmenu` hook, so the listener sits on the container and this
 * reads the answer back out of the DOM it rendered. That sounds fragile and is the least
 * fragile option available: the alternative is mapping a pixel offset back through the
 * calendar's own layout maths, which would break on every slot-height change.
 *
 * **Why a stack of elements rather than one `closest` walk:** the time grid overlays two
 * separate trees. `.fc-timegrid-slot[data-time]` rows span the whole week in one table, and
 * `.fc-timegrid-col[data-date]` columns sit in another on top of them — so no single ancestor
 * chain holds both the date and the time. `document.elementsFromPoint` sees both, which is why
 * the caller passes what it found rather than an event target.
 */

export type CalendarTarget =
  | { kind: "event"; appointmentId: string; occurrenceKey: string }
  /** A time slot, or an all-day cell when `allDay`. `start` is a local instant. */
  | { kind: "slot"; start: Date; allDay: boolean }
  | { kind: "none" };

/** `data-time` is `"HH:MM:SS"`; anything else is not a slot we can read. */
function minutesOfTimeAttr(value: string | null): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** `data-date` is `"YYYY-MM-DD"`, always the calendar's own day, never a parsed user string. */
function localDayFromDateAttr(value: string | null): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  // Local components on purpose. A calendar cell is a wall-clock day to the person looking at
  // it, and the instant built from it is what the appointment gets (`dates.md`).
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/**
 * Resolve the topmost meaningful thing in a hit-test stack.
 *
 * An **event wins over the slot beneath it** — you right-clicked the appointment, not the 3pm
 * it happens to sit in. `elementsFromPoint` returns front-to-back, so the first match is the
 * one on top.
 */
export function calendarTargetFrom(elements: readonly Element[]): CalendarTarget {
  let dayValue: string | null = null;
  let timeValue: string | null = null;
  let sawAllDay = false;

  for (const element of elements) {
    const appointmentId = element.getAttribute("data-appointment-id");
    if (appointmentId) {
      return {
        kind: "event",
        appointmentId,
        occurrenceKey: element.getAttribute("data-occurrence-key") ?? appointmentId,
      };
    }

    // First of each wins — nearest to the pointer, and the outer week grid also carries dates.
    dayValue ??= element.getAttribute("data-date");
    timeValue ??= element.getAttribute("data-time");
    if (!sawAllDay) sawAllDay = element.classList.contains("fc-daygrid-day");
  }

  const day = localDayFromDateAttr(dayValue);
  if (!day) return { kind: "none" };

  const minutes = minutesOfTimeAttr(timeValue);
  // No time under the pointer means the all-day strip, whose cells carry a date and no
  // `data-time` at all.
  if (minutes === null || sawAllDay) return { kind: "slot", start: day, allDay: true };

  day.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return { kind: "slot", start: day, allDay: false };
}
