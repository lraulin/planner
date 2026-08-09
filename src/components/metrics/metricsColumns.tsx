"use client";

import type { ColumnDef } from "@/components/grid/columns";
import { formatShortDate } from "@/lib/dateFormat";
import { metricPriorityText } from "@/lib/metrics/compactRow";
import { formatMetricNumber } from "@/lib/metrics/parse";
import { priorityOrderValue } from "@/lib/priority/order";
import type { MetricListRow } from "@/lib/metrics/types";

/**
 * Columns for the Metrics list.
 *
 * Same shape as `tabs/wishesColumns.tsx`: pure data plus `render`, with the host supplying
 * the callbacks through `ctx`. Metrics rows are read-only here — every edit happens in the
 * drawer — so the only callback is "open me", which the Title cell needs for its link.
 */
export type MetricsColumnCtx = {
  onOpen: (metricId: string) => void;
};

export const METRICS_COLUMN_IDS = [
  "active",
  "priority",
  "title",
  "category",
  "question",
  "target",
  "lastValue",
  "lastDate",
] as const;

export const metricsColumns: ColumnDef<MetricsColumnCtx, MetricListRow>[] = [
  {
    id: "active",
    label: "Active",
    width: "4rem",
    align: "center",
    // The phone card has three meta slots; spending one on a tick that is usually set wastes
    // the line. Without this the id order alone would make Active the first chip.
    compact: "hidden",
    filterKind: "enum",
    filterValue: (row) => (row.node.active ? "Active" : "Inactive"),
    sortValue: (row) => (row.node.active ? 0 : 1),
    render: (row) => (
      <span className="text-ink-muted">{row.node.active ? "✓" : ""}</span>
    ),
  },
  {
    id: "priority",
    // "Priority" does not fit a 4.5rem track and renders as "PRIORI…"; the Wish List has the
    // same column and the same abbreviation. Show Fields and the filter dropdown say the
    // full word via `fieldLabel`.
    label: "Pri",
    fieldLabel: "Priority",
    width: "4.5rem",
    align: "center",
    compact: "accent",
    filterKind: "priority",
    filterValue: (row) => metricPriorityText(row.node) || null,
    sortValue: (row) =>
      priorityOrderValue(row.node.priorityLetter, row.node.priorityRank),
    render: (row) => (
      <span className="tabular-nums text-ink-muted">
        {metricPriorityText(row.node)}
      </span>
    ),
  },
  {
    id: "title",
    label: "Title",
    width: "minmax(12rem,1.4fr)",
    hideable: false,
    compact: "primary",
    filterKind: "text",
    filterValue: (row) => row.node.title || null,
    sortValue: (row) => row.node.title.toLowerCase(),
    render: (row, ctx) => (
      <button
        type="button"
        className="truncate text-left font-medium text-ink hover:underline"
        onClick={(event) => {
          event.stopPropagation();
          ctx.onOpen(row.node.id);
        }}
      >
        {row.node.title || "Untitled"}
      </button>
    ),
  },
  {
    id: "category",
    label: "Category",
    width: "minmax(8rem,0.8fr)",
    filterKind: "enum",
    filterValue: (row) => row.node.category || null,
    sortValue: (row) => row.node.category.toLowerCase(),
    render: (row) => (
      <span className="truncate text-ink-muted">{row.node.category}</span>
    ),
  },
  {
    id: "question",
    label: "Question",
    width: "minmax(10rem,1fr)",
    // Prose, and often long — it reads badly as a chip and pushes out the reading itself.
    compact: "hidden",
    filterKind: "text",
    filterValue: (row) => row.node.question || null,
    sortValue: (row) => row.node.question.toLowerCase(),
    render: (row) => (
      <span className="truncate text-ink-muted">{row.node.question}</span>
    ),
  },
  {
    id: "target",
    label: "Target",
    width: "5.5rem",
    align: "right",
    // Dropped so the last reading and its date both fit: those are what a phone glance is for.
    compact: "hidden",
    filterKind: "text",
    // "None" rather than blank: it is what the cell has always shown, and a checklist of
    // blanks is not something you can pick from.
    filterValue: (row) =>
      row.node.objectiveTarget != null
        ? formatMetricNumber(row.node.objectiveTarget)
        : "None",
    sortValue: (row) => row.node.objectiveTarget,
    render: (row) => (
      <span className="tabular-nums">
        {row.node.objectiveTarget != null
          ? formatMetricNumber(row.node.objectiveTarget)
          : "None"}
      </span>
    ),
  },
  {
    id: "lastValue",
    label: "Last Value",
    width: "6rem",
    align: "right",
    filterKind: "text",
    filterValue: (row) =>
      row.node.lastValue != null ? formatMetricNumber(row.node.lastValue) : null,
    sortValue: (row) => row.node.lastValue,
    compactText: (row) =>
      row.node.lastValue != null ? formatMetricNumber(row.node.lastValue) : null,
    render: (row) => (
      <span className="tabular-nums">
        {row.node.lastValue != null ? formatMetricNumber(row.node.lastValue) : "—"}
      </span>
    ),
  },
  {
    id: "lastDate",
    label: "Last Date",
    width: "6.5rem",
    filterKind: "date",
    filterValue: (row) => row.node.lastDate,
    sortValue: (row) => row.node.lastDate,
    render: (row) => (
      <span className="tabular-nums text-ink-muted">
        {row.node.lastDate ? formatShortDate(row.node.lastDate) : "—"}
      </span>
    ),
  },
];
