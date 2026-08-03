import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { notes } from "@/db/schema";
import { between } from "@/lib/tree/sortKey";
import { JOURNAL_SUBJECT } from "./types";

/**
 * Journal notes live under a fixed Notes tree:
 *
 *   Journal / YYYY / YYYY-MM / YYYY-MM-DD
 *
 * Day rows use `subject = "Journal"` and a `noteDate`. Year/month/root folders are plain
 * structural notes (empty subject, no date) so the Notes "Journal" subject filter still
 * means diary entries, not scaffolding.
 *
 * Shared by `saveJournal` and RedNotebook import so the two paths cannot diverge.
 */

export const JOURNAL_ROOT_TITLE = "Journal";

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type JournalExecutor = Db | Tx;

export type JournalDayRow = {
  id: string;
  body: string;
  parentId: string | null;
  contexts: string[];
};

function parentMatches(parentId: string | null) {
  return parentId === null ? isNull(notes.parentId) : eq(notes.parentId, parentId);
}

/** Sort key placing a new sibling at the end of `parentId`. */
async function endSortKey(
  tx: JournalExecutor,
  userId: string,
  parentId: string | null,
): Promise<string> {
  const [last] = await tx
    .select({ sortKey: notes.sortKey })
    .from(notes)
    .where(and(eq(notes.userId, userId), parentMatches(parentId)))
    .orderBy(sql`${notes.sortKey} desc`)
    .limit(1);
  return between(last?.sortKey ?? null, null);
}

/**
 * Find or create a structural folder note under `parentId` with the given title.
 * Folders are identified by title + parent (not subject).
 */
async function ensureFolder(
  tx: JournalExecutor,
  userId: string,
  parentId: string | null,
  title: string,
): Promise<string> {
  const [existing] = await tx
    .select({ id: notes.id })
    .from(notes)
    .where(
      and(
        eq(notes.userId, userId),
        parentMatches(parentId),
        eq(notes.title, title),
        // Prefer non-journal-day rows so we never treat a day entry as a folder.
        sql`(${notes.subject} is distinct from ${JOURNAL_SUBJECT})`,
      ),
    )
    .orderBy(asc(notes.createdAt))
    .limit(1);

  if (existing) return existing.id;

  const sortKey = await endSortKey(tx, userId, parentId);
  const [created] = await tx
    .insert(notes)
    .values({
      userId,
      parentId,
      sortKey,
      title,
      subject: "",
      body: "",
      noteDate: null,
      flag: "none",
      contexts: [],
    })
    .returning({ id: notes.id });
  return created.id;
}

/** Root "Journal" folder id. */
export async function ensureJournalRoot(
  tx: JournalExecutor,
  userId: string,
): Promise<string> {
  return ensureFolder(tx, userId, null, JOURNAL_ROOT_TITLE);
}

/**
 * Ensure Journal / YYYY / YYYY-MM for `dayKey` (`YYYY-MM-DD`).
 * Returns the month folder id (parent for the day note).
 */
export async function ensureJournalMonth(
  tx: JournalExecutor,
  userId: string,
  dayKey: string,
): Promise<{ rootId: string; yearId: string; monthId: string }> {
  const year = dayKey.slice(0, 4);
  const yearMonth = dayKey.slice(0, 7);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
    throw new Error(`Invalid journal day key: ${dayKey}`);
  }

  const rootId = await ensureJournalRoot(tx, userId);
  const yearId = await ensureFolder(tx, userId, rootId, year);
  const monthId = await ensureFolder(tx, userId, yearId, yearMonth);
  return { rootId, yearId, monthId };
}

/** The journal entry for a calendar day, if any (oldest when multiples exist). */
export async function findJournalForDay(
  tx: JournalExecutor,
  userId: string,
  dayKey: string,
): Promise<JournalDayRow | null> {
  const [row] = await tx
    .select({
      id: notes.id,
      body: notes.body,
      parentId: notes.parentId,
      contexts: notes.contexts,
    })
    .from(notes)
    .where(
      and(
        eq(notes.userId, userId),
        eq(notes.subject, JOURNAL_SUBJECT),
        sql`${notes.noteDate}::date = ${dayKey}::date`,
      ),
    )
    .orderBy(asc(notes.createdAt))
    .limit(1);

  return row ?? null;
}

/** Move a day journal under its month folder when it sits elsewhere (legacy flats). */
export async function rehomeJournalNote(
  tx: JournalExecutor,
  userId: string,
  noteId: string,
  monthId: string,
): Promise<void> {
  const [row] = await tx
    .select({ id: notes.id, parentId: notes.parentId })
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
    .limit(1);
  if (!row) return;
  if (row.parentId === monthId) return;

  const sortKey = await endSortKey(tx, userId, monthId);
  await tx
    .update(notes)
    .set({ parentId: monthId, sortKey, updatedAt: new Date() })
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)));
}

/**
 * Reparent every journal day note into Journal / YYYY / YYYY-MM.
 * Structural folders are created as needed. Safe to call repeatedly.
 */
export async function rehomeAllJournalNotes(
  tx: JournalExecutor,
  userId: string,
): Promise<number> {
  const rows = await tx
    .select({
      id: notes.id,
      noteDate: notes.noteDate,
      parentId: notes.parentId,
    })
    .from(notes)
    .where(
      and(
        eq(notes.userId, userId),
        eq(notes.subject, JOURNAL_SUBJECT),
        sql`${notes.noteDate} is not null`,
      ),
    );

  let moved = 0;
  for (const row of rows) {
    if (!row.noteDate) continue;
    const y = row.noteDate.getUTCFullYear();
    const m = String(row.noteDate.getUTCMonth() + 1).padStart(2, "0");
    const d = String(row.noteDate.getUTCDate()).padStart(2, "0");
    const dayKey = `${y}-${m}-${d}`;
    const { monthId } = await ensureJournalMonth(tx, userId, dayKey);
    if (row.parentId === monthId) continue;
    await rehomeJournalNote(tx, userId, row.id, monthId);
    moved++;
  }
  return moved;
}
