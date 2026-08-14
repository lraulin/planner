/**
 * Turn the rows a grid is showing into a download of the current view.
 *
 * Achieve's File ▸ Export to Excel… dumped the current grid view. We do the same as CSV
 * (Excel opens it), plus JSON and YAML so a hierarchical grid can keep its tree. Visible
 * columns, on-screen order, no group headers. The grid, not the host, owns this so every
 * DataGrid gets File ▸ Export without N copies of the same commands.
 */

import { escapeCsvField } from "@/lib/csv/text";
import type { Command } from "@/lib/commands/registry";
import { parseDepthForest, type ForestNode } from "./forest";

export const GRID_EXPORT_FORMATS = ["csv", "json", "yaml"] as const;
export type GridExportFormat = (typeof GRID_EXPORT_FORMATS)[number];

export const GRID_EXPORT_CSV_ID = "grid.export-csv";
export const GRID_EXPORT_JSON_ID = "grid.export-json";
export const GRID_EXPORT_YAML_ID = "grid.export-yaml";

const FORMAT_LABEL: Record<GridExportFormat, string> = {
  csv: "CSV",
  json: "JSON",
  yaml: "YAML",
};

const FORMAT_MIME: Record<GridExportFormat, string> = {
  csv: "text/csv;charset=utf-8",
  json: "application/json;charset=utf-8",
  yaml: "application/yaml;charset=utf-8",
};

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
 * downloads a fillable template. Trailing newline matches `itemsToCsv`. Flat — CSV
 * cannot nest, so depth is ignored.
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

/**
 * One exported row. Column headers are the keys; `children` holds descendants when the
 * grid is showing a tree. Omitted when empty so a flat catalog is a flat document.
 */
export type ExportRecord = {
  [key: string]: string | ExportRecord[];
};

export type DepthExportRow = { depth: number };

function recordFromNode<TRow>(
  node: ForestNode<TRow>,
  columns: readonly ExportColumn<TRow>[],
): ExportRecord {
  const record: ExportRecord = {};
  for (const column of columns) {
    record[column.header] = column.value(node.row);
  }
  if (node.children.length > 0) {
    record.children = node.children.map((child) => recordFromNode(child, columns));
  }
  return record;
}

/** Visible cells as nested records, using the same depth forest sort uses. */
export function tableToRecords<TRow extends DepthExportRow>(
  columns: readonly ExportColumn<TRow>[],
  rows: readonly TRow[],
): ExportRecord[] {
  return parseDepthForest(rows).map((node) => recordFromNode(node, columns));
}

export function tableToJson<TRow extends DepthExportRow>(
  columns: readonly ExportColumn<TRow>[],
  rows: readonly TRow[],
): string {
  if (columns.length === 0) return "[]\n";
  return `${JSON.stringify(tableToRecords(columns, rows), null, 2)}\n`;
}

/**
 * YAML for this record shape only — string fields plus an optional `children` array.
 * A library would be a dependency for a document whose values are already strings.
 */
export function tableToYaml<TRow extends DepthExportRow>(
  columns: readonly ExportColumn<TRow>[],
  rows: readonly TRow[],
): string {
  if (columns.length === 0) return "[]\n";
  const records = tableToRecords(columns, rows);
  if (records.length === 0) return "[]\n";
  return records.map((record) => yamlRecord(record, 0)).join("");
}

/**
 * Quote when a bare scalar would be a different YAML value (bool, null, number) or
 * would break the document (colon, hash, leading space, newline).
 */
export function yamlScalar(value: string): string {
  if (value === "") return '""';
  if (
    /^(?:true|false|null|yes|no|on|off|y|n)$/i.test(value) ||
    /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) ||
    /[\n\r:#{}[\],&*!|>'"%@`\\]/.test(value) ||
    /^[\s-]/.test(value) ||
    /\s$/.test(value) ||
    value.includes(": ")
  ) {
    return JSON.stringify(value);
  }
  return value;
}

function yamlRecord(record: ExportRecord, indent: number): string {
  const keys = Object.keys(record);
  let out = "";
  keys.forEach((key, index) => {
    const value = record[key];
    const prefix =
      index === 0 ? `${" ".repeat(indent)}- ` : `${" ".repeat(indent + 2)}`;
    if (Array.isArray(value)) {
      if (value.length === 0) return;
      out += `${prefix}${yamlScalar(key)}:\n`;
      // Nested list items sit two spaces under this key (indent + 4 from the `-`).
      out += value.map((child) => yamlRecord(child, indent + 4)).join("");
      return;
    }
    out += `${prefix}${yamlScalar(key)}: ${yamlScalar(value)}\n`;
  });
  return out;
}

export function exportFilename(label: string, format: GridExportFormat): string {
  const slug = label
    .trim()
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return `${slug || "grid"}.${format}`;
}

/** @deprecated Use {@link exportFilename} — kept so existing CSV call sites stay obvious. */
export function csvFilename(label: string): string {
  return exportFilename(label, "csv");
}

export function exportMimeType(format: GridExportFormat): string {
  return FORMAT_MIME[format];
}

export function serializeGridExport<TRow extends DepthExportRow>(
  format: GridExportFormat,
  columns: readonly ExportColumn<TRow>[],
  rows: readonly TRow[],
): string {
  if (format === "csv") return tableToCsv(columns, rows);
  if (format === "json") return tableToJson(columns, rows);
  return tableToYaml(columns, rows);
}

/**
 * File ▸ Export ▸ CSV / JSON / YAML. Menu only — occasional, not a toolbar verb, and
 * not a row action. `navigation.md`: a command without a menu is not shipped; the
 * unavailable-or-duplicated toolbar tests in `data-grid.md` keep this off the icon row.
 */
export function gridExportCommands(run: (format: GridExportFormat) => void): Command[] {
  return GRID_EXPORT_FORMATS.map((format) => ({
    id: `grid.export-${format}`,
    label: FORMAT_LABEL[format],
    group: "view",
    menu: "file",
    section: "Export",
    icon: "export",
    keywords: `export download spreadsheet save ${format} excel`,
    title:
      format === "csv"
        ? "Download the rows and columns currently on screen"
        : `Download the current view as ${FORMAT_LABEL[format]}, keeping parent/child nesting`,
    run: () => run(format),
  }));
}
