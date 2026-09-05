"use client";

import type { ColumnDef } from "@/components/grid/columns";
import type { FindResult } from "@/lib/find/types";

export type FindColumnCtx = Record<string, never>;

export const FIND_COLUMN_IDS = ["type", "name", "where", "field", "match"] as const;

/** The Field column joins every field that matched, since a record appears only once. */
function hitLabels(row: FindResult): string {
  return row.hits.map((hit) => hit.label).join(", ");
}

function Text({ value, muted = true }: { value: string; muted?: boolean }) {
  return (
    <span
      className={`truncate text-[0.8125rem] ${muted ? "text-ink-muted" : "text-ink"}`}
      title={value || undefined}
    >
      {value}
    </span>
  );
}

export type FindColumn = ColumnDef<FindColumnCtx, FindResult>;

/**
 * Results are read-only: every column is somebody else's record, edited where it lives.
 *
 * `filterValue` and `sortValue` are supplied throughout so the grid's own quick search,
 * column funnels and sort work on the result set — narrowing a Find by Type or by module is
 * exactly the second question people ask, and `data-grid.md` gets it for free.
 */
export const findColumns: FindColumn[] = [
  {
    id: "type",
    label: "Type",
    width: "10rem",
    hideable: false,
    filterKind: "text",
    filterValue: (row) => row.node.typeLabel,
    sortValue: (row) => row.node.typeLabel.toLowerCase(),
    compact: "meta",
    render: (row) => <Text value={row.node.typeLabel} />,
  },
  {
    id: "name",
    label: "Name",
    width: "19rem",
    hideable: false,
    filterKind: "text",
    filterValue: (row) => row.node.name,
    sortValue: (row) => row.node.name.toLowerCase(),
    compact: "primary",
    render: (row) => (
      <span
        className="truncate text-[0.8125rem] font-medium text-ink"
        title={row.node.name}
      >
        {row.node.name}
      </span>
    ),
  },
  {
    id: "where",
    label: "Where",
    width: "17rem",
    filterKind: "text",
    filterValue: (row) => row.node.where || null,
    sortValue: (row) => row.node.where.toLowerCase(),
    compact: "meta",
    render: (row) => <Text value={row.node.where} />,
  },
  {
    id: "field",
    label: "Field",
    width: "12rem",
    filterKind: "text",
    filterValue: (row) => hitLabels(row.node) || null,
    sortValue: (row) => hitLabels(row.node).toLowerCase(),
    render: (row) => <Text value={hitLabels(row.node)} />,
  },
  {
    id: "match",
    label: "Match",
    width: "22rem",
    filterKind: "text",
    filterValue: (row) => row.node.hits[0]?.snippet ?? null,
    sortValue: (row) => (row.node.hits[0]?.snippet ?? "").toLowerCase(),
    compact: "meta",
    render: (row) => <Text value={row.node.hits[0]?.snippet ?? ""} />,
  },
];
