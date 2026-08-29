/**
 * When a **bill** envelope's payee claim files a charge, and when it must not.
 *
 * A claim means "this merchant's charges belong to this envelope"
 * (`agent-os/specs/2026-08-24-1522-category-by-kind-and-history/` D3), which is right for a
 * merchant that only ever bills you and wrong for one that is both a subscription and a
 * shop. CVS is the case that broke it: a $5.00/month ExtraCare membership and an occasional
 * $22.84 shopping trip arrive under one payee, and filing the second into the first spent a
 * balanced envelope $22.84 over with no uncategorized-activity warning to show for it.
 *
 * A bill already states what it costs and how often. So for a bill envelope the claim files
 * only a charge that looks like *that bill*: within Actual's approximate band of the bill's
 * own amount, and not a second charge inside one cadence period. Anything else falls through
 * to the payee's learned default, or stays uncategorized — which is exactly the signal the
 * backlog count exists to raise.
 *
 * A non-bill envelope's claim is unchanged: it still means every charge.
 *
 * Spec: `agent-os/specs/2026-08-29-1228-feed-ownership-watermark/` D5.
 */

import { amountMatches } from "../amountMatch";
import { cadenceDaysApprox, cadenceOf, type Cadence } from "../recurringBills";

/** The bill facet, as `finance_budget_categories` holds it. */
export type BillClaimFacet = {
  /** What the bill costs, or null to use the median of the charges on file. */
  expectedCents: number | null;
  cadenceMonths: number;
  cadenceDays: number | null;
};

/** One charge already filed into the bill, for the median and the cadence guard. */
export type BillChargeOnFile = { transactionDate: string; amountCents: number };

export type BillClaimCandidate = {
  id: string;
  transactionDate: string;
  amountCents: number;
};

/**
 * How close two charges may sit before the second one is a second charge rather than the
 * next cycle.
 *
 * A "monthly" bill's real gaps run 28–31 days against a 30.44-day cycle, so the guard has
 * to sit below the shortest honest gap or February would refuse the March charge. The same
 * 12% `recurringBills.ts` uses to recognise a cadence from observed gaps.
 */
export const CADENCE_GAP_TOLERANCE = 0.12;

function daysApart(a: string, b: string): number {
  return (
    Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000
  );
}

function medianCents(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/**
 * What one charge of this bill costs: the declared amount, or the median of the charges on
 * file when it declares none. Null when it declares none and has no history — where there
 * is nothing to compare against, the claim keeps its old meaning.
 */
export function billChargeCents(
  bill: BillClaimFacet,
  history: readonly BillChargeOnFile[],
): number | null {
  if (bill.expectedCents !== null) {
    // Stored as a magnitude; a card charge is negative in module sign.
    return -Math.abs(bill.expectedCents);
  }
  return medianCents(history.map((row) => row.amountCents));
}

/** The shortest gap that still reads as the next cycle rather than a second charge. */
export function minimumCadenceGapDays(cadence: Cadence): number {
  return cadenceDaysApprox(cadence) * (1 - CADENCE_GAP_TOLERANCE);
}

/**
 * Which of these candidates a bill's claim files.
 *
 * Candidates are considered oldest first and an accepted one joins the history, so two
 * $5.00 CVS charges a week apart file the first and leave the second uncategorized rather
 * than both landing on a $5.00/month envelope.
 */
export function billClaimAccepts(
  bill: BillClaimFacet,
  history: readonly BillChargeOnFile[],
  candidates: readonly BillClaimCandidate[],
): Set<string> {
  const expected = billChargeCents(bill, history);
  if (expected === null || expected === 0) {
    return new Set(candidates.map((row) => row.id));
  }
  const cadence = cadenceOf(bill);
  const minimumGap = minimumCadenceGapDays(cadence);
  const filed = history.map((row) => row.transactionDate);
  const accepted = new Set<string>();

  for (const candidate of [...candidates].sort(
    (left, right) =>
      left.transactionDate.localeCompare(right.transactionDate) ||
      left.id.localeCompare(right.id),
  )) {
    if (!amountMatches(candidate.amountCents, expected)) continue;
    if (filed.some((date) => daysApart(date, candidate.transactionDate) < minimumGap)) {
      continue;
    }
    accepted.add(candidate.id);
    filed.push(candidate.transactionDate);
  }
  return accepted;
}
