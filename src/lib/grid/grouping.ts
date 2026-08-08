/**
 * Group dimensions shared by the grid toolbar.
 *
 * Tree tabs and Notes prepare their group rows differently, but the picker state is the
 * same: an ordered list of known dimensions, capped at three levels. Keeping that small
 * piece here stops the shared toolbar from treating outline-only dimensions as the whole
 * universe now that Notes can group by calendar parts too.
 */

export type TreeGroupBy =
  | "category"
  | "resultArea"
  | "goal"
  | "project"
  | "state"
  | "priorityLetter"
  | "deadlineBand";

export type CalendarNoteGroupBy = "date" | "year" | "month" | "day";

export type NoteGroupBy =
  "subject" | "contexts" | "flag" | CalendarNoteGroupBy | "linked";

export type GridGroupBy = TreeGroupBy | NoteGroupBy;

export const TREE_GROUP_BY_VALUES: readonly TreeGroupBy[] = [
  "category",
  "resultArea",
  "goal",
  "project",
  "state",
  "priorityLetter",
  "deadlineBand",
];

export const NOTE_GROUP_BY_VALUES: readonly NoteGroupBy[] = [
  "subject",
  "contexts",
  "flag",
  "date",
  "year",
  "month",
  "day",
  "linked",
];

const GRID_GROUP_BY_VALUES: readonly GridGroupBy[] = [
  ...TREE_GROUP_BY_VALUES,
  ...NOTE_GROUP_BY_VALUES,
];

export const GROUP_BY_LABELS: Record<GridGroupBy, string> = {
  category: "Category",
  resultArea: "Result Area",
  goal: "Goal",
  project: "Project",
  state: "State",
  priorityLetter: "Priority",
  deadlineBand: "Deadline",
  subject: "Subject",
  contexts: "Contexts",
  flag: "Flag",
  date: "Date",
  year: "Year",
  month: "Month",
  day: "Day",
  linked: "Linked to",
};

/** How many dimensions may be stacked before the headers overwhelm the rows. */
export const MAX_GROUP_LEVELS = 3;

/** Narrow persisted strings to dimensions the caller actually knows how to render. */
export function knownGroupBy<T extends string>(
  values: readonly string[],
  known: readonly T[],
): T[] {
  const allowed = new Set<string>(known);
  const seen = new Set<string>();
  const out: T[] = [];

  for (const value of values) {
    if (!allowed.has(value) || seen.has(value)) continue;
    seen.add(value);
    out.push(value as T);
    if (out.length === MAX_GROUP_LEVELS) break;
  }

  return out;
}

/** Narrow stored strings to any group dimension understood by the shared toolbar. */
export function asGridGroupBy(values: readonly string[]): GridGroupBy[] {
  return knownGroupBy(values, GRID_GROUP_BY_VALUES);
}

/**
 * Set one level of a grouping, returning the new list.
 *
 * Clearing truncates the levels beneath it. A dimension may appear once, so choosing one
 * that is already in use moves it rather than creating a no-op nested duplicate.
 */
export function setGroupLevel<T extends string>(
  levels: readonly T[],
  index: number,
  value: T | null,
): T[] {
  if (index < 0 || index >= MAX_GROUP_LEVELS) return [...levels];
  if (value === null) return levels.slice(0, index);

  const next = levels.slice(0, Math.min(index, levels.length));
  next[index] = value;

  const seen = new Set<T>();
  const out: T[] = [];
  for (const level of [...next, ...levels.slice(index + 1)]) {
    if (level === undefined || seen.has(level)) continue;
    seen.add(level);
    out.push(level);
  }
  return out.slice(0, MAX_GROUP_LEVELS);
}
