/**
 * Remainder templates: leftover Ready to Assign, last, split by weight.
 *
 * **Reimplemented from Actual Budget** — `distributeRemainder` / `runRemainder` in
 * `packages/loot-core/src/server/budget/goal-template.ts` and
 * `category-template-context.ts` (MIT, © James Long). Leftover ≤ 0 assigns nothing.
 * The last line absorbs the rounding cent.
 *
 * Spec: `agent-os/specs/2026-08-22-2242-budget-goal-templates/` D2.
 */

export type RemainderShare = { envelopeId: string; weight: number };

/**
 * Split leftover Ready to Assign across remainder envelopes. `leftoverCents <= 0` is all
 * zeros — remainder never drives Ready to Assign negative.
 */
export function distributeRemainder(
  shares: readonly RemainderShare[],
  leftoverCents: number,
): Map<string, number> {
  const assigned = new Map<string, number>();
  for (const share of shares) assigned.set(share.envelopeId, 0);
  if (leftoverCents <= 0 || shares.length === 0) return assigned;

  const totalWeight = shares.reduce((sum, share) => sum + share.weight, 0);
  if (totalWeight <= 0) return assigned;

  let remaining = leftoverCents;
  shares.forEach((share, index) => {
    const isLast = index === shares.length - 1;
    const slice = isLast
      ? remaining
      : Math.round(leftoverCents * (share.weight / totalWeight));
    const allocated = Math.max(0, Math.min(slice, remaining));
    assigned.set(share.envelopeId, allocated);
    remaining -= allocated;
  });
  return assigned;
}
