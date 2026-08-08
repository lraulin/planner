import {
  NOTE_GROUP_BY_VALUES,
  knownGroupBy,
  type NoteGroupBy,
} from "@/lib/grid/grouping";
import { toDateKey } from "@/lib/schedule/geometry";
import type { GridRow } from "@/lib/tree/slice";
import type { NoteRowView } from "./slice";

export { NOTE_GROUP_BY_VALUES };
export type { NoteGroupBy };

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
  year: "(No Year)",
  month: "(No Month)",
  day: "(No Day)",
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
  dimension: NoteGroupBy,
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
export function noteDatePartLabel(value: string, dimension: NoteGroupBy): string {
  if (dimension === "month") return MONTH_LABELS[Number(value) - 1] ?? value;
  if (dimension === "day") return String(Number(value));
  return value;
}

/** Keep only the calendar dimensions Notes knows how to turn into headers. */
export function asNoteGroupBy(values: readonly string[]): NoteGroupBy[] {
  return knownGroupBy(values, NOTE_GROUP_BY_VALUES);
}

/**
 * Put flat note rows under nested calendar headers.
 *
 * Groups run newest first and undated last, which keeps the current journal near the top
 * of a long archive. Rows within the leaf group retain the Notes sort chosen by the user.
 */
export function groupNotes(
  rows: NoteRowView[],
  dimensions: readonly NoteGroupBy[],
): GridRow<NoteRowView["note"]>[] {
  const groupBy = asNoteGroupBy(dimensions);
  if (groupBy.length === 0) return rows.map(toGridRow);

  const indexed = rows.map((row, index) => ({ row, index }));
  indexed.sort((left, right) => {
    for (const dimension of groupBy) {
      const a = noteDatePart(left.row.note.noteDate, dimension);
      const b = noteDatePart(right.row.note.noteDate, dimension);
      if (a === null && b === null) continue;
      if (a === null) return 1;
      if (b === null) return -1;
      if (a.rank !== b.rank) return b.rank - a.rank;
    }
    return left.index - right.index;
  });

  const out: GridRow<NoteRowView["note"]>[] = [];
  type Frame = {
    dimension: NoteGroupBy;
    key: string;
    rowIndex: number;
    count: number;
  };
  const stack: Frame[] = [];

  function closeTo(depth: number) {
    while (stack.length > depth) {
      const frame = stack.pop()!;
      const header = out[frame.rowIndex];
      if (header.kind === "group") header.count = frame.count;
    }
  }

  for (const { row } of indexed) {
    for (let level = 0; level < groupBy.length; level++) {
      const dimension = groupBy[level];
      const part = noteDatePart(row.note.noteDate, dimension);
      const key = part?.key ?? "";
      const frame = stack[level];

      if (frame?.dimension === dimension && frame.key === key) continue;
      closeTo(level);

      const path = [
        ...stack.map((entry) => `${entry.dimension}:${entry.key}`),
        `${dimension}:${key}`,
      ];
      const rowIndex = out.length;
      out.push({
        kind: "group",
        id: `group:${path.join("|")}`,
        label: part?.label ?? EMPTY_LABELS[dimension],
        count: 0,
        depth: level,
        collapsed: false,
      });
      stack.push({ dimension, key, rowIndex, count: 0 });
    }

    out.push(toGridRow(row));
    for (const frame of stack) frame.count += 1;
  }

  closeTo(0);
  return out;
}

function toGridRow(row: NoteRowView): GridRow<NoteRowView["note"]> {
  return {
    kind: "node",
    id: row.id,
    node: row.note,
    depth: row.depth,
  };
}
