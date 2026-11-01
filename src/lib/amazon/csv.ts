import { parseCsvRowsWithLines } from "@/lib/csv/text";
import { parseCalendarDayText } from "@/lib/calendarDayText";
import { parseAmountCents } from "@/lib/finances/money";
import { toDateKey } from "@/lib/schedule/geometry";

const EMPTY = new Set(["", "not available", "not applicable"]);

/** Treat Amazon's placeholder strings as blank. */
export function amazonBlank(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  if (EMPTY.has(value.toLowerCase())) return "";
  return value;
}

export function amazonAmountCents(raw: string | undefined): number | null {
  const value = amazonBlank(raw);
  if (!value) return null;
  return parseAmountCents(value);
}

/**
 * Amazon instants (`2018-12-27T11:10:19Z`) become a calendar day via UTC components.
 * Never `startOfDay` and never `new Date("YYYY-MM-DD")`.
 */
export function amazonDateKey(raw: string | undefined): string {
  const value = amazonBlank(raw);
  if (!value) return "";
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return "";
  return toDateKey(instant);
}

/**
 * A calendar day as Amazon printed it — `YYYY-MM-DD`, an ISO instant, `August 27, 2026`,
 * or `8/27/2026`. Bare `YYYY-MM-DD` is accepted as written; it never goes through
 * `new Date("YYYY-MM-DD")` (`development/dates.md`).
 */
export function amazonCalendarDay(raw: string | undefined): string {
  const value = amazonBlank(raw);
  if (!value) return "";
  const day = parseCalendarDayText(value);
  if (day) return day;

  if (/^\d{4}-\d{2}-\d{2}T/.test(value) || /Z$/i.test(value)) {
    return amazonDateKey(value);
  }
  return "";
}

/** Last four from `Visa - 9910` or `Gift Certificate/Card and Visa - 4903`. */
export function paymentLast4(raw: string | undefined): string | null {
  const value = amazonBlank(raw);
  if (!value) return null;
  const match = /(\d{4})\s*$/.exec(value);
  return match ? match[1] : null;
}

export function amazonQuantity(raw: string | undefined): number {
  const value = amazonBlank(raw);
  if (!value) return 1;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return parsed;
}

export type CsvTable = {
  headers: string[];
  /** 1-based spreadsheet row number, header = 1. */
  rows: { row: number; cells: Record<string, string> }[];
};

export function csvTable(text: string): CsvTable {
  const grid = parseCsvRowsWithLines(text);
  if (grid.length === 0) return { headers: [], rows: [] };
  const headers = grid[0].cells.map((cell) => cell.trim());
  const rows = [];
  for (let i = 1; i < grid.length; i++) {
    const { cells: line, line: lineNumber } = grid[i];
    const cells: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      cells[headers[c]] = line[c] ?? "";
    }
    rows.push({ row: lineNumber, cells });
  }
  return { headers, rows };
}

export function requireHeaders(
  table: CsvTable,
  needed: readonly string[],
  fileLabel: string,
): string | null {
  const present = new Set(table.headers);
  const missing = needed.filter((name) => !present.has(name));
  if (missing.length === 0) return null;
  return `${fileLabel} is missing columns: ${missing.join(", ")}.`;
}
