/**
 * Whether two integer-cent amounts are the same charge, within Actual's approximate band.
 *
 * Copied from Actual's `getApproxNumberThreshold` in
 * `packages/loot-core/src/shared/rules.ts`: `round(|n| * 0.075)`. A $9.99 Apple Music
 * charge is within 75¢ of itself; a $10.99 iCloud charge is not. Used when one bank
 * merchant string (`PP*APPLE.COM/BILL`) is many products, and amount is the only way to
 * tell a subscription from a one-off.
 */

/** Actual's 7.5% band, in integer cents. */
export function approxThreshold(cents: number): number {
  return Math.round(Math.abs(cents) * 0.075);
}

export function amountMatches(candidateCents: number, targetCents: number): boolean {
  return Math.abs(candidateCents - targetCents) <= approxThreshold(targetCents);
}

/** Median of integer cents, or null when there is nothing to average. */
export function medianCents(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/**
 * Same 25% band the recurring detector uses (`analytics.ts`). A range is an admission that
 * the stated amount is soft; printing one for MetLife ($100.24 twelve times) would argue
 * with a figure that is already a fact.
 */
const AMOUNT_SPREAD_RATIO = 0.25;

/**
 * Observed min–max of a bill's charges, or null when the spread is too tight to mention.
 *
 * `(high − low) / high` rather than standard deviation: two fills of $336 and $540 should
 * show as a range even though n=2 makes stddev a poor story, and a 16% Geico swing stays
 * under the band.
 */
export function observedAmountRange(
  amounts: readonly number[],
): { lowCents: number; highCents: number } | null {
  if (amounts.length < 2) return null;
  const lowCents = Math.min(...amounts);
  const highCents = Math.max(...amounts);
  if (highCents <= 0) return null;
  if ((highCents - lowCents) / highCents <= AMOUNT_SPREAD_RATIO) return null;
  return { lowCents, highCents };
}
