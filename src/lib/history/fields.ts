/**
 * Field validation shared by the three life-history domains — life events, jobs, residences.
 *
 * These are business rules, not conveniences, which is why they are shared rather than
 * repeated three times (`development/clean-code.md`: DRY for business rules). Two of them
 * exist specifically to satisfy `development/security.md`: the database holds CHECK
 * constraints on the date ordering, and a constraint violation surfaces a message Postgres
 * wrote, which is never allowed to reach the user. Validating first means the message the
 * user sees is one we wrote, and the CHECK stays as the backstop it should be.
 */

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A `YYYY-MM-DD` calendar day, or null.
 *
 * Blank normalizes to null so an emptied date field clears rather than storing `""`, which
 * Postgres would reject as a date anyway. The shape check is not paranoia about the UI: these
 * values also arrive from a pasted grid cell.
 */
export function dateKeyOrNull(
  value: string | null | undefined,
  label: string,
): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!DATE_KEY.test(trimmed)) throw new Error(`${label} must be a date.`);
  return trimmed;
}

/** A required `YYYY-MM-DD` calendar day. A life event with no date is not a life event. */
export function requireDateKey(
  value: string | null | undefined,
  label: string,
): string {
  const key = dateKeyOrNull(value, label);
  if (!key) throw new Error(`${label} is required.`);
  return key;
}

/**
 * Reject an end before its start, in our words rather than Postgres's.
 *
 * Both null is fine (a job you have not dated yet) and one null is fine (a job you still
 * hold). Only a real inversion is an error.
 */
export function requireOrderedDates(
  start: string | null,
  end: string | null,
  labels: { start: string; end: string },
): void {
  if (start && end && end < start) {
    throw new Error(`${labels.end} cannot be before ${labels.start.toLowerCase()}.`);
  }
}

const MONEY = /^\d+(\.\d{1,2})?$/;

/**
 * A non-negative money amount as the string `numeric` wants, or null.
 *
 * A string end to end, never a float — `MoneyField` writes one, Drizzle reads one back, and
 * `numeric` round-trips it exactly. Parsing to a number in between is how cents go missing,
 * which is why the finance tables do it this way too.
 */
export function moneyOrNull(
  value: string | null | undefined,
  label: string,
): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim().replace(/[$,]/g, "");
  if (!trimmed) return null;
  if (!MONEY.test(trimmed)) {
    throw new Error(`${label} must be a non-negative amount.`);
  }
  return trimmed;
}

/**
 * Copy the text fields that were actually supplied into an update patch.
 *
 * The "only defined fields" rule matters on these tables more than most: a job drawer sends
 * one tab's worth of fields at a time, and an `undefined` that overwrote would silently blank
 * the supervisor block every time you saved the Position tab.
 */
export function patchText<K extends string>(
  patch: Record<string, unknown>,
  input: Partial<Record<K, string>>,
  fields: readonly K[],
): void {
  for (const field of fields) {
    const value = input[field];
    if (value !== undefined) patch[field] = value;
  }
}
