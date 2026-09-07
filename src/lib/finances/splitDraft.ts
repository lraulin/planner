/**
 * The unsaved state of the drawer's split editor, and what saving it should do.
 *
 * The split used to be committed by a button inside the editor, which made it the one part
 * of `TransactionDrawer` the footer's Save did not write: filling in the parts and pressing
 * **Save & Close** dropped them on the floor with no error and no prompt, against
 * `standards/components/drawer-pattern.md` ("every leave path must share the same
 * dirty-aware handler"). The draft now belongs to the form, so this module holds the part
 * that can be tested away from React: what the parts become, and which mutation — if any —
 * a Save should call.
 */

import { centsToNumericString } from "./money";

/** One row of the editor. Amounts are held as text until a blur parses them. */
export type SplitDraftChild = {
  /**
   * Stable across re-renders so an amount field does not lose focus. Not the row id: a part
   * that has never been saved has no id, and two of them must still be told apart.
   */
  key: string;
  id?: string;
  amountCents: number;
  amountText: string;
  budgetCategoryId: string | null;
  notes: string;
};

/** The shape `splitTransaction` / `updateSplitChildren` take. Structural on purpose: this module is imported by a client component, and `mutations.ts` reaches the database. */
export type SplitChildPayload = {
  id?: string;
  amountCents: number;
  budgetCategoryId: string | null;
  notes: string;
};

/** A saved child, as the Register hands it to the drawer. */
type SavedSplitChild = {
  id: string;
  amountCents: number;
  budgetCategoryId: string | null;
  notes: string;
};

export function splitDraftFromSaved(row: SavedSplitChild): SplitDraftChild {
  return {
    key: row.id,
    id: row.id,
    amountCents: row.amountCents,
    amountText: centsToNumericString(row.amountCents),
    budgetCategoryId: row.budgetCategoryId,
    notes: row.notes,
  };
}

export function emptySplitDraft(key: string): SplitDraftChild {
  return {
    key,
    amountCents: 0,
    amountText: "",
    budgetCategoryId: null,
    notes: "",
  };
}

export function splitDraftPayload(
  drafts: readonly SplitDraftChild[],
): SplitChildPayload[] {
  return drafts.map((child) => ({
    id: child.id,
    amountCents: child.amountCents,
    budgetCategoryId: child.budgetCategoryId,
    notes: child.notes,
  }));
}

/**
 * What the drawer's Save owes the database for the split, if anything.
 *
 * `unsplit` is how removing every part is spelled: D11 of
 * `agent-os/specs/2026-08-26-2022-split-transactions/` says an empty set restores an
 * ordinary transaction, so the editor needs no separate immediate-write Unsplit button and
 * the removal is undoable by Cancel like every other edit in the drawer.
 */
export type SplitCommit =
  | { kind: "none" }
  | { kind: "create"; children: SplitChildPayload[] }
  | { kind: "update"; children: SplitChildPayload[] }
  | { kind: "unsplit" };

/**
 * Nothing to write when the editor was never opened, when it was opened and left alone, or
 * when parts were drafted for a row that is not split and then all removed again — that
 * last one would otherwise reach the mutation as "a split needs at least one child", which
 * is a true statement about an intent the user has already abandoned.
 */
export function planSplitCommit(input: {
  alreadySplit: boolean;
  dirty: boolean;
  drafts: readonly SplitDraftChild[] | null;
}): SplitCommit {
  const { alreadySplit, dirty, drafts } = input;
  if (!dirty || drafts === null) return { kind: "none" };
  if (drafts.length === 0) {
    return alreadySplit ? { kind: "unsplit" } : { kind: "none" };
  }
  const children = splitDraftPayload(drafts);
  return alreadySplit ? { kind: "update", children } : { kind: "create", children };
}
