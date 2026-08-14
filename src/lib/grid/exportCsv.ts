/**
 * Turn the rows a grid is showing into a CSV of the current view.
 *
 * Achieve's File ▸ Export to Excel… dumped the current grid view. We do the same as CSV
 * (Excel opens it). Visible columns, on-screen order, no group headers. The grid, not the
 * host, owns this so every DataGrid gets File ▸ Export as CSV without N copies of the same
 * command.
 */

import { escapeCsvField } from "@/lib/csv/text";
import type { Command } from "@/lib/commands/registry";

export const GRID_EXPORT_CSV_ID = "grid.export-csv";

/** The slice of a column definition the exporter reads. */
export type ExportColumnSource<TRow> = {
  id: string;
  label: string;
  compactText?: (row: TRow) => string | null;
  filterValue?: (row: TRow) => string | null;
  filterLabel?: (value: string) => string;
};

export type ExportColumn<TRow> = {
  id: string;
  header: string;
  value: (row: TRow) => string;
};

/**
 * One cell as a person would read it: compact text when the column has a nicer phrasing,
 * otherwise the filter value run through `filterLabel` so a State cell says "Not started"
 * rather than `NS`.
 */
export function exportCellText<TRow>(
  column: Pick<ExportColumnSource<TRow>, "compactText" | "filterValue" | "filterLabel">,
  row: TRow,
): string {
  if (column.compactText) return column.compactText(row) ?? "";
  const raw = column.filterValue?.(row);
  if (raw == null || raw === "") return "";
  return column.filterLabel?.(raw) ?? raw;
}

/** Drop columns the grid cannot turn into text (no compact or filter accessor). */
export function exportableColumns<TRow>(
  columns: readonly ExportColumnSource<TRow>[],
): ExportColumn<TRow>[] {
  return columns
    .filter(
      (column) => column.compactText !== undefined || column.filterValue !== undefined,
    )
    .map((column) => ({
      id: column.id,
      header: column.label,
      value: (row) => exportCellText(column, row),
    }));
}

/**
 * Header plus one line per row. Always includes the header so an empty grid still
 * downloads a fillable template. Trailing newline matches `itemsToCsv`.
 */
export function tableToCsv<TRow>(
  columns: readonly ExportColumn<TRow>[],
  rows: readonly TRow[],
): string {
  if (columns.length === 0) return "";
  const header = columns.map((column) => escapeCsvField(column.header)).join(",");
  const lines = rows.map((row) =>
    columns.map((column) => escapeCsvField(column.value(row))).join(","),
  );
  return [header, ...lines].join("\n") + "\n";
}

export function csvFilename(label: string): string {
  const slug = label
    .trim()
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return `${slug || "grid"}.csv`;
}

/**
 * File ▸ Export as CSV. Menu only — occasional, not a toolbar verb, and not a row action.
 * `navigation.md`: a command without a menu is not shipped; unavailable-or-duplicated
 * toolbar tests in `data-grid.md` keep this off the icon row.
 */
export function gridExportCsvCommand(run: () => void): Command {
  return {
    id: GRID_EXPORT_CSV_ID,
    label: "Export as CSV",
    group: "view",
    menu: "file",
    section: "Export",
    icon: "export",
    keywords: "excel download spreadsheet save csv",
    title: "Download the rows and columns currently on screen",
    run,
  };
}
