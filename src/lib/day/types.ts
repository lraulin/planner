import type { NodeState, PriorityLetter } from "@/db/schema";

/**
 * The subject a journal entry is filed under in `notes`.
 *
 * Reserved: the day page writes into whichever note for that day carries it, and the Notes
 * tab groups on it. Lives here rather than in queries or mutations because both of those
 * need it, and importing one from the other would make a cycle.
 */
export const JOURNAL_SUBJECT = "Journal";

/**
 * One row on a day's task list, as the grid needs it.
 *
 * `title` is already resolved: for a node-backed row it is the task's *current* name, so
 * renaming a task updates every day it appears on; for a jotted row, and for one whose task
 * has since been deleted, it is the text stored on the row itself.
 */
export type DailyItemView = {
  id: string;
  /** `YYYY-MM-DD`. */
  day: string;
  /** The task this row stands for. Null for a line jotted straight onto the day. */
  nodeId: string | null;
  title: string;
  priorityLetter: PriorityLetter | null;
  priorityRank: number | null;
  sortKey: string;
  state: NodeState;
  /** Set once the row is checked off. Decides "done on this day" — see the schema comment. */
  completedAt: Date | null;
  /** The later day this row was carried to, when it was forwarded. */
  forwardedTo: string | null;
  /** The parent project/goal a node-backed row came from, for the source column. */
  sourceName: string | null;
};

/** The day page's data: the list itself, plus that day's journal entry. */
export type DayPayload = {
  /** `YYYY-MM-DD`. */
  day: string;
  items: DailyItemView[];
  journal: JournalEntry | null;
};

/** A day's journal note — a row in `notes` with `subject = "Journal"`. */
export type JournalEntry = {
  id: string;
  body: string;
};

/** The week view's data: seven days of rows, keyed by `YYYY-MM-DD`. */
export type WeekPayload = {
  /** `YYYY-MM-DD` of the first column. */
  weekStart: string;
  /** Seven `YYYY-MM-DD` keys, in column order. */
  days: string[];
  itemsByDay: Record<string, DailyItemView[]>;
};
