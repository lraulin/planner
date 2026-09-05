"use client";

import { useState } from "react";
import type { ColumnDef } from "@/components/grid/columns";
import { DateText } from "@/components/date/DateText";
import { localDateKey } from "@/lib/schedule/geometry";
import type { TimeChartListRow } from "@/lib/schedule/queries";

/**
 * Callbacks the Time Charts columns close over. Same shape as the Wish List columns: the
 * defs stay pure data plus render, and the host swaps handlers freely.
 */
export type TimeChartsColumnCtx = {
  onNameChange: (row: TimeChartListRow, name: string) => void;
  onDescriptionChange: (row: TimeChartListRow, description: string) => void;
};

export const TIME_CHARTS_COLUMN_IDS = [
  "name",
  "description",
  "areas",
  "updated",
] as const;

export const timeChartsColumns: ColumnDef<TimeChartsColumnCtx, TimeChartListRow>[] = [
  {
    id: "name",
    label: "Name",
    width: "18rem",
    hideable: false,
    filterKind: "text",
    filterValue: (row) => row.node.name || null,
    sortValue: (row) => row.node.name.toLowerCase(),
    render: (row, ctx) => (
      <ChartTextCell
        key={`name:${row.node.name}`}
        value={row.node.name}
        ariaLabel="Name"
        placeholder="Untitled"
        onChange={(name) => ctx.onNameChange(row.node, name)}
      />
    ),
  },
  {
    id: "description",
    label: "Description",
    width: "20rem",
    filterKind: "text",
    filterValue: (row) => row.node.description || null,
    sortValue: (row) => row.node.description.toLowerCase(),
    render: (row, ctx) => (
      <ChartTextCell
        key={`desc:${row.node.description}`}
        value={row.node.description}
        ariaLabel="Description"
        onChange={(description) => ctx.onDescriptionChange(row.node, description)}
      />
    ),
  },
  {
    id: "areas",
    label: "Areas",
    width: "4.5rem",
    align: "right",
    sortValue: (row) => row.node.areaCount,
    // Blank at zero: a chart with no areas reads as unfinished, and "0" is noise on every
    // other row. Same rule the Contacts "Open" column follows.
    filterValue: (row) => (row.node.areaCount > 0 ? String(row.node.areaCount) : null),
    render: (row) => (
      <span className="tabular text-[0.8125rem] text-ink-muted">
        {row.node.areaCount > 0 ? row.node.areaCount : ""}
      </span>
    ),
  },
  {
    id: "updated",
    label: "Updated",
    width: "7rem",
    filterKind: "date",
    filterValue: (row) => localDateKey(row.node.updatedAt),
    sortValue: (row) => row.node.updatedAt.getTime(),
    render: (row) => (
      <DateText
        dateKey={localDateKey(row.node.updatedAt)}
        className="tabular text-[0.8125rem] text-ink-muted"
      />
    ),
  },
];

function ChartTextCell({
  value,
  ariaLabel,
  placeholder,
  onChange,
}: {
  value: string;
  ariaLabel: string;
  placeholder?: string;
  onChange: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  return (
    <input
      value={draft}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = draft.trim();
        if (next !== value) onChange(next);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          event.preventDefault();
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
      aria-label={ariaLabel}
      placeholder={placeholder}
      className="w-full truncate border-none bg-transparent text-[0.8125rem] text-ink outline-none placeholder:text-ink-faint/60"
    />
  );
}
