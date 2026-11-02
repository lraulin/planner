import { dateKeyFromParts, isDateKey } from "@/lib/schedule/geometry";

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

/**
 * A calendar day as a US site prints it — `2026-08-29`, `Sat, Aug 29, 2026`,
 * `August 29, 2026`, `08/29/2026` — as a `YYYY-MM-DD` key, or null for anything else or a
 * day that does not exist.
 *
 * Parsed by components, never through `new Date(text)`: a printed date is a day label, not
 * an instant, and the process timezone must not move it (`development/dates.md`).
 */
export function parseCalendarDayText(text: string): string | null {
  const value = text.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return isDateKey(value) ? value : null;

  const named = /^(?:[A-Za-z]{3,9},?\s+)?([A-Za-z]{3,9})\s+(\d{1,2}),\s+(\d{4})$/.exec(
    value,
  );
  if (named) {
    const month = MONTHS[named[1].toLowerCase()];
    if (month === undefined) return null;
    return dateKeyFromParts(Number(named[3]), month, Number(named[2]));
  }

  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (slash)
    return dateKeyFromParts(Number(slash[3]), Number(slash[1]), Number(slash[2]));
  return null;
}
