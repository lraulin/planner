import { sortEntriesByDate } from "./derive";
import { formatMetricNumber } from "./parse";
import type { MetricEntryView } from "./types";

type EntryRow = Pick<
  MetricEntryView,
  "id" | "entryDate" | "entryType" | "target" | "value"
>;

/** Escape one CSV field (RFC-style: quote when needed). */
function field(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
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
