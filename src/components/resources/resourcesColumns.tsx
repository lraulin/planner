"use client";

import type { ColumnDef } from "@/components/grid/columns";
import { DateText } from "@/components/date/DateText";
import { localDateKey } from "@/lib/schedule/geometry";
import { formatEffort } from "@/lib/tree/format";
import type { ResourceListRow } from "@/lib/resources/types";

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

function effort(value: number): string {
  return formatEffort(value) || "0";
}

/** Resources are read-only in the grid; their structured capacity belongs in the drawer. */
export const resourcesColumns: ColumnDef<ResourcesColumnCtx, ResourceListRow>[] = [
  {
    id: "name",
    label: "Resource",
    width: "minmax(11rem,1fr)",
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
    width: "minmax(9rem,0.8fr)",
    filterKind: "text",
    filterValue: (row) => row.node.contactName,
    sortValue: (row) => row.node.contactName?.toLowerCase() ?? null,
    compact: "meta",
    render: (row) => <Text value={row.node.contactName ?? ""} />,
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
    width: "minmax(12rem,1.2fr)",
    filterKind: "text",
    filterValue: (row) => row.node.description || null,
    sortValue: (row) => row.node.description.toLowerCase(),
    compact: "hidden",
    render: (row) => <Text value={row.node.description} />,
  },
  {
    id: "updated",
    label: "Updated",
    width: "7rem",
    filterKind: "date",
    filterValue: (row) => localDateKey(row.node.updatedAt),
    sortValue: (row) => row.node.updatedAt.getTime(),
    compact: "hidden",
    render: (row) => (
      <DateText
        dateKey={localDateKey(row.node.updatedAt)}
        className="tabular text-[0.8125rem] text-ink-muted"
      />
    ),
  },
];
