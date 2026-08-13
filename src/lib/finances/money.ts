/**
 * Money for the finance register, held as **integer cents**.
 *
 * The database stores `numeric(14,2)` — exact, and the convention the cost columns already
 * use — but Drizzle hands `numeric` back as a string, and the moment those become JS floats
 * a column of them stops summing to the right answer. So the rule is: parse to cents at the
 * edge, do every comparison and total in cents, and format back to a decimal string only
 * when writing or displaying. Totals over many rows are better still computed in SQL.
 */

/** Cents in one dollar. Named so the arithmetic below reads as unit conversion. */
const CENTS_PER_DOLLAR = 100;

/**
 * Read a money cell from a bank CSV into signed cents.
 *
 * Accepts what these exports actually contain plus what a person might paste: thousands
 * separators, a currency symbol, a leading `+`, and `(1.23)` for a negative. Returns `null`
 * for blank or unparseable input so the caller can tell "the column was empty" (normal —
 * Capital One leaves one of Debit/Credit blank on every row) from "this row is broken".
 */
export function parseAmountCents(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  // Accounting negatives: (1.23) means -1.23.
  const parenthesised = /^\((.*)\)$/.exec(trimmed);
  const body = parenthesised ? parenthesised[1] : trimmed;

  const cleaned = body.replace(/[$,\s]/g, "");
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(cleaned)) return null;

  const negative = parenthesised !== null || cleaned.startsWith("-");
  const digits = cleaned.replace(/^[+-]/, "");
  const [whole, fraction = ""] = digits.split(".");

  // Round rather than truncate: a third-decimal in a source file should not vanish
  // downward, and `Math.round` on a two-digit-padded string is exact.
  const wholeCents = Number(whole || "0") * CENTS_PER_DOLLAR;
  const fractionCents = Math.round(Number(`0.${fraction || "0"}`) * CENTS_PER_DOLLAR);
  const magnitude = wholeCents + fractionCents;
  if (!Number.isFinite(magnitude)) return null;

  return negative ? -magnitude : magnitude;
}

/** Cents to the decimal string a `numeric(14,2)` column takes. */
export function centsToNumericString(cents: number): string {
  const negative = cents < 0;
  const magnitude = Math.abs(Math.round(cents));
  const whole = Math.floor(magnitude / CENTS_PER_DOLLAR);
  const fraction = magnitude % CENTS_PER_DOLLAR;
  return `${negative ? "-" : ""}${whole}.${String(fraction).padStart(2, "0")}`;
}

/** Read a `numeric` column (Drizzle gives these back as strings) into cents. */
export function numericStringToCents(value: string | null): number | null {
  if (value === null) return null;
  return parseAmountCents(value);
}

/**
 * Display a ledger amount: `-$10.59`, `$481.20`, `$0.00`.
 *
 * Deliberately not `formatMoney` from `src/lib/tree/format.ts`. That one serves the cost
 * estimate fields, which are never negative, and it renders a negative as `$-10.59` — the
 * sign in the wrong place. A register is half negative numbers, so it needs the sign outside
 * the symbol.
 */
export function formatUsd(cents: number | null): string {
  if (cents === null || !Number.isFinite(cents)) return "";
  const negative = cents < 0;
  const dollars = Math.abs(cents) / CENTS_PER_DOLLAR;
  return `${negative ? "-" : ""}$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Money at chart scale: `$2.1k`, `-$450`, `$0`.
 *
 * Cents on an axis label are noise — nobody reads a y-axis to the penny, and eight
 * characters per tick is what makes axis labels collide. Whole dollars up to a thousand,
 * one decimal of thousands above it.
 */
export function formatUsdCompact(cents: number | null): string {
  if (cents === null || !Number.isFinite(cents)) return "";
  const negative = cents < 0;
  const dollars = Math.abs(cents) / CENTS_PER_DOLLAR;
  const body =
    dollars >= 1000
      ? `${(dollars / 1000).toFixed(dollars >= 10_000 ? 0 : 1)}k`
      : String(Math.round(dollars));
  return `${negative ? "-" : ""}$${body}`;
}

/** Total a column of cents. Integer addition, so no float drift over thousands of rows. */
export function sumCents(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
