import { daysInMonth } from "@/lib/dateMath";
import { localDateKey as wallClockDay } from "@/lib/schedule/geometry";

/** Parse a DB `numeric` string (or number) into a finite number, else null. */
export function parseNumeric(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n =
    typeof raw === "number" ? raw : Number(String(raw).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse user-typed metric text (value / target fields).
 * Empty → `{ ok: true, value: null }` (caller decides if null is allowed).
 * Invalid → `{ ok: false }`. Accepts comma as decimal separator.
 * Trailing "." on blur is treated as the integer part ("1." → 1).
 */
export function parseMetricInput(
  raw: string,
): { ok: true; value: number | null } | { ok: false } {
  const trimmed = raw.trim().replace(",", ".");
  if (trimmed === "") return { ok: true, value: null };
  const normalized =
    trimmed.endsWith(".") && trimmed.length > 1 ? trimmed.slice(0, -1) : trimmed;
  if (normalized === "" || normalized === "-" || normalized === "+") {
    return { ok: false };
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) return { ok: false };
  return { ok: true, value: n };
}

/** Format a number for display without trailing junk (1.618, 80, 86.5). */
export function formatMetricNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  // Prefer shortest accurate representation for typical metric decimals.
  if (Number.isInteger(n)) return String(n);
  const fixed = n.toFixed(6).replace(/\.?0+$/, "");
  return fixed;
}

/** `YYYY-MM-DD` today in local calendar (for default entry date). */
export function localDateKey(d: Date = new Date()): string {
  return wallClockDay(d);
}

/**
 * True when `s` is `YYYY-MM-DD` **and names a day that exists**.
 *
 * The shape alone is not enough. This guards three untrusted inputs — the agent API's
 * `entryDate`, the tracking CSV import, and `createMetricEntry` — and all three write a
 * Postgres `date`, which rejects `2026-06-31` outright. Shape-only, that rejection arrived as
 * a swallowed driver error: `log_metric_entry` answered `{"code":"internal","message":
 * "Internal error"}`, and the CSV importer accepted the row and then failed the whole file.
 * Deciding it here means the caller is told which day it got wrong.
 */
export function isDateKey(s: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}
