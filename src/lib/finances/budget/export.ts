/**
 * The Budget page as one document.
 *
 * The page is three `DataGrid`s plus a headline, an income strip, and two forecast panels,
 * and each grid used to publish its own `File ▸ Export` — four ways to export a third of a
 * page whose whole point is that its parts sum to one figure
 * (`agent-os/specs/2026-08-28-0759-budget-single-export/` D1). So the page exports one
 * document instead, and everything on it — a `dl` of terms, a chip list, a grid, an HTML
 * table — flattens into the same shape: a title, a caption, column headers, and rows that
 * carry a depth.
 *
 * That shape is a table, so the four serializers reuse the grid's own primitives rather than
 * growing a second quoting or nesting implementation: `tableToCsv`, `tableToMarkdown`, and
 * `tableToRecords` (which nests through `parseDepthForest`, the same helper sort uses).
 */

import { formatUsd } from "@/lib/finances/money";
import type { ForwardBucket } from "@/lib/finances/commitments";
import type { SpendingVsIncome } from "@/lib/finances/expectedSpending";
import { escapeCsvField } from "@/lib/csv/text";
import {
  exportableColumns,
  formatExportStamp,
  tableToCsv,
  tableToMarkdown,
  tableToRecords,
  yamlMapping,
  yamlScalar,
  yamlSequenceItem,
  type DepthExportRow,
  type ExportColumn,
  type ExportColumnSource,
  type ExportRecord,
  type GridExportFormat,
} from "@/lib/grid/exportCsv";
import { monthLabel, readyToAssignNote, type BudgetMonth } from "./envelope";
import type { BudgetRow, BudgetTotals } from "./rows";

/** A header cell. `align` is Markdown's only use for it; the other three ignore it. */
export type BudgetExportColumn = { label: string; align?: "right" };

/** One row of one section. `depth` is what nests forecast items under their month. */
export type BudgetExportRow = { depth: number; cells: readonly string[] };

export type BudgetExportSection = {
  title: string;
  caption?: string;
  columns: readonly BudgetExportColumn[];
  rows: readonly BudgetExportRow[];
};

export type BudgetExportDocument = {
  /** "Budget — September 2026". Also the download's filename. */
  title: string;
  headline: { label: string; value: string; note?: string };
  sections: readonly BudgetExportSection[];
};

export type BudgetExportInput = {
  month: BudgetMonth;
  /** The live on-budget pool, when the month on screen is the current one. */
  accountPoolCents?: number;
  income: readonly BudgetRow[];
  receivedCents: number;
  expectedIncomeCents: number;
  /** Bills + regular spending — the one combined figure the page footers. */
  spendingTotals: BudgetTotals;
  /** Regular spending, Bills, Savings, already flattened by {@link gridExportSection}. */
  tables: readonly BudgetExportSection[];
  forecast: {
    months: readonly ForwardBucket[];
    comparison: SpendingVsIncome;
  };
  /** The user's date setting, from `useDateFormatter` — not a second date format. */
  formatDate: (dateKey: string) => string;
};

/** The `Assigned · Spent · Left` line each table section carries under its title. */
export function totalsCaption(totals: BudgetTotals): string {
  return [
    `Assigned ${formatUsd(totals.assignedCents)}`,
    `Spent ${formatUsd(totals.activityCents)}`,
    `Left ${formatUsd(totals.balanceCents)}`,
  ].join(" · ");
}

/**
 * Flatten one `DataGrid`'s visible columns and on-screen node rows into a section.
 *
 * Cell text comes from `exportCellText` and the column set from `exportableColumns`, so a
 * table section says exactly what that grid's own export said: hiding Assigned on Bills
 * still drops it, and a column the grid cannot turn into text is still dropped.
 */
export function gridExportSection<TRow extends DepthExportRow>(
  title: string,
  caption: string,
  columns: readonly (ExportColumnSource<TRow> & { align?: string })[],
  rows: readonly TRow[],
): BudgetExportSection {
  const alignById = new Map(columns.map((column) => [column.id, column.align]));
  const visible = exportableColumns(columns);
  return {
    title,
    caption,
    columns: visible.map((column) => ({
      label: column.header,
      ...(alignById.get(column.id) === "right" ? { align: "right" as const } : {}),
    })),
    rows: rows.map((row) => ({
      depth: row.depth,
      cells: visible.map((column) => column.value(row)),
    })),
  };
}

const MONEY: BudgetExportColumn["align"] = "right";

export function budgetExportDocument(input: BudgetExportInput): BudgetExportDocument {
  const { month, forecast } = input;
  const ready = month.readyToAssignCents;
  return {
    title: `Budget — ${monthLabel(month.month)}`,
    headline: {
      label: "Ready to Assign",
      value: formatUsd(ready),
      note: readyToAssignNote(ready),
    },
    sections: [
      summarySection(input),
      incomeSection(input),
      ...input.tables,
      comparisonSection(forecast.comparison),
      forwardSection(forecast.months, input.formatDate),
    ],
  };
}

/**
 * Ready to Assign's terms, then the combined Spending figures.
 *
 * The terms come from `month.terms` rather than being reassembled here for the reason they
 * exist at all: a breakdown built twice is a breakdown that can stop adding up to its own
 * headline. Spending rides here rather than on a table caption so the combined total —
 * the figure that has to be believed — appears exactly once, as it does on screen
 * (`agent-os/specs/2026-08-26-2159-grid-aggregation-placement/` D4).
 */
function summarySection(input: BudgetExportInput): BudgetExportSection {
  const { month, spendingTotals, accountPoolCents } = input;
  const rows: BudgetExportRow[] = [
    ...month.terms.map((term) => row(term.label, formatUsd(term.cents))),
    row("Ready to Assign", formatUsd(month.readyToAssignCents)),
    row("Spending assigned", formatUsd(spendingTotals.assignedCents)),
    row("Spending spent", formatUsd(spendingTotals.activityCents)),
    row("Spending left", formatUsd(spendingTotals.balanceCents)),
  ];
  return {
    title: "Summary",
    ...(accountPoolCents === undefined
      ? {}
      : { caption: accountPoolCaption(month, accountPoolCents) }),
    columns: [{ label: "Term" }, { label: "Amount", align: MONEY }],
    rows,
  };
}

/** Only on the current month: a historical month has no live pool to reconcile against. */
function accountPoolCaption(month: BudgetMonth, poolCents: number): string {
  const extra = [
    month.assignedInFutureMonthsCents !== 0 ? " + assigned in future months" : "",
    month.bufferedCents !== 0 ? " + held" : "",
  ].join("");
  return `Account pool ${formatUsd(poolCents)} = Ready to Assign + envelope balances${extra}`;
}

/**
 * Income is what is being budgeted, not something budgeted, so it exports Activity alone —
 * no Assigned and no Available (`agent-os/specs/2026-08-23-2313-one-budget/` D7).
 */
function incomeSection(input: BudgetExportInput): BudgetExportSection {
  return {
    title: "Income",
    caption: `Received ${formatUsd(input.receivedCents)} · Expected ${formatUsd(
      input.expectedIncomeCents,
    )}/mo`,
    columns: [{ label: "Envelope" }, { label: "Activity", align: MONEY }],
    rows: input.income.map((envelope) =>
      row(envelope.name, formatUsd(envelope.activityCents)),
    ),
  };
}

function comparisonSection(comparison: SpendingVsIncome): BudgetExportSection {
  const leftover = comparison.remainder.monthlyCents;
  return {
    title: "Expected vs income",
    caption:
      "What active bills cost, against typical monthly income. Amount on a bill is left out — a yearly $72 and a monthly $72 are not the same number.",
    columns: [
      { label: "Line" },
      { label: "Monthly", align: MONEY },
      { label: "A year", align: MONEY },
    ],
    rows: [
      row(
        "Bills",
        formatUsd(comparison.bills.monthlyCents),
        formatUsd(comparison.bills.annualCents),
      ),
      row(
        "Expected income",
        formatUsd(comparison.income.monthlyCents),
        formatUsd(comparison.income.annualCents),
      ),
      row(
        leftover >= 0 ? "Left after bills" : "Overcommitted",
        formatUsd(comparison.remainder.monthlyCents),
        formatUsd(comparison.remainder.annualCents),
      ),
    ],
  };
}

/**
 * A bucket per month at depth 0 with its bills at depth 1 — the shape the panel draws, and
 * the depth JSON and YAML nest on. CSV and Markdown flatten it, as they flatten every tree.
 */
function forwardSection(
  months: readonly ForwardBucket[],
  formatDate: (dateKey: string) => string,
): BudgetExportSection {
  const rows: BudgetExportRow[] = [];
  for (const bucket of months) {
    rows.push({
      depth: 0,
      cells: [
        formatDate(bucket.startKey),
        "",
        formatUsd(bucket.totalCents),
        "",
        bucket.aboveMedian ? "yes" : "",
      ],
    });
    for (const item of bucket.items) {
      rows.push({
        depth: 1,
        cells: [
          "",
          item.name,
          formatUsd(item.cents),
          item.dateKey ? formatDate(item.dateKey) : "",
          "",
        ],
      });
    }
  }
  return {
    title: "Next 12 months",
    caption:
      "Dated bills land on a day. Unscheduled bills are a monthly rate with no date. Months above the median are marked.",
    columns: [
      { label: "Month" },
      { label: "Item" },
      { label: "Amount", align: MONEY },
      { label: "Date" },
      { label: "Above median" },
    ],
    rows,
  };
}

function row(...cells: string[]): BudgetExportRow {
  return { depth: 0, cells };
}

// ─────────────────────────────── Serializing ───────────────────────────────

/** The section's headers as the grid exporter's own column shape, so its tables apply. */
function sectionColumns(section: BudgetExportSection): ExportColumn<BudgetExportRow>[] {
  return section.columns.map((column, index) => ({
    id: `${index}`,
    header: column.label,
    value: (row: BudgetExportRow) => row.cells[index] ?? "",
    ...(column.align ? { align: column.align } : {}),
  }));
}

export function serializeBudgetExport(
  format: GridExportFormat,
  doc: BudgetExportDocument,
  exportedAt: Date,
): string {
  if (format === "csv") return budgetToCsv(doc, exportedAt);
  if (format === "markdown") return budgetToMarkdown(doc, exportedAt);
  if (format === "json") {
    return `${JSON.stringify(budgetToObject(doc, exportedAt), null, 2)}\n`;
  }
  return budgetToYaml(doc, exportedAt);
}

/**
 * Stacked sections rather than one table with a leading `Section` column: a single table
 * would put Ready to Assign and a forecast bucket into columns named `Assigned` and
 * `Available`, where they mean nothing. Stacked, it reads as a report in Excel — which is
 * what Achieve's `File ▸ Export to Excel…` was for.
 */
function budgetToCsv(doc: BudgetExportDocument, exportedAt: Date): string {
  const lines: string[] = [
    escapeCsvField(doc.title),
    escapeCsvField(`Exported ${formatExportStamp(exportedAt).iso}`),
    [doc.headline.label, doc.headline.value, doc.headline.note ?? ""]
      .map(escapeCsvField)
      .join(","),
    "",
  ];
  for (const section of doc.sections) {
    lines.push(escapeCsvField(section.title));
    if (section.caption) lines.push(escapeCsvField(section.caption));
    // `tableToCsv` ends with exactly one newline; drop the empty tail it splits into.
    lines.push(
      ...tableToCsv(sectionColumns(section), section.rows).split("\n").slice(0, -1),
    );
    lines.push("");
  }
  return lines.join("\n");
}

function budgetToMarkdown(doc: BudgetExportDocument, exportedAt: Date): string {
  const blocks: string[] = [
    `# ${doc.title}`,
    `Exported ${formatExportStamp(exportedAt).iso}`,
    `**${doc.headline.label} ${doc.headline.value}**${
      doc.headline.note ? ` — ${doc.headline.note}` : ""
    }`,
  ];
  for (const section of doc.sections) {
    blocks.push(`## ${section.title}`);
    if (section.caption) blocks.push(`_${section.caption}_`);
    blocks.push(
      tableToMarkdown(
        sectionColumns(section),
        section.rows,
        (row) => row.depth,
      ).trimEnd(),
    );
  }
  return `${blocks.join("\n\n")}\n`;
}

type BudgetExportObject = {
  exportedAt: string;
  title: string;
  headline: BudgetExportDocument["headline"];
  sections: { title: string; caption?: string; rows: ExportRecord[] }[];
};

/**
 * One keyed object, not the row array a single grid exports: a whole-page document has a
 * headline that is not a row of any table, so the top level cannot be a list. `exportedAt`
 * is added to this object — wrapping it would be a second envelope.
 */
function budgetToObject(
  doc: BudgetExportDocument,
  exportedAt: Date,
): BudgetExportObject {
  return {
    exportedAt: formatExportStamp(exportedAt).iso,
    title: doc.title,
    headline: doc.headline,
    sections: doc.sections.map((section) => ({
      title: section.title,
      ...(section.caption ? { caption: section.caption } : {}),
      rows: tableToRecords(sectionColumns(section), section.rows),
    })),
  };
}

function budgetToYaml(doc: BudgetExportDocument, exportedAt: Date): string {
  const object = budgetToObject(doc, exportedAt);
  let out = `exportedAt: ${yamlScalar(object.exportedAt)}\ntitle: ${yamlScalar(object.title)}\nheadline:\n`;
  out += yamlMapping(object.headline, 2);
  out += "sections:\n";
  for (const section of object.sections) {
    out += yamlSequenceItem(section, 2);
  }
  return out;
}
