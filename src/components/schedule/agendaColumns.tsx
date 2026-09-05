"use client";

import { DateText } from "@/components/date/DateText";
import type { ColumnDef } from "@/components/grid/columns";
import type { AgendaRow } from "@/lib/schedule/agenda";
import { checkStateLabel, checkStateMark } from "@/lib/schedule/checkState";
import { daysBetweenKeys } from "@/lib/schedule/geometry";
import type { OutlineNode } from "@/lib/tree/types";

export type AgendaColumnCtx = {
  /**
   * Wall-clock today, or null on the server and before hydration. Days left is arithmetic
   * against the reader's clock, so it renders blank rather than guessing — see `useToday`.
   */
  todayKey: string | null;
  onCycleCheck: (row: AgendaRow) => void;
};

export const AGENDA_COLUMN_IDS = [
  "check",
  "date",
  "time",
  "subject",
  "project",
  "daysLeft",
] as const;

function timeLabel(date: Date): string {
  return date
    .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    .replace(":00", "");
}

/**
 * Days from today to the row's day: 0 today, negative behind you.
 *
 * String arithmetic on two calendar-day labels (`daysBetweenKeys`), not a subtraction of
 * instants — an hour of daylight saving inside the span would otherwise round a boundary the
 * wrong way, and this column is read as a countdown.
 */
export function daysLeftOf(row: AgendaRow, todayKey: string | null): number | null {
  return todayKey ? daysBetweenKeys(todayKey, row.dayKey) : null;
}

/** "today" / "tomorrow" / "in 3 days" / "2 days ago" — the number's meaning, on hover. */
function daysLeftTitle(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return days > 0 ? `In ${days} days` : `${Math.abs(days)} days ago`;
}

export const agendaColumns: ColumnDef<AgendaColumnCtx, AgendaRow>[] = [
  {
    id: "check",
    label: "",
    fieldLabel: "Status",
    width: "2.25rem",
    align: "center",
    filterKind: "enum",
    filterValue: (row) => checkStateLabel(row.node.checkState),
    sortValue: (row) => row.node.checkState,
    render: (row, ctx) => (
      <button
        type="button"
        // The same open → done → missed cycle the calendar's checkbox runs, because it is
        // the same appointment; an agenda you can only read would be a worse calendar.
        title={`Status: ${checkStateLabel(row.node.checkState)}. Click to cycle.`}
        aria-label={`Status: ${checkStateLabel(row.node.checkState)}. Click to cycle.`}
        className="min-h-tap flex w-full items-center justify-center"
        onClick={(event) => {
          event.stopPropagation();
          ctx.onCycleCheck(row.node);
        }}
      >
        {/*
          The box is drawn here rather than left to the mark, because `open` has no mark —
          on the calendar an empty checkbox is still a bordered square, and without one this
          cell would be a clickable nothing.
        */}
        <span className="flex h-4 w-4 items-center justify-center rounded-[0.1875rem] border border-rule text-[0.6875rem] leading-none text-ink-muted">
          {checkStateMark(row.node.checkState)}
        </span>
      </button>
    ),
  },
  {
    id: "date",
    label: "Date",
    width: "7rem",
    filterKind: "date",
    filterValue: (row) => row.node.dayKey,
    sortValue: (row) => row.node.dayKey,
    render: (row) => (
      <DateText
        dateKey={row.node.dayKey}
        className="tabular text-[0.8125rem] text-ink-muted"
      />
    ),
  },
  {
    id: "time",
    label: "Time",
    width: "8rem",
    filterKind: "text",
    filterValue: (row) => (row.node.allDay ? "All day" : timeLabel(row.node.startAt)),
    // Sorted on the instant, not the printed label: "9:00 AM" sorts before "10:00 AM" as
    // text, which is exactly the wrong order.
    sortValue: (row) => row.node.startAt.getTime(),
    render: (row) => (
      <span className="tabular truncate text-[0.8125rem] text-ink-muted">
        {row.node.allDay
          ? "All day"
          : `${timeLabel(row.node.startAt)} – ${timeLabel(row.node.endAt)}`}
      </span>
    ),
  },
  {
    id: "subject",
    label: "Subject",
    width: "18rem",
    hideable: false,
    filterKind: "text",
    filterValue: (row) => row.node.subject || null,
    sortValue: (row) => row.node.subject.toLowerCase(),
    render: (row) => (
      <span className="truncate text-[0.8125rem] text-ink">
        {row.node.subject || "(no subject)"}
        {row.node.isRecurring && (
          <span className="ml-1.5 text-ink-faint" title="Part of a repeating series">
            ↻
          </span>
        )}
      </span>
    ),
  },
  {
    id: "project",
    label: "Project",
    width: "10rem",
    filterKind: "enum",
    filterValue: (row) => row.node.projectName || null,
    sortValue: (row) => row.node.projectName.toLowerCase(),
    render: (row) => (
      <span className="truncate text-[0.8125rem] text-ink-muted">
        {row.node.projectName}
      </span>
    ),
  },
  {
    id: "daysLeft",
    label: "Days left",
    width: "5.5rem",
    align: "right",
    sortValue: (row) => row.node.dayKey,
    render: (row, ctx) => {
      const days = daysLeftOf(row.node, ctx.todayKey);
      if (days === null) return null;
      return (
        <span
          title={daysLeftTitle(days)}
          className={`tabular block text-right text-[0.8125rem] ${
            days < 0 ? "text-ink-faint" : days === 0 ? "text-ink" : "text-ink-muted"
          }`}
        >
          {days}
        </span>
      );
    },
  },
];

/** Project id → name, for the column that only needs the label. */
export function projectNamesFrom(nodes: readonly OutlineNode[]): Map<string, string> {
  return new Map(
    nodes
      .filter((node) => node.type === "project")
      .map((node) => [node.id, node.name || "Untitled"]),
  );
}
