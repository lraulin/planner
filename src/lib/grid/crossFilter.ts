import {
  asFilterOperand,
  matchesCondition,
  operatorNeedsOperand,
  OPERATOR_META,
  type FilterKind,
  type FilterJoin,
  type FilterOperator,
} from "./customFilter";
import type { GridFilterValue } from "./filterValue";

/**
 * The grid's **advanced filter**: one And/Or expression whose conditions may each name a
 * different column.
 *
 * This is the level above `customFilter.ts`, which builds one expression *within* a single
 * column. The two coexist by design — progressive disclosure, from the header funnel to a
 * cross-column builder — and both are applied to a row, ANDed together, by `DataGrid`.
 *
 * The operator vocabulary, the per-kind operator lists and the matching semantics are all
 * reused from `customFilter.ts` rather than forked. The only thing this module adds is the
 * `columnId` on each condition, and what that implies:
 *
 * - A condition may name a column **Show Fields has hidden**. That is the point of the
 *   feature; hiding a column is a layout choice, not a change to what you asked for. The
 *   builder labels such columns as hidden so the state is never invisible.
 * - A condition may name a column that **no longer exists** (renamed, or saved by a view
 *   that no longer offers it). Those are **inert**, never failing. Same rule and the same
 *   reason as `rowPassesFilters` in `./filters`: treating a missing column
 *   as a blank cell would empty the grid with nothing on screen to explain it.
 */

export type CrossCondition = {
  columnId: string;
  op: FilterOperator;
  /** Operand; ignored for blank / nonblank. */
  value: string;
};

export type CrossColumnFilter = {
  join: FilterJoin;
  conditions: CrossCondition[];
};

export const EMPTY_CROSS_FILTER: CrossColumnFilter = { join: "and", conditions: [] };

/**
 * Whether the advanced filter narrows anything.
 *
 * Zero conditions is **inactive**, not "match nothing" — a builder the user opened and left
 * empty must never empty the grid. Mirrors `matchesCustom`'s treatment of an empty
 * condition list.
 */
export function crossFilterActive(filter: CrossColumnFilter | null): boolean {
  return filter !== null && filter.conditions.length > 0;
}

/**
 * Whether one row passes the advanced filter.
 *
 * `values` is keyed by column id and carries an entry for every filterable column the tab
 * **defines** — visible or not. A missing key means the column is gone; see the module note.
 *
 * With `join: "or"`, conditions on missing columns drop out of the disjunction rather than
 * counting as false. If *every* condition names a missing column the filter has nothing
 * left to say, so the row passes.
 */
export function rowPassesCrossFilter(
  values: Record<string, GridFilterValue>,
  filter: CrossColumnFilter | null,
  kinds: Record<string, FilterKind | undefined>,
): boolean {
  if (!crossFilterActive(filter) || filter === null) return true;

  const live = filter.conditions.filter((condition) => condition.columnId in values);
  if (live.length === 0) return true;

  const results = live.map((condition) =>
    matchesCondition(
      values[condition.columnId],
      { op: condition.op, value: condition.value },
      kinds[condition.columnId],
    ),
  );

  return filter.join === "and" ? results.every(Boolean) : results.some(Boolean);
}

/** Human-readable text for one condition's chip, e.g. `Priority ≤ B2`. */
export function describeCrossCondition(
  columnLabel: string,
  condition: CrossCondition,
  valueLabel?: (value: string) => string,
): string {
  const meta = OPERATOR_META[condition.op];
  if (!operatorNeedsOperand(condition.op)) return `${columnLabel} ${meta.label}`;
  const presented = valueLabel ? valueLabel(condition.value) : condition.value;
  const shown = presented === "" ? "''" : presented;
  return `${columnLabel} ${meta.symbol} ${shown}`;
}

/**
 * Full expression for the builder's live preview, e.g.
 * `[Priority] ≤ 'B2' AND [Purpose] ∌ 'archive'`.
 */
export function describeCrossFilter(
  filter: CrossColumnFilter,
  labelOf: (columnId: string) => string,
): string {
  if (filter.conditions.length === 0) return "";

  const parts = filter.conditions.map((condition) => {
    const meta = OPERATOR_META[condition.op];
    const label = `[${labelOf(condition.columnId)}]`;
    if (!operatorNeedsOperand(condition.op)) return `${label} ${meta.symbol}`;
    const shown = condition.value === "" ? "''" : `'${condition.value}'`;
    return `${label} ${meta.symbol} ${shown}`;
  });

  return parts.join(filter.join === "and" ? " AND " : " OR ");
}

/**
 * Parse a stored advanced filter. Garbage anywhere degrades to "no advanced filter" rather
 * than throwing; individual malformed conditions are dropped and their siblings kept, the
 * same posture `parseColumnFilter` takes.
 */
export function parseCrossColumnFilter(value: unknown): CrossColumnFilter | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;

  if (!Array.isArray(record.conditions)) return null;

  const conditions: CrossCondition[] = [];
  for (const entry of record.conditions) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.columnId !== "string" || row.columnId === "") continue;
    if (typeof row.op !== "string" || !(row.op in OPERATOR_META)) continue;
    conditions.push({
      columnId: row.columnId,
      op: row.op as FilterOperator,
      value: asFilterOperand(row.value),
    });
  }

  return { join: record.join === "or" ? "or" : "and", conditions };
}
