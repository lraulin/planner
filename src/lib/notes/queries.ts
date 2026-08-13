import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { notes } from "@/db/schema";
import { deriveNotes } from "./derive";
import { filterRequiresBody, notePassesFilter, type NoteFilter } from "./filter";
import { noteSnippet } from "./snippet";
import type { NoteNode, NoteRow, NoteSummary } from "./types";
import { DIARY_SUBJECTS, type DiarySummary } from "./diaryTree";

/**
 * Loads a user's whole note tree in one round trip.
 *
 * Same shape as `loadOutline` in `src/lib/tree/queries.ts`: the recursive CTE accumulates
 * each note's chain of sort keys into a path array, so ordering by that path yields
 * depth-first order with siblings correctly sequenced.
 *
 * The join to `nodes` is for the "Linked to" column. It is a left join on a nullable
 * column, so an unlinked note — the common case — costs nothing. Contact labels are joined
 * in `NotesGrid` from `loadContactOptions`, which keeps their name derivation in one place.
 *
 * Prefer `loadNoteSummaries` for the Notes list route — full bodies are for detail loads
 * and server-side body filters only.
 */
export async function loadNotes(userId: string): Promise<NoteNode[]> {
  const rows = await loadNoteRows(userId);
  return deriveNotes(rows);
}

/**
 * List payload: tree metadata + snippet, never the Markdown body.
 *
 * Bodies are the bulk of the Notes RSC transfer. Snippets are computed once on the server
 * so the grid does not re-strip markdown for every row on every render.
 */
export async function loadNoteSummaries(userId: string): Promise<NoteSummary[]> {
  const nodes = await loadNotes(userId);
  return nodes.map(toSummary);
}

/** One note with full body, user-scoped. Null when missing or not owned. */
export async function loadNote(
  userId: string,
  noteId: string,
): Promise<NoteNode | null> {
  const result = await db.execute(sql`
    SELECT
      n.id, n.parent_id, n.sort_key, n.title, n.subject, n.body,
      n.note_date, n.flag, n.contexts, n.collapsed, n.node_id, n.contact_id,
      n.created_at, n.updated_at,
      (
        SELECT count(*)::int FROM notes c
        WHERE c.parent_id = n.id AND c.user_id = ${userId}
      ) AS child_count,
      linked.name AS node_name,
      linked.type AS node_type
    FROM notes n
    LEFT JOIN nodes linked ON linked.id = n.node_id AND linked.user_id = ${userId}
    WHERE n.user_id = ${userId} AND n.id = ${noteId}
    LIMIT 1
  `);

  const raw = (result as unknown as Record<string, unknown>[])[0];
  if (!raw) return null;

  const childCount = Number(raw.child_count);
  return {
    id: raw.id as string,
    parentId: (raw.parent_id as string | null) ?? null,
    sortKey: raw.sort_key as string,
    title: raw.title as string,
    subject: raw.subject as string,
    body: raw.body as string,
    noteDate: raw.note_date ? new Date(raw.note_date as string) : null,
    flag: raw.flag as NoteRow["flag"],
    contexts: (raw.contexts as string[] | null) ?? [],
    collapsed: Boolean(raw.collapsed),
    depth: 0,
    nodeId: (raw.node_id as string | null) ?? null,
    contactId: (raw.contact_id as string | null) ?? null,
    contactName: null,
    nodeName: (raw.node_name as string | null) ?? null,
    nodeType: (raw.node_type as NoteRow["nodeType"]) ?? null,
    createdAt: new Date(raw.created_at as string),
    updatedAt: new Date(raw.updated_at as string),
    childCount,
    hasChildren: childCount > 0,
    // Detail load is for the drawer; collapse-hiding is a list concern.
    hidden: false,
  };
}

/**
 * Ids of notes that survive `filter`, including body text when needed.
 *
 * Used when the list has only summaries: the client asks the server for the matching set
 * and intersects it with the list rows. Preserves exact `notePassesFilter` semantics.
 */
export async function loadNoteIdsMatchingFilter(
  userId: string,
  filter: NoteFilter,
): Promise<string[]> {
  const nodes = await loadNotes(userId);
  return nodes.filter((note) => notePassesFilter(note, filter)).map((note) => note.id);
}

/**
 * Summaries for the Notes page, plus optional server body-match ids when the active filter
 * searches bodies. When the filter does not need bodies, `bodyMatchIds` is null and the
 * client may filter locally. One tree load covers both when body matching is required.
 */
export async function loadNotesListPayload(
  userId: string,
  filter: NoteFilter | null,
): Promise<{ summaries: NoteSummary[]; bodyMatchIds: string[] | null }> {
  if (!filter || !filterRequiresBody(filter)) {
    return { summaries: await loadNoteSummaries(userId), bodyMatchIds: null };
  }
  const nodes = await loadNotes(userId);
  return {
    summaries: nodes.map(toSummary),
    bodyMatchIds: nodes
      .filter((note) => notePassesFilter(note, filter))
      .map((note) => note.id),
  };
}

/**
 * Journal + Rednotebook notes only, list-shaped. Bodies never leave this function —
 * the diary tree only needs a snippet and a date.
 */
export async function loadDiarySummaries(userId: string): Promise<DiarySummary[]> {
  const rows = await db
    .select({
      id: notes.id,
      subject: notes.subject,
      body: notes.body,
      noteDate: notes.noteDate,
      createdAt: notes.createdAt,
    })
    .from(notes)
    .where(
      and(
        eq(notes.userId, userId),
        inArray(notes.subject, [...DIARY_SUBJECTS]),
        isNotNull(notes.noteDate),
      ),
    );

  return rows.map((row) => ({
    id: row.id,
    subject: row.subject,
    snippet: noteSnippet(row.body),
    noteDate: row.noteDate,
    createdAt: row.createdAt,
  }));
}

/** Summary fields after a successful autosave — patch the list without a route refresh. */
export async function loadNoteSummary(
  userId: string,
  noteId: string,
): Promise<NoteSummary | null> {
  const note = await loadNote(userId, noteId);
  return note ? toSummary(note) : null;
}

/** Every note linked to one record, newest first. Direct SQL — not a full-tree scan. */
export async function loadNotesForNode(
  userId: string,
  nodeId: string,
): Promise<NoteNode[]> {
  const result = await db.execute(sql`
    SELECT
      n.id, n.parent_id, n.sort_key, n.title, n.subject, n.body,
      n.note_date, n.flag, n.contexts, n.collapsed, n.node_id, n.contact_id,
      n.created_at, n.updated_at,
      linked.name AS node_name,
      linked.type AS node_type
    FROM notes n
    LEFT JOIN nodes linked ON linked.id = n.node_id AND linked.user_id = ${userId}
    WHERE n.user_id = ${userId} AND n.node_id = ${nodeId}
    ORDER BY n.updated_at DESC
  `);

  return mapFlatNoteRows(result);
}

/** Every note filed against one contact, newest first. Direct SQL — not a full-tree scan. */
export async function loadNotesForContact(
  userId: string,
  contactId: string,
): Promise<NoteNode[]> {
  const result = await db.execute(sql`
    SELECT
      n.id, n.parent_id, n.sort_key, n.title, n.subject, n.body,
      n.note_date, n.flag, n.contexts, n.collapsed, n.node_id, n.contact_id,
      n.created_at, n.updated_at,
      linked.name AS node_name,
      linked.type AS node_type
    FROM notes n
    LEFT JOIN nodes linked ON linked.id = n.node_id AND linked.user_id = ${userId}
    WHERE n.user_id = ${userId} AND n.contact_id = ${contactId}
    ORDER BY n.updated_at DESC
  `);

  return mapFlatNoteRows(result);
}

function toSummary(note: NoteNode): NoteSummary {
  const { body, ...rest } = note;
  return { ...rest, snippet: noteSnippet(body) };
}

async function loadNoteRows(userId: string): Promise<NoteRow[]> {
  const result = await db.execute(sql`
    WITH RECURSIVE note_tree AS (
      SELECT
        n.id, n.parent_id, n.sort_key, n.title, n.subject, n.body,
        n.note_date, n.flag, n.contexts, n.collapsed, n.node_id, n.contact_id,
        n.created_at, n.updated_at,
        0 AS depth,
        ARRAY[n.sort_key] AS path
      FROM notes n
      WHERE n.user_id = ${userId} AND n.parent_id IS NULL

      UNION ALL

      SELECT
        c.id, c.parent_id, c.sort_key, c.title, c.subject, c.body,
        c.note_date, c.flag, c.contexts, c.collapsed, c.node_id, c.contact_id,
        c.created_at, c.updated_at,
        t.depth + 1,
        t.path || c.sort_key
      FROM notes c
      JOIN note_tree t ON c.parent_id = t.id
      WHERE c.user_id = ${userId}
    )
    SELECT
      t.id, t.parent_id, t.sort_key, t.title, t.subject, t.body,
      t.note_date, t.flag, t.contexts, t.collapsed, t.node_id, t.contact_id,
      t.created_at, t.updated_at, t.depth,
      linked.name AS node_name,
      linked.type AS node_type
    FROM note_tree t
    LEFT JOIN nodes linked ON linked.id = t.node_id AND linked.user_id = ${userId}
    ORDER BY t.path
  `);

  return (result as unknown as Record<string, unknown>[]).map(mapTreeRow);
}

function mapTreeRow(r: Record<string, unknown>): NoteRow {
  return {
    id: r.id as string,
    parentId: (r.parent_id as string | null) ?? null,
    sortKey: r.sort_key as string,
    title: r.title as string,
    subject: r.subject as string,
    body: r.body as string,
    noteDate: r.note_date ? new Date(r.note_date as string) : null,
    flag: r.flag as NoteRow["flag"],
    contexts: (r.contexts as string[] | null) ?? [],
    collapsed: Boolean(r.collapsed),
    depth: Number(r.depth),
    nodeId: (r.node_id as string | null) ?? null,
    contactId: (r.contact_id as string | null) ?? null,
    contactName: null,
    nodeName: (r.node_name as string | null) ?? null,
    nodeType: (r.node_type as NoteRow["nodeType"]) ?? null,
    createdAt: new Date(r.created_at as string),
    updatedAt: new Date(r.updated_at as string),
  };
}

function mapFlatNoteRows(rows: unknown): NoteNode[] {
  return (rows as Record<string, unknown>[]).map((r) => {
    const row = mapTreeRow({ ...r, depth: 0 });
    return {
      ...row,
      childCount: 0,
      hasChildren: false,
      hidden: false,
    };
  });
}

/** Exists so callers that only need ownership can avoid the full tree. */
export async function noteOwnedBy(userId: string, noteId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
    .limit(1);
  return Boolean(row);
}
