/**
 * Which envelope a transaction belongs to, decided without a rules engine.
 *
 * Three rules, in order, and no user-authored conditions
 * (`agent-os/specs/2026-08-22-1948-zero-based-budget/` D6):
 *
 * 1. **Income is decided by flow**, never by a spending category — the classifier already
 *    knows a paycheck from a purchase, and no value in `FINANCE_CATEGORIES` describes one.
 * 2. **A transfer between two on-budget accounts is not budget activity.** A card payment
 *    moves money inside the budget and spends none of it. Leaving one leg enveloped would
 *    record a purchase that never happened, so neither leg is placed. A transfer *out* of the
 *    budget — to savings — is real spending and is placed normally.
 * 3. **Everything else goes to the envelope that claims its spending category.** Nothing
 *    claims `Uncategorized`, so an unclassified row stays in the backlog, visibly, which is
 *    the honest outcome rather than a guess.
 *
 * Pure, so the precedence is pinned by tests instead of by reading a mutation.
 */

import { effectiveCategory, effectiveFlow } from "../analytics";
import { compare as compareSortKeys } from "@/lib/tree/sortKey";

export type MappableRow = {
  description: string;
  sourceCategory: string;
  category: string | null;
  derivedCategory: string | null;
  derivedFlow: string | null;
  flowOverride: string | null;
  amountCents: number;
  transferGroupId: string | null;
};

export type EnvelopeTarget = {
  id: string;
  isIncome: boolean;
  /** Spending-taxonomy values this envelope claims. Empty for income envelopes. */
  sourceCategories: readonly string[];
  /** Ties are broken by this, so a duplicated claim is deterministic rather than arbitrary. */
  sortKey: string;
};

/**
 * Taxonomy value → envelope id, plus the income envelope.
 *
 * Built once per pass. A value claimed by two envelopes resolves to the earlier one by sort
 * key: the cost of a duplicate is a row in the wrong envelope, which the user can see and
 * fix, and refusing to build the index would instead strand every row in the backlog.
 */
export type EnvelopeIndex = {
  byCategory: ReadonlyMap<string, string>;
  incomeId: string | null;
};

export function envelopeIndex(targets: readonly EnvelopeTarget[]): EnvelopeIndex {
  const ordered = [...targets].sort((left, right) =>
    compareSortKeys(left.sortKey, right.sortKey),
  );

  const byCategory = new Map<string, string>();
  let incomeId: string | null = null;

  for (const target of ordered) {
    if (target.isIncome) {
      incomeId ??= target.id;
      continue;
    }
    for (const category of target.sourceCategories) {
      if (!byCategory.has(category)) byCategory.set(category, target.id);
    }
  }

  return { byCategory, incomeId };
}

/**
 * The envelope for one row, or null to leave it in the backlog.
 *
 * `internalTransferGroups` holds the transfer groups whose legs both sit on on-budget
 * accounts. The caller computes it, because deciding it needs the account side of the join
 * and this module has no database.
 */
export function envelopeForRow(
  row: MappableRow,
  index: EnvelopeIndex,
  internalTransferGroups: ReadonlySet<string>,
): string | null {
  const flow = effectiveFlow({
    derivedFlow: row.derivedFlow as never,
    flowOverride: row.flowOverride as never,
    amountCents: row.amountCents,
  });

  if (flow === "income") return index.incomeId;

  if (row.transferGroupId !== null && internalTransferGroups.has(row.transferGroupId)) {
    return null;
  }

  return index.byCategory.get(effectiveCategory(row)) ?? null;
}
