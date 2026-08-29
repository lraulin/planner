/**
 * Retiring the browser's tail once the authoritative feed catches up to it.
 *
 * When a SimpleFIN sync or a file import advances an account's feed watermark, every
 * `scrape:*` row at or before the new watermark is the same money as a row the feed has now
 * delivered. Keeping both would double it, so the browser copy is deleted in the same
 * transaction as the write that advanced the watermark — the handover is explicit rather
 * than an accumulation of near-duplicates nobody asked for.
 *
 * **The carry-over of user-owned state is a convenience, not an identity decision**, and
 * that distinction is the whole point. Matching is by exact amount and nearest date within
 * the account; description never enters into it, because the two feeds spell a merchant
 * differently and no rule reconciles that (`feedWatermark.ts`). A miss costs a Category,
 * which then shows up in the uncategorized-activity count and in this handover's warnings.
 * It can never produce a duplicate, which is the failure nobody catches.
 *
 * Spec: `agent-os/specs/2026-08-29-1228-feed-ownership-watermark/` D3, D4.
 */

import type { FinanceFlowKind } from "@/db/schema";
import { dateDistance } from "./liveFeedMatch";

/** The user-owned fields that survive a handover. Everything else is the bank's. */
export type CarriedState = {
  budgetCategoryId: string | null;
  notes: string;
  flowOverride: FinanceFlowKind | null;
  excludeFromBaseline: boolean;
  eventLabel: string;
};

export type RetiringRow = CarriedState & {
  id: string;
  transactionDate: string;
  postedDate: string | null;
  amountCents: number;
  description: string;
  /** A split parent, whose children have to move before it can be deleted. */
  isParent: boolean;
};

export type ReplacementRow = CarriedState & {
  id: string;
  transactionDate: string;
  postedDate: string | null;
  amountCents: number;
  isParent: boolean;
};

export type FeedHandoverStep = {
  retiredId: string;
  /** The feed row inheriting this one's user state, or null when nothing matched. */
  replacementId: string | null;
  /** Only the fields the replacement does not already hold; empty when nothing moves. */
  carry: Partial<CarriedState>;
  /** Move this parent's children onto the replacement before deleting it. */
  moveSplitTo: string | null;
};

export type FeedHandoverPlan = {
  steps: FeedHandoverStep[];
  warnings: string[];
};

/** Whether this row holds anything the user typed or chose. */
export function hasUserState(row: CarriedState): boolean {
  return (
    row.budgetCategoryId !== null ||
    row.notes.trim() !== "" ||
    row.flowOverride !== null ||
    row.excludeFromBaseline ||
    row.eventLabel.trim() !== ""
  );
}

/**
 * Which of the retired row's fields the replacement is missing.
 *
 * Never overwrites: a value already on the feed row is the user's later word on the same
 * charge, and a handover is not the place to undo it.
 */
function carryableFields(
  retiring: CarriedState,
  replacement: CarriedState,
): Partial<CarriedState> {
  const carry: Partial<CarriedState> = {};
  if (retiring.budgetCategoryId !== null && replacement.budgetCategoryId === null) {
    carry.budgetCategoryId = retiring.budgetCategoryId;
  }
  if (retiring.notes.trim() !== "" && replacement.notes.trim() === "") {
    carry.notes = retiring.notes;
  }
  if (retiring.flowOverride !== null && replacement.flowOverride === null) {
    carry.flowOverride = retiring.flowOverride;
  }
  if (retiring.excludeFromBaseline && !replacement.excludeFromBaseline) {
    carry.excludeFromBaseline = true;
  }
  if (retiring.eventLabel.trim() !== "" && replacement.eventLabel.trim() === "") {
    carry.eventLabel = retiring.eventLabel;
  }
  return carry;
}

/**
 * Plan one account's handover.
 *
 * Occurrence-counted: each feed row can absorb at most one browser row, so two identical
 * charges on one day stay two charges. Nearest date wins among equal amounts, so a
 * recurring charge pairs with its own occurrence rather than the first one scanned.
 */
export function planFeedHandover(
  retiring: readonly RetiringRow[],
  replacements: readonly ReplacementRow[],
): FeedHandoverPlan {
  const used = new Set<string>();
  const steps: FeedHandoverStep[] = [];
  const warnings: string[] = [];

  for (const row of retiring) {
    const match = replacements
      .filter(
        (candidate) =>
          !used.has(candidate.id) && candidate.amountCents === row.amountCents,
      )
      .sort(
        (left, right) =>
          dateDistance(left, row) - dateDistance(right, row) ||
          left.id.localeCompare(right.id),
      )[0];

    if (!match) {
      if (hasUserState(row) || row.isParent) {
        warnings.push(
          `The bank feed replaced "${row.description}" but no matching row could be found to carry its envelope and notes onto; check it in the register.`,
        );
      }
      steps.push({
        retiredId: row.id,
        replacementId: null,
        carry: {},
        moveSplitTo: null,
      });
      continue;
    }

    used.add(match.id);
    // A split moves only when it transfers without changing its financial meaning. The
    // amounts are equal by construction, so the children still sum to their new parent —
    // unless the feed row is already split, where merging two allocations would invent one.
    let moveSplitTo: string | null = null;
    if (row.isParent) {
      if (match.isParent) {
        warnings.push(
          `Discarded the split on "${row.description}" during the bank-feed handover: the replacing row is already split.`,
        );
      } else moveSplitTo = match.id;
    }
    steps.push({
      retiredId: row.id,
      replacementId: match.id,
      // A parent holds no envelope by construction, and its children carry their own.
      carry: carryableFields(row, match),
      moveSplitTo,
    });
  }

  return { steps, warnings };
}
