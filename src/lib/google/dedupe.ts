/**
 * Find the Google event a new appointment would duplicate.
 *
 * Planner's create path used to insert into Google unconditionally. When the same
 * appointment was already on the calendar (typed into Google on the phone, then created
 * again through the planner by an agent that could not see it), Google ended up holding two
 * copies: the Oct 9 CAC appointment was one such pair. A create now looks at the target
 * calendar first and links to an event that is plainly the same appointment instead of
 * inserting a second one.
 *
 * "Plainly the same" is deliberately strict on time and loose on wording: the start and end
 * must be the same instants (or the same days, all-day), and the titles must share a
 * meaningful word. Agents paraphrase ("CAC appointment" for "CAC renewal – Pax River"), so
 * an exact-title rule would miss the case this exists for, while two genuinely different
 * events at the exact same minutes that also share a non-generic word are rare enough that
 * linking is the better mistake. The create's caller is told it linked, so it is never
 * silent.
 *
 * Pure so its test needs no Google token or mocked client.
 */

import type { GoogleEvent } from "./mapping";
import { googleEventToFields, type GoogleOwnedFields } from "./mapping";

export type DuplicateCandidate = {
  subject: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
};

/** Words too generic to say two titles name the same thing. */
const GENERIC_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "for",
  "in",
  "of",
  "on",
  "the",
  "to",
  "with",
  "appointment",
  "appt",
  "meeting",
  "call",
  "event",
  "tbd",
  "time",
]);

/** Lowercase, accents and punctuation stripped, split on whitespace. */
export function titleWords(title: string): string[] {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/** Whether two titles plausibly name the same appointment. */
export function titlesMatch(a: string, b: string): boolean {
  const left = titleWords(a);
  const right = titleWords(b);
  if (left.join(" ") === right.join(" ")) return true;
  const rightSet = new Set(right);
  return left.some(
    (word) => word.length >= 3 && !GENERIC_WORDS.has(word) && rightSet.has(word),
  );
}

/**
 * The first live event on the calendar that duplicates `candidate`, as the Google-owned
 * columns a local row would mirror, or null. Cancelled events never match:
 * `googleEventToFields` already refuses them.
 */
export function findDuplicateEvent(
  candidate: DuplicateCandidate,
  events: readonly GoogleEvent[],
  calendarId: string,
): GoogleOwnedFields | null {
  for (const event of events) {
    const fields = googleEventToFields(event, calendarId);
    if (!fields) continue;
    if (fields.allDay !== candidate.allDay) continue;
    if (fields.startAt.getTime() !== candidate.startAt.getTime()) continue;
    if (fields.endAt.getTime() !== candidate.endAt.getTime()) continue;
    if (!titlesMatch(candidate.subject, fields.subject)) continue;
    return fields;
  }
  return null;
}
