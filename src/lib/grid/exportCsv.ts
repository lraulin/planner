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

export const GRID_EXPORT_FORMATS = ["csv", "json", "yaml", "markdown"] as const;
export type GridExportFormat = (typeof GRID_EXPORT_FORMATS)[number];

export const FORMAT_LABEL: Record<GridExportFormat, string> = {
  csv: "CSV",
  json: "JSON",
  yaml: "YAML",
  markdown: "Markdown",
};

export type GridExportDestination = "file" | "clipboard";

export function copyClipboardLabel(format: GridExportFormat): string {
  return `Copy ${FORMAT_LABEL[format]} to Clipboard`;
}

export function gridExportFormatOf(id: string): GridExportFormat | null {
  for (const format of GRID_EXPORT_FORMATS) {
    if (id === `grid.export-${format}` || id === `grid.copy-${format}`) return format;
  }
  return null;
}

const FORMAT_MIME: Record<GridExportFormat, string> = {
  csv: "text/csv;charset=utf-8",
  json: "application/json;charset=utf-8",
  yaml: "application/yaml;charset=utf-8",
  markdown: "text/markdown;charset=utf-8",
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
  /** Markdown only, and only where the host knows the column is money. */
  align?: "right";
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
 * A GitHub-flavoured pipe table: header, alignment rule, one line per row. Flat like CSV —
 * a Markdown table has no nesting either — and header-only when empty for the same reason.
 *
 * `indent` draws depth into the first cell for hosts that want the tree visible (the Budget
 * document uses it for forecast items); grids pass nothing and stay flat.
 */
export function tableToMarkdown<TRow>(
  columns: readonly ExportColumn<TRow>[],
  rows: readonly TRow[],
  indent?: (row: TRow) => number,
): string {
  if (columns.length === 0) return "";
  const header = `| ${columns.map((column) => markdownCell(column.header)).join(" | ")} |`;
  const rule = `| ${columns
    .map((column) => (column.align === "right" ? "---:" : "---"))
    .join(" | ")} |`;
  const lines = rows.map((row) => {
    const cells = columns.map((column, index) => {
      const text = markdownCell(column.value(row));
      const depth = index === 0 ? (indent?.(row) ?? 0) : 0;
      return depth > 0 ? `${"\u00a0".repeat(depth * 4)}${text}` : text;
    });
    return `| ${cells.join(" | ")} |`;
  });
  return [header, rule, ...lines].join("\n") + "\n";
}

/**
 * A pipe ends the cell and a newline ends the row, so both have to go. Escaping the pipe
 * (`\\|`) is the GFM spelling; a newline has no in-cell spelling at all, so it becomes a
 * space rather than a `<br>` this document would then have to be HTML to render.
 */
function markdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
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
 * The same instant, two spellings: filenames cannot have colons, document bodies can.
 *
 * Local wall clock plus the zone offset — not a UTC calendar date. Export time is an
 * instant (`dates.md`); `toISOString().slice(0, 10)` is the trap that puts a US evening
 * on tomorrow's date.
 */
export type ExportStamp = {
  filename: string;
  iso: string;
};

function twoDigits(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatExportStamp(at: Date): ExportStamp {
  const year = at.getFullYear();
  const month = twoDigits(at.getMonth() + 1);
  const day = twoDigits(at.getDate());
  const hour = twoDigits(at.getHours());
  const minute = twoDigits(at.getMinutes());
  const second = twoDigits(at.getSeconds());
  // `getTimezoneOffset` is minutes *west* of UTC. Flip the sign so Eastern daylight
  // (UTC−4, offset 240) writes `-0400`, not `+0400`.
  const offsetMinutes = -at.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const offsetHour = twoDigits(Math.floor(absolute / 60));
  const offsetMinute = twoDigits(absolute % 60);
  return {
    filename: `${year}-${month}-${day}T${hour}${minute}${second}${sign}${offsetHour}${offsetMinute}`,
    iso: `${year}-${month}-${day}T${hour}:${minute}:${second}${sign}${offsetHour}:${offsetMinute}`,
  };
}

/**
 * Title line, `Exported {iso}` line, blank line — then the unstamped table. JSON/YAML wrap
 * the payload as `{ exportedAt, title, rows }` so an empty grid is an envelope, not `[]`.
 *
 * `payload` is whatever `tableTo*` (or a document serializer) already wrote. This layer
 * does not re-quote cells.
 */
export function stampExportBody(
  format: GridExportFormat,
  options: { title: string; exportedAt: Date; payload: string },
): string {
  const { iso } = formatExportStamp(options.exportedAt);
  if (format === "csv") {
    const exported = escapeCsvField(`Exported ${iso}`);
    return `${escapeCsvField(options.title)}\n${exported}\n\n${options.payload}`;
  }
  if (format === "markdown") {
    return `# ${options.title}\nExported ${iso}\n\n${options.payload}`;
  }
  if (format === "json") {
    const rows = JSON.parse(options.payload) as unknown;
    return `${JSON.stringify(
      { exportedAt: iso, title: options.title, rows },
      null,
      2,
    )}\n`;
  }
  const trimmed = options.payload.replace(/\n+$/, "");
  const rowsBlock =
    trimmed === "" || trimmed === "[]"
      ? "rows: []\n"
      : `rows:\n${trimmed
          .split("\n")
          .map((line) => (line === "" ? "" : `  ${line}`))
          .join("\n")}\n`;
  return `exportedAt: ${yamlScalar(iso)}\ntitle: ${yamlScalar(options.title)}\n${rowsBlock}`;
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

export type YamlValue = string | YamlValue[] | { [key: string]: YamlValue };

/**
 * YAML for string maps, string lists, and nested maps — the document shape Budget and
 * Activity evidence share. `tableToYaml` stays the grid-record writer; this is the other
 * half of "no second YAML implementation".
 */
export function yamlMapping(map: Record<string, YamlValue>, indent: number): string {
  const pad = " ".repeat(indent);
  let out = "";
  for (const [key, value] of Object.entries(map)) {
    if (value === undefined) continue;
    if (typeof value === "string") {
      out += `${pad}${yamlScalar(key)}: ${yamlScalar(value)}\n`;
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      out += `${pad}${yamlScalar(key)}:\n`;
      for (const item of value) {
        out +=
          typeof item === "string"
            ? `${pad}  - ${yamlScalar(item)}\n`
            : yamlSequenceItem(item as Record<string, YamlValue>, indent + 2);
      }
      continue;
    }
    out += `${pad}${yamlScalar(key)}:\n${yamlMapping(value, indent + 2)}`;
  }
  return out;
}

/** A mapping as a list item: the first key rides the dash, the rest line up under it. */
export function yamlSequenceItem(
  map: Record<string, YamlValue>,
  indent: number,
): string {
  const body = yamlMapping(map, indent + 2);
  if (body === "") return `${" ".repeat(indent)}- {}\n`;
  return `${" ".repeat(indent)}- ${body.slice(indent + 2)}`;
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

/** Extensions, where the format name is not one. Markdown files are `.md`, not `.markdown`. */
export const FORMAT_EXTENSION: Record<GridExportFormat, string> = {
  csv: "csv",
  json: "json",
  yaml: "yaml",
  markdown: "md",
};

export function exportFilename(label: string, extension: string, at: Date): string {
  const slug = label
    .trim()
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return `${slug || "grid"}_${formatExportStamp(at).filename}.${extension}`;
}

/** @deprecated Use {@link exportFilename} — kept so existing CSV call sites stay obvious. */
export function csvFilename(label: string, at: Date): string {
  return exportFilename(label, "csv", at);
}

export function exportMimeType(format: GridExportFormat): string {
  return FORMAT_MIME[format];
}

export function serializeGridExport<TRow extends DepthExportRow>(
  format: GridExportFormat,
  columns: readonly ExportColumn<TRow>[],
  rows: readonly TRow[],
  meta: { title: string; exportedAt: Date },
): string {
  const payload =
    format === "csv"
      ? tableToCsv(columns, rows)
      : format === "json"
        ? tableToJson(columns, rows)
        : format === "markdown"
          ? tableToMarkdown(columns, rows)
          : tableToYaml(columns, rows);
  return stampExportBody(format, {
    title: meta.title,
    exportedAt: meta.exportedAt,
    payload,
  });
}

/**
 * File ▸ Export ▸ CSV / JSON / YAML. Menu only — occasional, not a toolbar verb, and
 * not a row action. `navigation.md`: a command without a menu is not shipped; the
 * unavailable-or-duplicated toolbar tests in `data-grid.md` keep this off the icon row.
 *
 * `alternate` is the Option-held copy. Pulldown menus swap to it; the Commands panel
 * keeps the download label. `gridCopyCommands` is the always-visible twin.
 */
const EXPORT_TITLE: Record<GridExportFormat, string> = {
  csv: "Download the rows and columns currently on screen",
  json: "Download the current view as JSON, keeping parent/child nesting",
  yaml: "Download the current view as YAML, keeping parent/child nesting",
  markdown: "Download the current view as a Markdown table",
};

export function gridExportCommands(
  run: (format: GridExportFormat, destination?: GridExportDestination) => void,
): Command[] {
  return GRID_EXPORT_FORMATS.map((format) => ({
    id: `grid.export-${format}`,
    label: FORMAT_LABEL[format],
    group: "view",
    menu: "file",
    section: "Export",
    icon: "export",
    keywords: `export download spreadsheet save ${format} excel`,
    title: EXPORT_TITLE[format],
    alternate: {
      label: copyClipboardLabel(format),
      title: `Copy the current view as ${FORMAT_LABEL[format]} to the clipboard`,
      run: () => run(format, "clipboard"),
    },
    run: () => run(format, "file"),
  }));
}

/**
 * File ▸ Copy to Clipboard ▸ CSV / JSON / YAML. The discoverable path for the same
 * write Export's Option-swap performs — Commands panel, ⌘K, phone ⋯, and anyone who
 * does not hold Option.
 */
export function gridCopyCommands(run: (format: GridExportFormat) => void): Command[] {
  return GRID_EXPORT_FORMATS.map((format) => ({
    id: `grid.copy-${format}`,
    label: copyClipboardLabel(format),
    group: "view",
    menu: "file",
    section: "Copy to Clipboard",
    icon: "copy",
    keywords: `copy clipboard ${format} export`,
    title: `Copy the current view as ${FORMAT_LABEL[format]} to the clipboard`,
    run: () => run(format),
  }));
}
