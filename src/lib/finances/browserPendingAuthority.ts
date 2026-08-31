/**
 * A complete browser snapshot owns the account's pending set while it is fresh. The
 * timestamp is durable evidence; expiry hands authority back to SimpleFIN automatically.
 */

export const BROWSER_PENDING_AUTHORITY_MS = 36 * 60 * 60 * 1000;

export function hasBrowserPendingAuthority(
  browserPendingAsOf: Date | null,
  nowMs: number,
): boolean {
  return (
    browserPendingAsOf !== null &&
    nowMs - browserPendingAsOf.getTime() < BROWSER_PENDING_AUTHORITY_MS
  );
}
