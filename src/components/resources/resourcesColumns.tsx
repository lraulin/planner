"use client";

import type { ColumnDef } from "@/components/grid/columns";
import { formatEffort } from "@/lib/tree/format";
import type { ResourceListRow } from "@/lib/resources/types";
import { PlainTextCell, plainTextField } from "@/components/grid/PlainTextCell";
import { updatedColumn } from "@/components/grid/updatedColumn";

export type ResourcesColumnCtx = Record<string, never>;

export const RESOURCES_COLUMN_IDS = [
  "name",
  "contact",
  "working",
  "overhead",
  "effectiveness",
  "capacity",
  "description",
  "updated",
] as const;

function effort(value: number): string {
  return formatEffort(value) || "0";
}

/** Resources are read-only in the grid; their structured capacity belongs in the drawer. */
export const resourcesColumns: ColumnDef<ResourcesColumnCtx, ResourceListRow>[] = [
  {
    id: "name",
    label: "Resource",
    width: "17rem",
    hideable: false,
    filterKind: "text",
    filterValue: (row) => row.node.shortName || null,
    sortValue: (row) => row.node.shortName.toLowerCase(),
    compact: "primary",
    render: (row) => (
      <span className="truncate text-[0.8125rem] font-medium text-ink">
        {row.node.shortName}
      </span>
    ),
  },
  {
    id: "contact",
    label: "Contact",
    width: "14rem",
    filterKind: "text",
    filterValue: (row) => row.node.contactName,
    sortValue: (row) => row.node.contactName?.toLowerCase() ?? null,
    compact: "meta",
    render: (row) => <PlainTextCell value={row.node.contactName ?? ""} />,
  },
  {
    id: "working",
    label: "Working week",
    width: "7rem",
    align: "right",
    filterValue: (row) =>
      row.node.weeklyWorkingMinutes > 0 ? effort(row.node.weeklyWorkingMinutes) : null,
    sortValue: (row) => row.node.weeklyWorkingMinutes,
    compact: "meta",
    render: (row) => (
      <span className="tabular text-[0.8125rem] text-ink-muted">
        {row.node.weeklyWorkingMinutes > 0 ? effort(row.node.weeklyWorkingMinutes) : ""}
      </span>
    ),
  },
  {
    id: "overhead",
    label: "Overhead",
    width: "5.5rem",
    align: "right",
    filterValue: (row) => `${row.node.overheadPercent}%`,
    sortValue: (row) => row.node.overheadPercent,
    render: (row) => (
      <span className="tabular text-[0.8125rem] text-ink-muted">
        {row.node.overheadPercent}%
      </span>
    ),
  },
  {
    id: "effectiveness",
    label: "Effective",
    width: "5.75rem",
    align: "right",
    filterValue: (row) => `${row.node.effectivenessPercent}%`,
    sortValue: (row) => row.node.effectivenessPercent,
    render: (row) => (
      <span className="tabular text-[0.8125rem] text-ink-muted">
        {row.node.effectivenessPercent}%
      </span>
    ),
  },
  {
    id: "capacity",
    label: "Available",
    width: "6.5rem",
    align: "right",
    filterValue: (row) =>
      row.node.weeklyAvailableMinutes > 0
        ? effort(row.node.weeklyAvailableMinutes)
        : null,
    sortValue: (row) => row.node.weeklyAvailableMinutes,
    compact: "hidden",
    render: (row) => (
      <span className="tabular text-[0.8125rem] font-medium text-ink">
        {row.node.weeklyAvailableMinutes > 0
          ? effort(row.node.weeklyAvailableMinutes)
          : ""}
      </span>
    ),
  },
  {
    id: "description",
    label: "Description",
    width: "19rem",
    compact: "hidden",
    ...plainTextField((node) => node.description),
  },
  updatedColumn("hidden"),
];
