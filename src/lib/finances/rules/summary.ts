/**
 * One line describing what a rule looks for, for a grid cell.
 *
 * Pure and tested, rather than assembled in the column definition, because it has to read
 * correctly for conditions the parser would reject — a grid still has to render a row someone
 * needs to go and fix. So this works off the raw stored blob and degrades to a legible
 * placeholder instead of throwing.
 *
 * Ids are resolved through a `names` map the query supplies. A raw UUID in this cell would be
 * unreadable, and looking it up here would mean a query per row.
 */

const FIELD_LABELS: Record<string, string> = {
  merchant: "merchant",
  description: "bank text",
  payee: "payee",
  account: "account",
  amount: "amount",
  date: "date",
};

const OP_LABELS: Record<string, string> = {
  is: "is",
  contains: "contains",
  startsWith: "starts with",
  oneOf: "is one of",
  matches: "matches",
  isapprox: "is about",
  isbetween: "is between",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
};

function money(cents: number): string {
  return `${cents < 0 ? "-" : ""}$${Math.abs(cents / 100).toFixed(2)}`;
}

function valueText(
  field: string,
  value: unknown,
  names: Readonly<Record<string, string>>,
): string {
  if (typeof value === "string") {
    return field === "payee" || field === "account" ? (names[value] ?? value) : value;
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) =>
        typeof entry === "string" && (field === "payee" || field === "account")
          ? (names[entry] ?? entry)
          : String(entry),
      )
      .join(", ");
  }
  if (typeof value === "number")
    return field === "amount" ? money(value) : String(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.source === "string") return `/${record.source}/`;
    if (typeof record.num1 === "number" && typeof record.num2 === "number") {
      return `${money(record.num1)} and ${money(record.num2)}`;
    }
    if (typeof record.date1 === "string" && typeof record.date2 === "string") {
      return `${record.date1} and ${record.date2}`;
    }
  }
  return "…";
}

/** `merchant matches /^COSTCO/ and amount < -$50.00` */
export function summarizeConditions(
  conditions: unknown,
  names: Readonly<Record<string, string>> = {},
): string {
  if (!Array.isArray(conditions) || conditions.length === 0) return "nothing";

  return conditions
    .map((condition) => {
      if (typeof condition !== "object" || condition === null) return "…";
      const record = condition as Record<string, unknown>;
      const field = typeof record.field === "string" ? record.field : "?";
      const op = typeof record.op === "string" ? record.op : "?";
      return `${FIELD_LABELS[field] ?? field} ${OP_LABELS[op] ?? op} ${valueText(field, record.value, names)}`;
    })
    .join(" and ");
}
