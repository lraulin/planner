import { parseCsvRows } from "@/lib/csv/text";
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

const MONTHS: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

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
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return isRealDate(value.slice(0, 4), value.slice(5, 7), value.slice(8, 10))
      ? value
      : "";
  }

  const weekday = /^[A-Za-z]{3,9},?\s+([A-Za-z]{3,9})\s+(\d{1,2}),\s+(\d{4})$/.exec(
    value,
  );
  if (weekday) return fromMonthDayYear(weekday[1], weekday[2], weekday[3]);

  const monthDay = /^([A-Za-z]{3,9})\s+(\d{1,2}),\s+(\d{4})$/.exec(value);
  if (monthDay) return fromMonthDayYear(monthDay[1], monthDay[2], monthDay[3]);

  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (slash) {
    const month = slash[1].padStart(2, "0");
    const day = slash[2].padStart(2, "0");
    return isRealDate(slash[3], month, day) ? `${slash[3]}-${month}-${day}` : "";
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(value) || /Z$/i.test(value)) {
    return amazonDateKey(value);
  }
  return "";
}

function fromMonthDayYear(monthRaw: string, dayRaw: string, yearRaw: string): string {
  const month = MONTHS[monthRaw.toLowerCase()];
  if (!month) return "";
  const day = String(Number(dayRaw)).padStart(2, "0");
  return isRealDate(yearRaw, month, day) ? `${yearRaw}-${month}-${day}` : "";
}

function isRealDate(yearRaw: string, monthRaw: string, dayRaw: string): boolean {
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day, 12));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
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
  const grid = parseCsvRows(text);
  if (grid.length === 0) return { headers: [], rows: [] };
  const headers = grid[0].map((cell) => cell.trim());
  const rows = [];
  for (let i = 1; i < grid.length; i++) {
    const line = grid[i];
    const cells: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      cells[headers[c]] = line[c] ?? "";
    }
    rows.push({ row: i + 1, cells });
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
