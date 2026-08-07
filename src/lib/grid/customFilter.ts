import { priorityOrderValue } from "@/lib/priority/order";
import { parsePriority } from "@/lib/tree/format";

/**
 * Achieve-style custom column filters: multi-condition And/Or with operators restricted
 * by column kind. Checklist filters (presets / distinct values) live alongside as
 * `mode: "options"`; the two modes are mutually exclusive per column.
 *
 * `ColumnFilterKind` mirrors `components/grid/columns` `FilterKind` so this module stays
 * free of the React column layer.
 */

export type ColumnFilterKind = "text" | "priority" | "date" | "enum";

export type FilterJoin = "and" | "or";

export type FilterOperator =
  | "eq"
  | "neq"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "blank"
  | "nonblank"
  | "lt"
  | "lte"
  | "gt"
  | "gte";

export type FilterCondition = {
  op: FilterOperator;
  /** Operand; ignored for blank / nonblank. */
  value: string;
};

export type OptionsColumnFilter = {
  mode: "options";
  /** Option ids from the funnel checklist, OR'd. Empty (or containing `all`) = unfiltered. */
  ids: string[];
};

export type CustomColumnFilter = {
  mode: "custom";
  join: FilterJoin;
  conditions: FilterCondition[];
};

export type ColumnFilter = OptionsColumnFilter | CustomColumnFilter;

export const ALL_FILTER: ColumnFilter = { mode: "options", ids: [] };

/**
 * The option id that matches nothing, so a set filter can say "no values selected".
 *
 * An empty `ids` already means *unfiltered*, so the model has no other way to express a
 * cleared checklist — and without one, `(Select none)` would silently mean its opposite.
 * A sentinel id keeps that inside the existing OR-of-ids shape: it simply never matches, so
 * every matcher, chip and persisted layout handles it without a second filter mode.
 *
 * It is a **staging state**, not a destination: you clear the ticks so you can put three
 * back. Ticking any value drops the sentinel — see `toggleSetEntry`.
 */
export const NONE_OPTION_ID = "none-selected";

export const NONE_FILTER: ColumnFilter = { mode: "options", ids: [NONE_OPTION_ID] };

export function optionsFilter(ids: string[] = []): OptionsColumnFilter {
  return { mode: "options", ids };
}

export function customFilter(
  join: FilterJoin = "and",
  conditions: FilterCondition[] = [{ op: "eq", value: "" }],
): CustomColumnFilter {
  return { mode: "custom", join, conditions };
}

export function isOptionsFilter(filter: ColumnFilter): filter is OptionsColumnFilter {
  return filter.mode === "options";
}

export function isCustomFilter(filter: ColumnFilter): filter is CustomColumnFilter {
  return filter.mode === "custom";
}

/** Whether this column is narrowing anything. */
export function filterActive(filter: ColumnFilter): boolean {
  if (filter.mode === "custom") return filter.conditions.length > 0;
  return filter.ids.length > 0 && !filter.ids.includes("all");
}

export type OperatorOption = { id: FilterOperator; label: string; symbol: string };

/**
 * Label and symbol per operator. Exported so the cross-column builder in `crossFilter.ts`
 * renders the same vocabulary rather than forking a second one, and so `in OPERATOR_META`
 * is the single validity check for an operator read out of a stored blob.
 */
export const OPERATOR_META: Record<FilterOperator, { label: string; symbol: string }> =
  {
    eq: { label: "Equals", symbol: "=" },
    neq: { label: "Does not equal", symbol: "≠" },
    contains: { label: "Contains", symbol: "∋" },
    not_contains: { label: "Does not contain", symbol: "∌" },
    starts_with: { label: "Starts with", symbol: "A…" },
    ends_with: { label: "Ends with", symbol: "…Z" },
    blank: { label: "Is blank", symbol: "∅" },
    nonblank: { label: "Is not blank", symbol: "≠∅" },
    lt: { label: "Less than", symbol: "<" },
    lte: { label: "Less than or equal to", symbol: "≤" },
    gt: { label: "Greater than", symbol: ">" },
    gte: { label: "Greater than or equal to", symbol: "≥" },
  };

const TEXT_OPS: FilterOperator[] = [
  "eq",
  "neq",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "blank",
  "nonblank",
];

const ENUM_OPS: FilterOperator[] = ["eq", "neq", "blank", "nonblank"];

const COMPARE_OPS: FilterOperator[] = [
  "eq",
  "neq",
  "lt",
  "lte",
  "gt",
  "gte",
  "blank",
  "nonblank",
];

/** Operators legal for a column's filter kind. */
export function operatorsForKind(kind: ColumnFilterKind | undefined): OperatorOption[] {
  const ops =
    kind === "priority" || kind === "date"
      ? COMPARE_OPS
      : kind === "enum"
        ? ENUM_OPS
        : TEXT_OPS;

  return ops.map((id) => ({ id, ...OPERATOR_META[id] }));
}

export function operatorNeedsOperand(op: FilterOperator): boolean {
  return op !== "blank" && op !== "nonblank";
}

/**
 * Whether a cell value passes a custom filter. Empty conditions are inactive (pass all).
 * `kind` selects comparison semantics for gt/lt; text ops stay string-based either way.
 */
export function matchesCustom(
  value: string | null,
  filter: CustomColumnFilter,
  kind: ColumnFilterKind | undefined,
): boolean {
  if (filter.conditions.length === 0) return true;

  const results = filter.conditions.map((condition) =>
    matchesCondition(value, condition, kind),
  );
  return filter.join === "and" ? results.every(Boolean) : results.some(Boolean);
}

export function matchesCondition(
  value: string | null,
  condition: FilterCondition,
  kind: ColumnFilterKind | undefined,
): boolean {
  const blank = value === null || value === "";
  const cell = value ?? "";

  switch (condition.op) {
    case "blank":
      return blank;
    case "nonblank":
      return !blank;
    case "eq":
      return !blank && equals(cell, condition.value, kind);
    case "neq":
      // Blank is not equal to a concrete operand — "≠ Cancelled" keeps empty cells.
      if (blank) return true;
      return !equals(cell, condition.value, kind);
    case "contains":
      return !blank && includesInsensitive(cell, condition.value);
    case "not_contains":
      if (blank) return true;
      return !includesInsensitive(cell, condition.value);
    case "starts_with":
      return !blank && startsInsensitive(cell, condition.value);
    case "ends_with":
      return !blank && endsInsensitive(cell, condition.value);
    case "lt":
    case "lte":
    case "gt":
    case "gte":
      return compare(cell, condition.value, condition.op, kind);
    default:
      return true;
  }
}

function equals(
  cell: string,
  operand: string,
  _kind: ColumnFilterKind | undefined,
): boolean {
  // Case-fold so a typed "ns" matches "NS" on enum columns; accents still distinguish.
  void _kind;
  return cell.localeCompare(operand, undefined, { sensitivity: "accent" }) === 0;
}

function includesInsensitive(cell: string, operand: string): boolean {
  if (operand === "") return true;
  return cell.toLocaleLowerCase().includes(operand.toLocaleLowerCase());
}

function startsInsensitive(cell: string, operand: string): boolean {
  if (operand === "") return true;
  return cell.toLocaleLowerCase().startsWith(operand.toLocaleLowerCase());
}

function endsInsensitive(cell: string, operand: string): boolean {
  if (operand === "") return true;
  return cell.toLocaleLowerCase().endsWith(operand.toLocaleLowerCase());
}

/**
 * Blank cells fail every comparison. Priority uses the grid's own ordering so A1 < A10 <
 * bare A < B — the same key the Pri column sorts on, or "greater than B1" would answer one
 * thing in the filter and another in the sort. Dates compare as ISO day strings; everything
 * else is locale string order.
 */
function compare(
  cell: string,
  operand: string,
  op: "lt" | "lte" | "gt" | "gte",
  kind: ColumnFilterKind | undefined,
): boolean {
  if (cell === "" || operand === "") return false;

  if (kind === "priority") {
    const left = priorityKey(cell);
    const right = priorityKey(operand);
    if (left === null || right === null) return false;
    return applyCompare(left, right, op);
  }

  if (kind === "date") {
    // Canonical filter values are YYYY-MM-DD — lexicographic order matches calendar order.
    return applyCompare(cell, operand, op);
  }

  // Text / enum fallback: locale order with numeric awareness ("A2" < "A10").
  const order = cell.localeCompare(operand, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  return applyCompare(order, 0, op);
}

function applyCompare(
  left: number | string,
  right: number | string,
  op: "lt" | "lte" | "gt" | "gte",
): boolean {
  switch (op) {
    case "lt":
      return left < right;
    case "lte":
      return left <= right;
    case "gt":
      return left > right;
    case "gte":
      return left >= right;
  }
}

function priorityKey(raw: string): number | null {
  const parsed = parsePriority(raw);
  if (!parsed) return null;
  return priorityOrderValue(parsed.letter, parsed.rank);
}

/** Human-readable expression for the dialog footer, e.g. `[State] ≠ 'Cn' AND …`. */
export function describeCustom(
  columnLabel: string,
  filter: CustomColumnFilter,
): string {
  if (filter.conditions.length === 0) return "";

  const parts = filter.conditions.map((condition) => {
    const meta = OPERATOR_META[condition.op];
    if (!operatorNeedsOperand(condition.op)) {
      return `[${columnLabel}] ${meta.symbol}`;
    }
    const shown = condition.value === "" ? "''" : `'${condition.value}'`;
    return `[${columnLabel}] ${meta.symbol} ${shown}`;
  });

  const joiner = filter.join === "and" ? " AND " : " OR ";
  return parts.join(joiner);
}

/**
 * Parse a stored filter value. Accepts the structured union and legacy bare `string[]`
 * option-id lists written before custom filters existed.
 */
export function parseColumnFilter(value: unknown): ColumnFilter | null {
  if (Array.isArray(value)) {
    const ids = value.filter((entry): entry is string => typeof entry === "string");
    if (ids.length !== value.length) return null;
    return { mode: "options", ids };
  }

  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;

  if (record.mode === "options") {
    if (!Array.isArray(record.ids)) return null;
    const ids = record.ids.filter(
      (entry): entry is string => typeof entry === "string",
    );
    if (ids.length !== record.ids.length) return null;
    return { mode: "options", ids };
  }

  if (record.mode === "custom") {
    const join: FilterJoin = record.join === "or" ? "or" : "and";
    if (!Array.isArray(record.conditions)) return null;
    const conditions: FilterCondition[] = [];
    for (const entry of record.conditions) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as Record<string, unknown>;
      if (typeof row.op !== "string" || !(row.op in OPERATOR_META)) continue;
      conditions.push({
        op: row.op as FilterOperator,
        value: typeof row.value === "string" ? row.value : "",
      });
    }
    return { mode: "custom", join, conditions };
  }

  return null;
}
