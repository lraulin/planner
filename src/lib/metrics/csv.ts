import { formatMetricNumber } from "./parse";
import type { MetricEntryView } from "./types";

/** Escape one CSV field (RFC-style: quote when needed). */
function field(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/**
 * CSV export of tracking rows — columns match Achieve's form export shape
 * (Date, Type, Target, Value).
 */
export function entriesToCsv(
  entries: ReadonlyArray<
    Pick<MetricEntryView, "entryDate" | "entryType" | "target" | "value">
  >,
): string {
  const header = "Date,Type,Target,Value";
  const lines = [...entries]
    .sort((a, b) => b.entryDate.localeCompare(a.entryDate))
    .map((e) =>
      [
        field(e.entryDate),
        field(displayEntryType(e.entryType)),
        field(
          e.target === null || e.target === undefined
            ? ""
            : formatMetricNumber(e.target),
        ),
        field(formatMetricNumber(e.value)),
      ].join(","),
    );
  return [header, ...lines].join("\n") + (lines.length ? "\n" : "");
}

/** Human label for stored entry type codes. */
export function displayEntryType(code: string): string {
  if (code === "new_total" || code === "New Total") return "New Total";
  return code;
}
