"use client";

import type { ColumnDef } from "@/components/grid/columns";
import { DateText } from "@/components/date/DateText";
import { DateKeyCell, TextCell } from "@/components/grid/cells";
import { daysSince, elapsedParts, formatElapsed } from "@/lib/timeline/elapsed";
import type { ChronologyRow, ChronologySource } from "@/lib/timeline/types";

export type TimelineColumnCtx = {
  /** The browser's today, or null before hydration. Both computed columns need it. */
  todayKey: string | null;
  /** Only `event` rows are editable here; job and residence rows live on their own pages. */
  onEditEvent: (
    eventId: string,
    patch: { title?: string; category?: string; notes?: string },
  ) => void;
  onEditEventDate: (eventId: string, dateKey: string) => void;
};

export const TIMELINE_COLUMN_IDS = [
  "date",
  "title",
  "category",
  "daysAgo",
  "elapsed",
  "source",
  "notes",
] as const;

const SOURCE_LABELS: Record<ChronologySource, string> = {
  event: "Event",
  job: "Job",
  residence: "Residence",
};

/** The record id behind an editable row, or null when the row is derived. */
function eventIdOf(row: ChronologyRow): string | null {
  return row.source === "event" ? row.id.slice("event:".length) : null;
}

function Text({ value }: { value: string }) {
  return (
    <span
      className="truncate text-[0.8125rem] text-ink-muted"
      title={value || undefined}
    >
      {value}
    </span>
  );
}

/**
 * The chronology grid.
 *
 * Life events edit in place — four fields do not justify a drawer. Job and residence rows
 * are derived and read-only here: editing them means editing the record they came from, and
 * the row menu's Open takes you there. See `lib/timeline/chronology.ts`.
 */
export const timelineColumns: ColumnDef<TimelineColumnCtx, ChronologyRow>[] = [
  {
    id: "date",
    label: "Date",
    width: "8rem",
    hideable: false,
    filterKind: "date",
    filterValue: (row) => row.node.dateKey,
    sortValue: (row) => row.node.dateKey,
    compact: "meta",
    render: (row, ctx) => {
      const eventId = eventIdOf(row.node);
      return eventId ? (
        <DateKeyCell
          value={row.node.dateKey}
          ariaLabel="Date"
          align="left"
          onChange={(value) => value && ctx.onEditEventDate(eventId, value)}
        />
      ) : (
        <DateText
          dateKey={row.node.dateKey}
          className="tabular text-[0.8125rem] text-ink-muted"
        />
      );
    },
  },
  {
    id: "title",
    label: "Event",
    width: "minmax(14rem,1.6fr)",
    hideable: false,
    filterKind: "text",
    filterValue: (row) => row.node.title || null,
    sortValue: (row) => row.node.title.toLowerCase(),
    compact: "primary",
    render: (row, ctx) => {
      const eventId = eventIdOf(row.node);
      return eventId ? (
        <TextCell
          value={row.node.title}
          ariaLabel="Event"
          onChange={(value) => ctx.onEditEvent(eventId, { title: value })}
        />
      ) : (
        <span className="truncate text-[0.8125rem] text-ink" title={row.node.title}>
          {row.node.title}
        </span>
      );
    },
  },
  {
    id: "category",
    label: "Category",
    width: "9rem",
    filterKind: "text",
    // Free text on events, a fixed "Work" / "Home" on derived rows. The set filter offers
    // whatever is actually in use, which is the whole reason no vocabulary is maintained.
    filterValue: (row) => row.node.category || null,
    sortValue: (row) => row.node.category.toLowerCase(),
    compact: "meta",
    render: (row, ctx) => {
      const eventId = eventIdOf(row.node);
      return eventId ? (
        <TextCell
          value={row.node.category}
          ariaLabel="Category"
          onChange={(value) => ctx.onEditEvent(eventId, { category: value })}
        />
      ) : (
        <Text value={row.node.category} />
      );
    },
  },
  {
    id: "daysAgo",
    label: "Days ago",
    width: "6rem",
    align: "right",
    // Sorted on the date, not on the count: with today fixed, days-ago is monotonic in the
    // date, so this needs no context. `agendaColumns` sorts its days-left column the same way.
    sortValue: (row) => row.node.dateKey,
    compact: "hidden",
    render: (row, ctx) => {
      if (!ctx.todayKey) return null;
      const days = daysSince(row.node.dateKey, ctx.todayKey);
      // A future date has no "days ago". Blank beats a negative number pretending to be one.
      return days < 0 ? null : (
        <span className="tabular text-[0.8125rem] text-ink-muted">{days}</span>
      );
    },
  },
  {
    id: "elapsed",
    label: "Elapsed",
    width: "8rem",
    align: "right",
    sortValue: (row) => row.node.dateKey,
    compact: "hidden",
    render: (row, ctx) => {
      if (!ctx.todayKey) return null;
      const parts = elapsedParts(row.node.dateKey, ctx.todayKey);
      return parts ? (
        <span className="tabular text-[0.8125rem] text-ink-muted">
          {formatElapsed(parts)}
        </span>
      ) : null;
    },
  },
  {
    id: "source",
    label: "Source",
    width: "6.5rem",
    filterKind: "text",
    filterValue: (row) => SOURCE_LABELS[row.node.source],
    sortValue: (row) => SOURCE_LABELS[row.node.source],
    compact: "hidden",
    render: (row) => <Text value={SOURCE_LABELS[row.node.source]} />,
  },
  {
    id: "notes",
    label: "Notes",
    width: "minmax(12rem,1.2fr)",
    filterKind: "text",
    filterValue: (row) => row.node.notes || null,
    sortValue: (row) => row.node.notes.toLowerCase(),
    compact: "hidden",
    render: (row, ctx) => {
      const eventId = eventIdOf(row.node);
      return eventId ? (
        <TextCell
          value={row.node.notes}
          ariaLabel="Notes"
          onChange={(value) => ctx.onEditEvent(eventId, { notes: value })}
        />
      ) : (
        <Text value={row.node.notes} />
      );
    },
  },
];
