import { daysBetweenKeys } from "@/lib/schedule/geometry";

/**
 * Pairing a PayPal statement entry with the register row it names.
 *
 * The bank feed and PayPal never agree on the words: checking says
 * `Deposit from PAYPAL from LEE RAULIN TRANSFER` and PayPal says
 * `General Payment: Dennis Raulin`. `descriptionsMatch` would reject every pair,
 * so identity is date + signed amount, occurrence-counted so two identical
 * $18.01 Spotify rows on one day still each find their own entry.
 *
 * The five-day window is the same posting slack `transfers.ts` already trusts.
 * Same-day matches are claimed first so a nearby unrelated row of the same
 * size cannot steal a pair that actually posted together.
 */

/** How far a statement date and a bank date may drift and still be one event. */
export const PAYPAL_MATCH_WINDOW_DAYS = 5;

export type PaypalResolution = {
  externalId: string;
  /** `YYYY-MM-DD`. */
  date: string;
  /** Module sign; positive is money arriving. */
  amountCents: number;
  counterparty: string;
  direction: "in" | "out";
};

export type MatchableRow = {
  id: string;
  /** `YYYY-MM-DD`. */
  transactionDate: string;
  amountCents: number;
};

export type PaypalMatch = {
  /** Register row id → the statement entry that names it. */
  byRowId: Map<string, PaypalResolution>;
};

function gap(left: string, right: string): number {
  return Math.abs(daysBetweenKeys(left, right));
}

/**
 * Pair each resolution with at most one unused row of the same signed amount
 * within the posting window. Closest date wins; id is the tiebreak so two
 * identical candidates cannot swap between runs.
 */
export function matchPaypalResolutions(
  rows: readonly MatchableRow[],
  resolutions: readonly PaypalResolution[],
): PaypalMatch {
  const unused = rows.map((row) => ({ row, used: false }));
  const byRowId = new Map<string, PaypalResolution>();

  const ordered = [...resolutions].sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      left.externalId.localeCompare(right.externalId),
  );

  for (const resolution of ordered) {
    const candidates = unused.filter(
      (entry) =>
        !entry.used &&
        entry.row.amountCents === resolution.amountCents &&
        gap(entry.row.transactionDate, resolution.date) <= PAYPAL_MATCH_WINDOW_DAYS,
    );
    if (candidates.length === 0) continue;

    candidates.sort((left, right) => {
      const leftSameDay = left.row.transactionDate === resolution.date ? 0 : 1;
      const rightSameDay = right.row.transactionDate === resolution.date ? 0 : 1;
      return (
        leftSameDay - rightSameDay ||
        gap(left.row.transactionDate, resolution.date) -
          gap(right.row.transactionDate, resolution.date) ||
        left.row.id.localeCompare(right.row.id)
      );
    });

    const winner = candidates[0];
    winner.used = true;
    byRowId.set(winner.row.id, resolution);
  }

  return { byRowId };
}

const INBOUND_PAYPAL = /PAYPAL FROM LEE RAULIN/i;

export type UnresolvedPaypalInflow = {
  rowId: string;
  date: string;
  amountCents: number;
  /** Why this row has no statement name — never a silent bucket. */
  reason: string;
};

/**
 * Inbound PayPal deposits the statements did not name.
 *
 * The two large 2024 gifts ($4,625.17 and $7,000) predate the supplied PDFs.
 * Reporting them with a reason is what stops them looking like a hole the
 * matcher simply missed.
 */
export function unresolvedPaypalInflows(
  rows: readonly (MatchableRow & { description: string })[],
  resolutions: readonly PaypalResolution[],
): UnresolvedPaypalInflow[] {
  const { byRowId } = matchPaypalResolutions(rows, resolutions);
  const coverageStart = earliestDate(resolutions);

  const unresolved: UnresolvedPaypalInflow[] = [];
  for (const row of rows) {
    if (row.amountCents <= 0) continue;
    if (!INBOUND_PAYPAL.test(row.description)) continue;
    if (byRowId.has(row.id)) continue;

    const reason =
      coverageStart === null
        ? "No PayPal statements imported"
        : row.transactionDate < coverageStart
          ? `No PayPal statement covers this date (statements start ${coverageStart})`
          : "No matching PayPal receipt";

    unresolved.push({
      rowId: row.id,
      date: row.transactionDate,
      amountCents: row.amountCents,
      reason,
    });
  }
  return unresolved;
}

function earliestDate(resolutions: readonly PaypalResolution[]): string | null {
  let earliest: string | null = null;
  for (const resolution of resolutions) {
    if (earliest === null || resolution.date < earliest) earliest = resolution.date;
  }
  return earliest;
}
