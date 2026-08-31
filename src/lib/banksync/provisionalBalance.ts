/**
 * A browser snapshot or checking CSV can write a current posted balance hours before
 * SimpleFIN catches up. Refresh must not walk that figure back to yesterday's number.
 *
 * Hold until SimpleFIN reports the same cents or the provisional headline is older than
 * one of SimpleFIN's daily cycles plus slack.
 */

export const PROVISIONAL_BALANCE_HOLD_MS = 36 * 60 * 60 * 1000;

export function shouldKeepProvisionalBalance(
  existing: {
    balanceCents: number | null;
    provisionalBalanceAsOf: Date | null;
  },
  incoming: { balanceCents: number | null },
  nowMs: number,
): boolean {
  if (existing.provisionalBalanceAsOf === null) return false;
  if (incoming.balanceCents === existing.balanceCents) return false;
  return (
    nowMs - existing.provisionalBalanceAsOf.getTime() < PROVISIONAL_BALANCE_HOLD_MS
  );
}
