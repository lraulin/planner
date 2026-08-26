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
