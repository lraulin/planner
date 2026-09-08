import {
  NOTE_GROUP_BY_VALUES,
  compareGroupText,
  knownGroupBy,
  type CalendarNoteGroupBy,
  type NoteGroupBy,
} from "@/lib/grid/grouping";
import { buildGroupRows, type GroupPart } from "@/lib/grid/groupRows";
import {
  DEFAULT_DATE_FORMAT,
  formatDateKey,
  type DateFormatId,
} from "@/lib/dateFormat";
import { toDateKey } from "@/lib/schedule/geometry";
import type { GridRow } from "@/lib/tree/slice";
import { FLAG_LABELS } from "./flags";
import type { NoteRowView } from "./slice";
import type { NoteNode, NoteSummary } from "./types";

type GroupableNote = NoteNode | NoteSummary;

export { NOTE_GROUP_BY_VALUES };
export type { CalendarNoteGroupBy, NoteGroupBy };

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const EMPTY_LABELS: Record<NoteGroupBy, string> = {
  subject: "(No Subject)",
  contexts: "(No Contexts)",
  flag: "(No Flag)",
  date: "(No Date)",
  year: "(No Year)",
  month: "(No Month)",
  day: "(No Day)",
  linked: "(Not Linked)",
};

export type NoteDatePart = {
  /** Stable value used by filters and group ids. */
  key: string;
  /** Human-readable cell and group label. */
  label: string;
  /** Numeric calendar order. */
  rank: number;
};

/**
 * One calendar component of a note's Date field.
 *
 * Note dates are stored calendar days, so the key must come from `toDateKey`'s UTC
 * components. Local getters would revive the Aug 1 → Jul 31 bug this app's noon encoding
 * exists to prevent.
 */
export function noteDatePart(
  date: Date | null,
  dimension: Exclude<CalendarNoteGroupBy, "date">,
): NoteDatePart | null {
  if (!date) return null;

  const [year, month, day] = toDateKey(date).split("-");
  switch (dimension) {
    case "year":
      return { key: year, label: year, rank: Number(year) };
    case "month":
      return {
        key: month,
        label: MONTH_LABELS[Number(month) - 1] ?? month,
        rank: Number(month),
      };
    case "day":
      return { key: day, label: String(Number(day)), rank: Number(day) };
  }
}

/** Labels a stored month/day filter value without changing its canonical padded key. */
export function noteDatePartLabel(
  value: string,
  dimension: Exclude<CalendarNoteGroupBy, "date">,
): string {
  if (dimension === "month") return MONTH_LABELS[Number(value) - 1] ?? value;
  if (dimension === "day") return String(Number(value));
  return value;
}

/** Display a stored calendar day from its UTC components, never a process-local day. */
export function formatNoteDate(
  date: Date | null,
  dateFormat: DateFormatId = DEFAULT_DATE_FORMAT,
): string {
  return date ? formatDateKey(toDateKey(date), dateFormat) : "";
}

/** Contexts form a set: normalize their display order before using the set as a bucket. */
export function noteContextsLabel(contexts: readonly string[]): string {
  return [...new Set(contexts.map((context) => context.trim()).filter(Boolean))]
    .sort(compareGroupText)
    .join(", ");
}

/** Keep only the dimensions Notes knows how to turn into headers. */
export function asNoteGroupBy(values: readonly string[]): NoteGroupBy[] {
  return knownGroupBy(values, NOTE_GROUP_BY_VALUES);
}

function textPart(value: string | null | undefined): GroupPart | null {
  const label = value?.trim() ?? "";
  return label === "" ? null : { key: label, label, sort: label };
}

/** Derive the bucket represented by one Notes column. */
export function noteGroupPart(
  note: GroupableNote,
  dimension: NoteGroupBy,
  dateFormat: DateFormatId = DEFAULT_DATE_FORMAT,
): GroupPart | null {
  switch (dimension) {
    case "subject":
      return textPart(note.subject);
    case "contexts":
      return textPart(noteContextsLabel(note.contexts));
    case "flag":
      return note.flag === "none"
        ? null
        : {
            key: note.flag,
            label: FLAG_LABELS[note.flag],
            sort: FLAG_LABELS[note.flag],
          };
    case "linked":
      return textPart(note.nodeName ?? note.contactName);
    case "date": {
      if (!note.noteDate) return null;
      const key = toDateKey(note.noteDate);
      return { key, label: formatNoteDate(note.noteDate, dateFormat), sort: key };
    }
    case "year":
    case "month":
    case "day": {
      const part = noteDatePart(note.noteDate, dimension);
      return part && { key: part.key, label: part.label, sort: part.rank };
    }
  }
}

function isCalendarDimension(dimension: NoteGroupBy): boolean {
  return (
    dimension === "date" ||
    dimension === "year" ||
    dimension === "month" ||
    dimension === "day"
  );
}

function compareParts(
  left: GroupPart,
  right: GroupPart,
  dimension: NoteGroupBy,
): number {
  if (typeof left.sort === "number" && typeof right.sort === "number") {
    return isCalendarDimension(dimension)
      ? right.sort - left.sort
      : left.sort - right.sort;
  }

  const compared = compareGroupText(String(left.sort), String(right.sort));
  return isCalendarDimension(dimension) ? -compared : compared;
}

/**
 * Put flat note rows under nested column-value headers.
 *
 * Calendar groups run newest first; categorical groups run alphabetically. Empty buckets
 * come last in both cases. Rows within the leaf group retain the Notes sort chosen by the
 * user.
 */
export function groupNotes<T extends GroupableNote>(
  rows: NoteRowView<T>[],
  dimensions: readonly NoteGroupBy[],
  dateFormat: DateFormatId = DEFAULT_DATE_FORMAT,
): GridRow<T>[] {
  return buildGroupRows(rows, {
    dimensions: asNoteGroupBy(dimensions),
    partOf: (row, dimension) => noteGroupPart(row.note, dimension, dateFormat),
    emptyLabel: (dimension) => EMPTY_LABELS[dimension],
    comparePart: compareParts,
    toGridRow,
  });
}

function toGridRow<T extends GroupableNote>(row: NoteRowView<T>): GridRow<T> {
  return {
    kind: "node",
    id: row.id,
    node: row.note,
    depth: row.depth,
  };
}
