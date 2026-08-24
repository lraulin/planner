/** Pure rules for consolidating payee identity. */

export type MergeClaim = { id: string };

export type MergeClaimDecision<T extends MergeClaim> = {
  claim: T | null;
  refusal: string | null;
};

/**
 * The one claim the survivor may keep.
 *
 * Several selected payees may already carry the same claim after the matcher bridge. That
 * is one identity repeated, not a conflict. Only distinct envelope identities make the
 * merge ambiguous.
 */
export function mergeClaimDecision<T extends MergeClaim>(
  payees: readonly { claim: T | null }[],
): MergeClaimDecision<T> {
  const distinct = new Map<string, T>();
  for (const payee of payees) {
    if (!payee.claim) continue;
    distinct.set(payee.claim.id, payee.claim);
  }

  if (distinct.size > 1) {
    return {
      claim: null,
      refusal:
        "Those payees are claimed by different envelopes. Release one before merging.",
    };
  }
  return { claim: distinct.values().next().value ?? null, refusal: null };
}
