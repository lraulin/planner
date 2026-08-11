import { escapeCsvField, parseCsvRows, splitCsvLine } from "@/lib/csv/text";
import { sortEntriesByDate } from "./derive";
import { formatMetricNumber, isDateKey, parseMetricInput } from "./parse";
import type { MetricEntryInput, MetricEntryView } from "./types";

export { splitCsvLine };

type EntryRow = Pick<
  MetricEntryView,
  "id" | "entryDate" | "entryType" | "target" | "value"
>;

/** One successfully parsed tracking row from a CSV import. */
export type ParsedMetricEntry = MetricEntryInput;

export type ParseCsvEntriesResult = {
  entries: ParsedMetricEntry[];
  /** 1-based data row numbers (header is row 1) that could not be parsed. */
  errors: { row: number; message: string }[];
};

/** Escape one CSV field (RFC-style: quote when needed). */
function field(value: string): string {
  return escapeCsvField(value);
}

/** Normalize export labels / codes to the stored entry type. */
export function parseEntryType(raw: string | undefined): string {
  const t = (raw ?? "").trim();
  if (!t || t === "New Total" || t === "new_total") return "new_total";
  return t;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "");
}

/**
 * Parse a tracking CSV produced by {@link entriesToCsv} (or a compatible sheet).
 * Header must include Date and Value; Type and Target are optional.
 * Blank value cells are skipped (not errors). Invalid dates/numbers are errors.
 *
 * Uses the whole-document CSV walker so a quoted cell with a newline (what
 * {@link escapeCsvField} writes) does not split into two broken rows.
 */
export function parseEntriesCsv(text: string): ParseCsvEntriesResult {
  const rows = parseCsvRows(text);

  if (rows.length === 0) {
    return { entries: [], errors: [{ row: 1, message: "File is empty." }] };
  }

  const headerCells = rows[0].map(normalizeHeader);
  const dateIdx = headerCells.findIndex((h) => h === "date");
  const valueIdx = headerCells.findIndex((h) => h === "value");
  const typeIdx = headerCells.findIndex((h) => h === "type");
  const targetIdx = headerCells.findIndex((h) => h === "target");

  if (dateIdx < 0 || valueIdx < 0) {
    return {
      entries: [],
      errors: [
        {
          row: 1,
          message: 'Header must include "Date" and "Value" columns.',
        },
      ],
    };
  }

  const entries: ParsedMetricEntry[] = [];
  const errors: { row: number; message: string }[] = [];

  for (let i = 1; i < rows.length; i++) {
    // 1-based data row numbers count the header as row 1 (same as a spreadsheet).
    const rowNum = i + 1;
    const cells = rows[i];
    const dateRaw = (cells[dateIdx] ?? "").trim();
    const valueRaw = (cells[valueIdx] ?? "").trim();
    const typeRaw = typeIdx >= 0 ? cells[typeIdx] : undefined;
    const targetRaw = targetIdx >= 0 ? (cells[targetIdx] ?? "").trim() : "";

    if (!dateRaw && !valueRaw) continue;

    if (!isDateKey(dateRaw)) {
      errors.push({
        row: rowNum,
        message: `Date must be YYYY-MM-DD (got "${dateRaw || "(empty)"}").`,
      });
      continue;
    }

    if (valueRaw === "") {
      // Empty value: skip quietly (common when editing a sheet).
      continue;
    }

    const valueParsed = parseMetricInput(valueRaw.replace(/\s*lb\s*$/i, ""));
    if (!valueParsed.ok || valueParsed.value === null) {
      errors.push({
        row: rowNum,
        message: `Invalid value "${valueRaw}".`,
      });
      continue;
    }

    let target: number | null = null;
    if (targetRaw !== "") {
      const t = parseMetricInput(targetRaw);
      if (!t.ok) {
        errors.push({
          row: rowNum,
          message: `Invalid target "${targetRaw}".`,
        });
        continue;
      }
      target = t.value;
    }

    entries.push({
      entryDate: dateRaw,
      entryType: parseEntryType(typeRaw),
      target,
      value: valueParsed.value,
    });
  }

  return { entries, errors };
}

function entryCells(
  e: Pick<MetricEntryView, "entryDate" | "entryType" | "target" | "value">,
  includeTarget: boolean,
): string[] {
  const cells = [e.entryDate, displayEntryType(e.entryType)];
  if (includeTarget) {
    cells.push(
      e.target === null || e.target === undefined ? "" : formatMetricNumber(e.target),
    );
  }
  cells.push(formatMetricNumber(e.value));
  return cells;
}

/**
 * CSV export of tracking rows — columns match Achieve's form export shape
 * (Date, Type, Target, Value). Always newest-first.
 */
export function entriesToCsv(
  entries: ReadonlyArray<
    Pick<MetricEntryView, "entryDate" | "entryType" | "target" | "value"> & {
      id?: string;
    }
  >,
): string {
  const header = "Date,Type,Target,Value";
  const withIds = entries.map((e, i) => ({
    id: e.id ?? `row-${i}`,
    entryDate: e.entryDate,
    entryType: e.entryType,
    target: e.target,
    value: e.value,
  }));
  const lines = sortEntriesByDate(withIds, "desc").map((e) =>
    entryCells(e, true).map(field).join(","),
  );
  return [header, ...lines].join("\n") + (lines.length ? "\n" : "");
}

/**
 * Tab-separated rows for clipboard paste into a sheet.
 * Preserves the caller's order (usually the on-screen sort). Header included
 * so a multi-row paste is self-describing.
 */
export function entriesToClipboardTsv(
  entries: ReadonlyArray<
    Pick<MetricEntryView, "entryDate" | "entryType" | "target" | "value">
  >,
  options: { includeTarget: boolean } = { includeTarget: true },
): string {
  if (entries.length === 0) return "";
  const header = options.includeTarget
    ? "Date\tType\tTarget\tValue"
    : "Date\tType\tValue";
  const lines = entries.map((e) => entryCells(e, options.includeTarget).join("\t"));
  return [header, ...lines].join("\n");
}

/**
 * Selected entries in display order (ids that are missing are skipped).
 */
export function pickEntriesInOrder(
  entries: ReadonlyArray<EntryRow>,
  selectedIds: ReadonlySet<string>,
): EntryRow[] {
  if (selectedIds.size === 0) return [];
  return entries.filter((e) => selectedIds.has(e.id));
}

/** Human label for stored entry type codes. */
export function displayEntryType(code: string): string {
  if (code === "new_total" || code === "New Total") return "New Total";
  return code;
}
