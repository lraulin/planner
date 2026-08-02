import { aliasedTable, and, asc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { dailyItems, nodes, notes } from "@/db/schema";
import { shiftDateKey, toDateKey } from "@/lib/schedule/geometry";
import { forwardOpenItems } from "./mutations";
import { sortDayItems } from "./priority";
import {
  JOURNAL_SUBJECT,
  type DailyItemView,
  type DayPayload,
  type WeekPayload,
} from "./types";

/** Reads for the Day and Week views. Every query scopes on `userId`. */

/** Parent node, aliased so a row can report the project it came from. */
const parent = aliasedTable(nodes, "parent_node");

const itemColumns = {
  id: dailyItems.id,
  day: dailyItems.day,
  nodeId: dailyItems.nodeId,
  storedTitle: dailyItems.title,
  nodeName: nodes.name,
  priorityLetter: dailyItems.priorityLetter,
  priorityRank: dailyItems.priorityRank,
  sortKey: dailyItems.sortKey,
  state: dailyItems.state,
  completedAt: dailyItems.completedAt,
  forwardedTo: dailyItems.forwardedTo,
  sourceName: parent.name,
};

type ItemRow = {
  id: string;
  day: string;
  nodeId: string | null;
  storedTitle: string;
  nodeName: string | null;
  priorityLetter: DailyItemView["priorityLetter"];
  priorityRank: number | null;
  sortKey: string;
  state: DailyItemView["state"];
  completedAt: Date | null;
  forwardedTo: string | null;
  sourceName: string | null;
};

/**
 * Prefer the task's live name so renaming a task updates every day it sits on. Fall back to
 * the stored snapshot for jotted rows, and for rows whose task has since been deleted —
 * that snapshot is the only remaining record of what the day was about.
 */
function toView(row: ItemRow): DailyItemView {
  return {
    id: row.id,
    day: row.day,
    nodeId: row.nodeId,
    title: row.nodeName ?? row.storedTitle,
    priorityLetter: row.priorityLetter,
    priorityRank: row.priorityRank,
    sortKey: row.sortKey,
    state: row.state,
    completedAt: row.completedAt,
    forwardedTo: row.forwardedTo,
    sourceName: row.sourceName,
  };
}

/**
 * One day's task list, plus that day's journal entry.
 *
 * When the requested day **is today**, unfinished rows from earlier days are carried over
 * first (see `src/lib/day/forward.ts`). Doing it on read rather than on a schedule means
 * carry-over does not depend on the app being open at midnight, and `forwardOpenItems` is
 * idempotent so repeated loads settle to the same list.
 */
export async function loadDay(
  userId: string,
  day: string,
  today: string = toDateKey(new Date()),
): Promise<DayPayload> {
  if (day === today) {
    await forwardOpenItems(userId, today);
  }

  const rows = await db
    .select(itemColumns)
    .from(dailyItems)
    .leftJoin(nodes, eq(nodes.id, dailyItems.nodeId))
    .leftJoin(parent, eq(parent.id, nodes.parentId))
    .where(and(eq(dailyItems.userId, userId), eq(dailyItems.day, day)))
    .orderBy(asc(dailyItems.sortKey));

  return {
    day,
    items: sortDayItems(rows.map(toView)),
    journal: await loadJournal(userId, day),
  };
}

/** Seven days of rows for the week grid, keyed by day. Never forwards — reads only. */
export async function loadWeek(
  userId: string,
  weekStart: string,
  weekEnd: string,
): Promise<WeekPayload> {
  const rows = await db
    .select(itemColumns)
    .from(dailyItems)
    .leftJoin(nodes, eq(nodes.id, dailyItems.nodeId))
    .leftJoin(parent, eq(parent.id, nodes.parentId))
    .where(
      and(
        eq(dailyItems.userId, userId),
        gte(dailyItems.day, weekStart),
        lte(dailyItems.day, weekEnd),
      ),
    )
    .orderBy(asc(dailyItems.day), asc(dailyItems.sortKey));

  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(shiftDateKey(weekStart, i));
  }

  const itemsByDay: Record<string, DailyItemView[]> = Object.fromEntries(
    days.map((d) => [d, [] as DailyItemView[]]),
  );
  for (const row of rows) {
    itemsByDay[row.day]?.push(toView(row));
  }
  for (const d of days) {
    itemsByDay[d] = sortDayItems(itemsByDay[d]);
  }

  return { weekStart, days, itemsByDay };
}

/**
 * The day a task is currently planned for, or null.
 *
 * Read off the open day row rather than off `target_start_date`, even though the two are
 * kept equal by `syncDayLineToTargetStart`. The row is the authority on whether a line
 * exists at all, and it is single-valued by construction: `daily_items_open_node_uq` allows
 * a node at most one open day. Completed and forwarded rows are history and excluded.
 */
export async function plannedDayForNode(
  userId: string,
  nodeId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ day: dailyItems.day })
    .from(dailyItems)
    .where(
      and(
        eq(dailyItems.userId, userId),
        eq(dailyItems.nodeId, nodeId),
        isNull(dailyItems.completedAt),
        isNull(dailyItems.forwardedTo),
      ),
    )
    .limit(1);

  return row?.day ?? null;
}

/**
 * Every node sitting on an open day, for the chooser's "hide what I have already planned"
 * filter. One small query beats joining `daily_items` into the chooser's own load.
 */
export async function plannedNodeIds(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ nodeId: dailyItems.nodeId })
    .from(dailyItems)
    .where(
      and(
        eq(dailyItems.userId, userId),
        isNull(dailyItems.completedAt),
        isNull(dailyItems.forwardedTo),
        sql`${dailyItems.nodeId} is not null`,
      ),
    );

  return new Set(
    rows.map((row) => row.nodeId).filter((id): id is string => id !== null),
  );
}

/** The journal note for a day, if one has been started. */
export async function loadJournal(userId: string, day: string) {
  const [row] = await db
    .select({ id: notes.id, body: notes.body })
    .from(notes)
    .where(
      and(
        eq(notes.userId, userId),
        eq(notes.subject, JOURNAL_SUBJECT),
        sql`${notes.noteDate}::date = ${day}::date`,
      ),
    )
    .orderBy(asc(notes.createdAt))
    .limit(1);

  return row ?? null;
}
