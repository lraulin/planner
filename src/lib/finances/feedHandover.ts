/**
 * Retiring the browser's tail once the authoritative feed has delivered the same charge.
 *
 * A browser row and a history-feed row (`api:simplefin`, `csv:*`) that pair under
 * `feedPairing.ts` are the same money told twice. Keeping both would double it, so the
 * browser copy is deleted in the same transaction as the write that delivered its feed
 * twin — the handover is explicit rather than an accumulation of near-duplicates nobody
 * asked for.
 *
 * **This module used to decide retirement by date alone**: whichever feed row had the
 * nearest date at the same amount, with no ceiling on "nearest" and no look at the
 * description. That deleted posted rows a feed's dates merely *covered*, whether or not the
 * feed had actually delivered the same charge — a `scrape:*` hold with no real successor,
 * or a scraped **ChatGPT** row carrying its envelope onto SimpleFIN's **Claude** row two
 * days away. Retirement now runs entirely off `pairRows` (D2 of `agent-os/specs/
 * 2026-09-13-1127-ingest-by-identity/`): a browser row with no pair is not retired, full
 * stop — it stays in the register with its envelope intact, and if it really is wrong, the
 * user deletes it by hand.
 *
 * **The carry-over of user-owned state is a convenience, not the identity decision.** Once
 * a pair exists, its envelope, notes and split move onto the feed row — never overwriting a
 * value the user has already put there.
 *
 * Spec: `agent-os/specs/2026-09-13-1127-ingest-by-identity/` D1, D2.
 */

import type { FinanceFlowKind } from "@/db/schema";
import { pairRows, type PairableRow } from "./feedPairing";

/** The user-owned fields that survive a handover. Everything else is the bank's. */
export type CarriedState = {
  budgetCategoryId: string | null;
  notes: string;
  flowOverride: FinanceFlowKind | null;
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
  description: string;
  isParent: boolean;
};

export type FeedHandoverStep = {
  retiredId: string;
  replacementId: string;
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
    row.flowOverride !== null
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
  return carry;
}

function toPairable(row: RetiringRow | ReplacementRow): PairableRow {
  return {
    id: row.id,
    transactionDate: row.transactionDate,
    postedDate: row.postedDate,
    amountCents: row.amountCents,
    description: row.description,
  };
}

/**
 * Plan one account's handover.
 *
 * A retiring row with no pair produces no step — it is not retired, so there is nothing to
 * warn about. Everything else here is what to do with a row that *did* pair: carry its
 * state, and move a split onto the replacement when the replacement is not already split.
 */
export function planFeedHandover(
  retiring: readonly RetiringRow[],
  replacements: readonly ReplacementRow[],
): FeedHandoverPlan {
  const retiringById = new Map(retiring.map((row) => [row.id, row]));
  const replacementById = new Map(replacements.map((row) => [row.id, row]));
  const pairings = pairRows(retiring.map(toPairable), replacements.map(toPairable));

  const steps: FeedHandoverStep[] = [];
  const warnings: string[] = [];

  for (const pairing of pairings) {
    const row = retiringById.get(pairing.browserId);
    const match = replacementById.get(pairing.feedId);
    if (!row || !match) continue;

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
