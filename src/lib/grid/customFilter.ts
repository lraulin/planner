import { priorityOrderValue } from "@/lib/priority/order";
import { parsePriority } from "@/lib/tree/format";
import {
  filterValueBlank,
  scalarFilterValues,
  type GridFilterValue,
} from "./filterValue";

/**
 * Achieve-style custom column filters: multi-condition And/Or with operators restricted
 * by column kind. Checklist filters (presets / distinct values) live alongside as
 * `mode: "options"`; the two modes are mutually exclusive per column.
 *
 */

/**
 * How a column's filter dropdown behaves. Semantic presets (priority ranks, deadline
 * bands) hang off this; plain columns only get (All)/(Blanks)/(NonBlanks)/values.
 *
 * Defined here rather than on `ColumnDef` because it is filter vocabulary, not
 * presentation — `components/grid/columns` re-exports it for the column definitions.
 */
export type FilterKind = "text" | "priority" | "date" | "enum" | "tags" | "number";

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
export function operatorsForKind(kind: FilterKind | undefined): OperatorOption[] {
  const ops =
    kind === "priority" || kind === "date" || kind === "number"
      ? COMPARE_OPS
      : kind === "enum" || kind === "tags"
        ? ENUM_OPS
        : TEXT_OPS;

  return ops.map((id) => ({ id, ...OPERATOR_META[id] }));
}

export function operatorNeedsOperand(op: FilterOperator): boolean {
  return op !== "blank" && op !== "nonblank";
}

/**
 * Fresh-condition operand for a kind. Number columns start at 0 because that is the
 * origin of the number line and the value the criteria dialog's "0.00" placeholder
 * advertised — an empty string stored instead, and Amount > 0 became Amount > ''.
 */
export function defaultFilterOperand(kind: FilterKind | undefined): string {
  return kind === "number" ? "0" : "";
}

/**
 * Operand as stored on a condition. JSON/JSONB may hand a finite number (especially 0);
 * that is still a value. Dropping non-strings to "" is how Amount > 0 became Amount > ''.
 */
export function asFilterOperand(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

/**
 * Whether a cell value passes a custom filter. Empty conditions are inactive (pass all).
 * `kind` selects comparison semantics for gt/lt; text ops stay string-based either way.
 */
export function matchesCustom(
  value: GridFilterValue,
  filter: CustomColumnFilter,
  kind: FilterKind | undefined,
): boolean {
  if (filter.conditions.length === 0) return true;

  const results = filter.conditions.map((condition) =>
    matchesCondition(value, condition, kind),
  );
  return filter.join === "and" ? results.every(Boolean) : results.some(Boolean);
}

export function matchesCondition(
  value: GridFilterValue,
  condition: FilterCondition,
  kind: FilterKind | undefined,
): boolean {
  const blank = filterValueBlank(value);
  const cells = scalarFilterValues(value);
  const any = (test: (cell: string) => boolean) => cells.some(test);
  const none = (test: (cell: string) => boolean) => cells.every((cell) => !test(cell));

  switch (condition.op) {
    case "blank":
      return blank;
    case "nonblank":
      return !blank;
    case "eq":
      return !blank && any((cell) => equals(cell, condition.value, kind));
    case "neq":
      // Blank is not equal to a concrete operand — "≠ Cancelled" keeps empty cells.
      if (blank) return true;
      return none((cell) => equals(cell, condition.value, kind));
    case "contains":
      return !blank && any((cell) => includesInsensitive(cell, condition.value));
    case "not_contains":
      if (blank) return true;
      return none((cell) => includesInsensitive(cell, condition.value));
    case "starts_with":
      return !blank && any((cell) => startsInsensitive(cell, condition.value));
    case "ends_with":
      return !blank && any((cell) => endsInsensitive(cell, condition.value));
    case "lt":
    case "lte":
    case "gt":
    case "gte": {
      const op = condition.op;
      return any((cell) => compare(cell, condition.value, op, kind));
    }
    default:
      return true;
  }
}

function equals(cell: string, operand: string, kind: FilterKind | undefined): boolean {
  if (kind === "tags") return cell === operand;
  if (kind === "number") {
    const left = parseFilterNumber(cell);
    const right = parseNumberOperand(operand);
    return left !== null && right !== null && left === right;
  }
  // Case-fold so a typed "ns" matches "NS" on enum columns; accents still distinguish.
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
 * thing in the filter and another in the sort. Dates compare as ISO day strings; numbers
 * parse the formatted cell (`$1,200.00`, `(12.34)`) back to a magnitude so Amount > 100
 * means the dollars, not the string. Everything else is locale string order.
 */
function compare(
  cell: string,
  operand: string,
  op: "lt" | "lte" | "gt" | "gte",
  kind: FilterKind | undefined,
): boolean {
  if (cell === "") return false;

  if (kind === "number") {
    const left = parseFilterNumber(cell);
    const right = parseNumberOperand(operand);
    if (left === null || right === null) return false;
    return applyCompare(left, right, op);
  }

  // Other kinds still fail closed on a blank operand — there is no origin value the way
  // 0 is for numbers, and a date/priority placeholder is not a legal key.
  if (operand === "") return false;

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

/**
 * Read a filter operand or formatted cell into a comparable magnitude.
 *
 * Accepts a plain number, a thousands-grouped display (`1,200.00`), a leading `$`, a
 * leading `+`, and accounting negatives `(12.34)`. Returns null for blank or unparseable
 * input so a comparison against "abc" fails closed rather than ranking a NaN.
 */
export function parseFilterNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  const parenthesised = /^\((.*)\)$/.exec(trimmed);
  const body = parenthesised ? parenthesised[1] : trimmed;
  const cleaned = body.replace(/[$,\s]/g, "");
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(cleaned)) return null;

  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return parenthesised ? -Math.abs(value) : value;
}

/**
 * Operand side of a number comparison. A blank is 0 — the number line's origin, and the
 * value the criteria dialog's "0.00" placeholder advertised. Treating it as unparseable
 * made Amount > (empty) match nothing while the chip read `[Amount] > ''`.
 *
 * Blank *cells* still fail in `compare`; this is only the typed threshold.
 */
function parseNumberOperand(raw: string): number | null {
  if (raw.trim() === "") return 0;
  return parseFilterNumber(raw);
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
  valueLabel?: (value: string) => string,
): string {
  if (filter.conditions.length === 0) return "";

  const parts = filter.conditions.map((condition) => {
    const meta = OPERATOR_META[condition.op];
    if (!operatorNeedsOperand(condition.op)) {
      return `[${columnLabel}] ${meta.symbol}`;
    }
    const value = valueLabel ? valueLabel(condition.value) : condition.value;
    // Present the labelled form so a blank number operand can read as 0 rather than ''.
    const shown = value === "" ? "''" : `'${value}'`;
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
        value: asFilterOperand(row.value),
      });
    }
    return { mode: "custom", join, conditions };
  }

  return null;
}
