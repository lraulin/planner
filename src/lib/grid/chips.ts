import { describeCustom, filterActive, type ColumnFilter } from "./customFilter";
import {
  crossFilterActive,
  describeCrossCondition,
  type CrossColumnFilter,
} from "./crossFilter";
import { searchActive } from "./search";

/**
 * What is currently narrowing a grid, as a flat list the toolbar can render as removable
 * chips.
 *
 * The problem this solves: three separate controls narrow the rows — column funnels, the
 * advanced builder, and the search box — and two of the three are invisible once their
 * popover closes. A user looking at forty rows out of three hundred had no way to see what
 * they had asked for, or to undo one piece of it without clearing everything.
 *
 * Each chip therefore carries enough to remove exactly its own condition and nothing else.
 * Kept pure and free of React so the labelling rules are testable — the wording *is* the
 * feature here.
 */

export type GridChip =
  /** A whole column's funnel selection. Removing it resets that column to (All). */
  | { kind: "column"; key: string; columnId: string; label: string }
  /** One condition of the cross-column advanced filter, by its index. */
  | { kind: "condition"; key: string; index: number; label: string }
  | { kind: "search"; key: string; label: string };

export type ChipContext = {
  filters: Record<string, ColumnFilter>;
  advancedFilter: CrossColumnFilter | null;
  search: string;
  /** Header label for a column id; falls back to the id for a column that is gone. */
  labelOf: (columnId: string) => string;
  /**
   * Human text for one option id within a column's funnel — `only-as` → "Only As",
   * `value:IP` → "IP". The option vocabulary lives in the component layer, so it is passed
   * in rather than imported.
   */
  optionLabelOf: (columnId: string, optionId: string) => string;
  /** Standalone presentation for custom-filter operands such as canonical date keys. */
  operandLabelOf?: (columnId: string, value: string) => string;
  /**
   * Every option id a column's set filter could tick, so a chip can describe a mostly-ticked
   * list by what it *excludes*. Omit it (or return `[]`) and chips fall back to counting.
   */
  domainOf?: (columnId: string) => string[];
};

/**
 * How many option ids a column chip spells out before summarising. Past three the chip
 * stops being scannable and starts being a paragraph.
 */
const MAX_LISTED_OPTIONS = 3;

export function buildGridChips(context: ChipContext): GridChip[] {
  const chips: GridChip[] = [];

  for (const [columnId, filter] of Object.entries(context.filters)) {
    if (!filterActive(filter)) continue;
    // A set filter ticking every value the column currently holds is hiding nothing, and a
    // chip's job is to account for rows that are missing. This is what a view's default
    // filter looks like on data that has none of the states it excludes — "Status: 7
    // selected" beside "Showing 22 of 22" reads as though something were filtered out.
    if (coversEveryValue(columnId, filter, context)) continue;
    chips.push({
      kind: "column",
      key: `column:${columnId}`,
      columnId,
      label: describeColumnFilter(columnId, filter, context),
    });
  }

  if (crossFilterActive(context.advancedFilter) && context.advancedFilter) {
    context.advancedFilter.conditions.forEach((condition, index) => {
      chips.push({
        kind: "condition",
        key: `condition:${index}`,
        index,
        label: describeCrossCondition(
          context.labelOf(condition.columnId),
          condition,
          context.operandLabelOf
            ? (value) => context.operandLabelOf?.(condition.columnId, value) ?? value
            : undefined,
        ),
      });
    });
  }

  if (searchActive(context.search)) {
    chips.push({
      kind: "search",
      key: "search",
      label: `Search "${context.search.trim()}"`,
    });
  }

  return chips;
}

/** True when every value present in the column is ticked. */
function coversEveryValue(
  columnId: string,
  filter: ColumnFilter,
  context: ChipContext,
): boolean {
  if (filter.mode !== "options") return false;
  const domain = context.domainOf?.(columnId) ?? [];
  if (domain.length === 0) return false;
  const ids = new Set(filter.ids);
  return domain.every((id) => ids.has(id));
}

function describeColumnFilter(
  columnId: string,
  filter: ColumnFilter,
  context: ChipContext,
): string {
  const columnLabel = context.labelOf(columnId);

  if (filter.mode === "custom") {
    // The expression already names the column in brackets, so it stands alone.
    return describeCustom(
      columnLabel,
      filter,
      context.operandLabelOf
        ? (value) => context.operandLabelOf?.(columnId, value) ?? value
        : undefined,
    );
  }

  const ids = filter.ids.filter((id) => id !== "all");
  if (ids.length <= MAX_LISTED_OPTIONS) {
    const parts = ids.map((id) => context.optionLabelOf(columnId, id));
    return `${columnLabel}: ${parts.join(", ")}`;
  }

  /*
    A set filter stores what is *ticked*, so hiding two states out of nine is stored as seven
    ids — and "State: 7 selected" tells you a column is narrowed while withholding the only
    thing you wanted to know. Views open with exactly that shape, so describe it by what is
    missing whenever that is the shorter list: "State: all but Completed, Cancelled".
  */
  const excluded = (context.domainOf?.(columnId) ?? []).filter(
    (id) => !ids.includes(id),
  );
  if (excluded.length > 0 && excluded.length <= MAX_LISTED_OPTIONS) {
    const parts = excluded.map((id) => context.optionLabelOf(columnId, id));
    return `${columnLabel}: all but ${parts.join(", ")}`;
  }

  // Beyond the cap the exact set matters less than knowing the column is narrowed and by
  // roughly how much — the funnel is one click away for the detail.
  return `${columnLabel}: ${ids.length} selected`;
}
