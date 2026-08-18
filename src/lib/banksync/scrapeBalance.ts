/**
 * A scrape can write a current balance hours before SimpleFIN notices the pending posted.
 * Refresh must not walk that figure back to yesterday's posted number.
 *
 * Hold until SimpleFIN reports the same cents (it caught up) or the scrape is older than
 * one of SimpleFIN's daily cycles plus slack.
 */

export const SCRAPE_BALANCE_HOLD_MS = 36 * 60 * 60 * 1000;

export function shouldKeepScrapedBalance(
  existing: {
    balanceCents: number | null;
    scrapeBalanceAsOf: Date | null;
  },
  incoming: { balanceCents: number | null },
  nowMs: number,
): boolean {
  if (existing.scrapeBalanceAsOf === null) return false;
  if (incoming.balanceCents === existing.balanceCents) return false;
  return nowMs - existing.scrapeBalanceAsOf.getTime() < SCRAPE_BALANCE_HOLD_MS;
}
