import type { RecurringMerchant } from "./analytics";

export const REVIEW_SORT_COLUMNS = [
  "merchant",
  "shape",
  "typical",
  "annual",
  "lastCharge",
] as const;

export type ReviewSortColumn = (typeof REVIEW_SORT_COLUMNS)[number];

export type ReviewSort = {
  column: ReviewSortColumn;
  direction: "asc" | "desc";
};

/** Most recent charge first — the inbox order once the list is a backlog, not a discovery. */
export const DEFAULT_REVIEW_SORT: ReviewSort = {
  column: "lastCharge",
  direction: "desc",
};

function valueOf(entry: RecurringMerchant, column: ReviewSortColumn): string | number {
  switch (column) {
    case "merchant":
      return entry.merchant;
    case "shape":
      return entry.shape;
    case "typical":
      return entry.typicalCents;
    case "annual":
      return entry.annualCents;
    case "lastCharge":
      return entry.lastChargeOn;
  }
}

/**
 * Review's comparator. Numbers and dates compare as themselves; names and "looks like"
 * are case-insensitive so a sort does not hide behind the bank's shouting.
 */
export function compareReviewItems(
  left: RecurringMerchant,
  right: RecurringMerchant,
  sort: ReviewSort,
): number {
  const a = valueOf(left, sort.column);
  const b = valueOf(right, sort.column);
  const delta =
    typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
  if (delta !== 0) return sort.direction === "asc" ? delta : -delta;
  return left.merchant.localeCompare(right.merchant);
}

export function sortReviewItems(
  items: readonly RecurringMerchant[],
  sort: ReviewSort,
): RecurringMerchant[] {
  return [...items].sort((left, right) => compareReviewItems(left, right, sort));
}

/** Click the same column to reverse it; a new column starts descending for money/dates. */
export function nextReviewSort(
  current: ReviewSort,
  column: ReviewSortColumn,
): ReviewSort {
  if (current.column === column) {
    return { column, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  const descending =
    column === "typical" || column === "annual" || column === "lastCharge";
  return { column, direction: descending ? "desc" : "asc" };
}
