import type { MonthKey } from "./envelope";

/** The pure half of `mismatchClues.ts`, apart so a unit test needs no database. */

/** How one register row would account for an account's whole mismatch. */
export type CandidateReading =
  /** In the register since the start month, and not (or not yet) at the bank. */
  | "extra-since-start"
  /** Dated before the start month, so it moves the balance but is not a row since start. */
  | "dated-before-start";

/**
 * Whether `row` alone would close a mismatch of `mismatchCents`, and how.
 *
 * - A row since the start month with amount `−mismatch`: the register counts it and the
 *   bank does not. Deleting it (a duplicate, a hold that dropped) closes the gap.
 * - A row before the start month with amount `+mismatch`: it is in the balance but not in
 *   "rows since start" — misdated, or imported after the opening was recorded.
 *
 * A row of `+mismatch` since start is the *other* copy of what is missing, not the cause,
 * so it is not a candidate.
 */
export function candidateReading(
  mismatchCents: number,
  startMonth: MonthKey,
  row: { transactionDate: string; amountCents: number },
): CandidateReading | null {
  if (mismatchCents === 0) return null;
  const sinceStart = row.transactionDate >= startMonth;
  if (sinceStart && row.amountCents === -mismatchCents) return "extra-since-start";
  if (!sinceStart && row.amountCents === mismatchCents) return "dated-before-start";
  return null;
}
