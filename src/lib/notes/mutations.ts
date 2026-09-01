import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { notes, type NewNote, type NoteFlag } from "@/db/schema";
import type { ExternalRef } from "@/db/schema";
import { between } from "@/lib/tree/sortKey";
import type { NotePosition } from "./types";

/**
 * Every mutation takes a `userId` and scopes on it, so a caller cannot reach another user's
 * notes even by guessing an id. Same contract as `src/lib/tree/mutations.ts`.
 */

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Db | Tx;

function parentMatches(parentId: string | null) {
  return parentId === null ? isNull(notes.parentId) : eq(notes.parentId, parentId);
}

async function requireNote(tx: Executor, userId: string, noteId: string) {
  const [note] = await tx
    .select()
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
    .limit(1);

  if (!note) throw new Error("Note not found.");
  return note;
}

/**
 * Open a parent so a newly nested child is actually on screen. Same rule as outline
 * `expandParent`: Collapse All stamps the flag onto leaves, so a first child would
 * otherwise hide under a parent that had no expander when it was collapsed.
 */
async function expandParent(
  tx: Executor,
  userId: string,
  parentId: string | null,
): Promise<void> {
  if (parentId === null) return;
  await tx
    .update(notes)
    .set({ collapsed: false, updatedAt: new Date() })
    .where(
      and(eq(notes.id, parentId), eq(notes.userId, userId), eq(notes.collapsed, true)),
    );
}

/** Sibling sort keys under `parentId`, in order. */
async function siblingKeys(
  tx: Executor,
  userId: string,
  parentId: string | null,
): Promise<{ id: string; sortKey: string }[]> {
  return tx
    .select({ id: notes.id, sortKey: notes.sortKey })
    .from(notes)
    .where(and(eq(notes.userId, userId), parentMatches(parentId)))
    .orderBy(asc(notes.sortKey));
}

/**
 * Resolves a `NotePosition` into a sort key, ignoring `excludeId` so a note being moved
 * within its current parent does not treat itself as a neighbour.
 */
async function sortKeyFor(
  tx: Executor,
  userId: string,
  parentId: string | null,
  position: NotePosition,
  excludeId?: string,
): Promise<string> {
  const siblings = (await siblingKeys(tx, userId, parentId)).filter(
    (s) => s.id !== excludeId,
  );

  switch (position.at) {
    case "first":
      return between(null, siblings[0]?.sortKey ?? null);
    case "last":
      return between(siblings[siblings.length - 1]?.sortKey ?? null, null);
    case "before": {
      const index = siblings.findIndex((s) => s.id === position.siblingId);
      if (index === -1) throw new Error("Sibling note not found.");
      return between(siblings[index - 1]?.sortKey ?? null, siblings[index].sortKey);
    }
    case "after": {
      const index = siblings.findIndex((s) => s.id === position.siblingId);
      if (index === -1) throw new Error("Sibling note not found.");
      return between(siblings[index].sortKey, siblings[index + 1]?.sortKey ?? null);
    }
  }
}

/** True when `candidateId` is `noteId` itself or sits somewhere beneath it. */
async function isSelfOrDescendant(
  tx: Executor,
  userId: string,
  noteId: string,
  candidateId: string | null,
): Promise<boolean> {
  let current = candidateId;
  while (current !== null) {
    if (current === noteId) return true;
    const [row] = await tx
      .select({ parentId: notes.parentId })
      .from(notes)
      .where(and(eq(notes.id, current), eq(notes.userId, userId)))
      .limit(1);
    if (!row) return false;
    current = row.parentId;
  }
  return false;
}

export type NoteInput = {
  title: string;
  subject: string;
  body: string;
  noteDate: Date | null;
  flag: NoteFlag;
  contexts: string[];
  nodeId: string | null;
  /** The contact this note is filed against — Achieve's Contact History. */
  contactId: string | null;
};

export async function createNote(params: {
  userId: string;
  parentId?: string | null;
  position?: NotePosition;
  values?: Partial<NoteInput>;
  external?: ExternalRef;
}): Promise<string> {
  return (await createNoteOnce(params)).id;
}

export async function createNoteOnce(params: {
  userId: string;
  parentId?: string | null;
  position?: NotePosition;
  values?: Partial<NoteInput>;
  external?: ExternalRef;
}): Promise<{ id: string; created: boolean }> {
  const {
    userId,
    parentId = null,
    position = { at: "last" },
    values = {},
    external,
  } = params;

  return db.transaction(async (tx) => {
    if (external) {
      const [existing] = await tx
        .select({ id: notes.id })
        .from(notes)
        .where(
          and(
            eq(notes.userId, userId),
            eq(notes.externalSource, external.source),
            eq(notes.externalId, external.id),
          ),
        )
        .limit(1);
      if (existing) return { id: existing.id, created: false };
    }

    // Reaching under another user's note must not be possible even with a valid id.
    if (parentId !== null) await requireNote(tx, userId, parentId);

    const sortKey = await sortKeyFor(tx, userId, parentId, position);

    const row: NewNote = {
      userId,
      parentId,
      sortKey,
      title: values.title ?? "",
      // Achieve defaults the Subject to "General" rather than leaving it blank.
      subject: values.subject ?? "General",
      body: values.body ?? "",
      // A note is about today unless said otherwise — matching Achieve, which pre-fills
      // the Date field on a new note.
      noteDate: values.noteDate ?? new Date(),
      flag: values.flag ?? "none",
      contexts: values.contexts ?? [],
      nodeId: values.nodeId ?? null,
      contactId: values.contactId ?? null,
      externalSource: external?.source ?? null,
      externalId: external?.id ?? null,
    };

    const [created] = await tx
      .insert(notes)
      .values(row)
      .onConflictDoNothing()
      .returning({ id: notes.id });
    if (created) {
      await expandParent(tx, userId, parentId);
      return { id: created.id, created: true };
    }
    if (!external) throw new Error("Note could not be created.");
    const [existing] = await tx
      .select({ id: notes.id })
      .from(notes)
      .where(
        and(
          eq(notes.userId, userId),
          eq(notes.externalSource, external.source),
          eq(notes.externalId, external.id),
        ),
      )
      .limit(1);
    if (!existing) throw new Error("Note could not be created.");
    return { id: existing.id, created: false };
  });
}

/**
 * Partial update. Only the keys present are written, so the drawer's autosave can send one
 * field without clobbering the rest.
 */
export async function updateNote(
  userId: string,
  noteId: string,
  input: Partial<NoteInput>,
): Promise<void> {
  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if (input.title !== undefined) patch.title = input.title;
  if (input.subject !== undefined) patch.subject = input.subject;
  // Body is stored exactly as typed — trailing spaces are meaningful in markdown
  // (two of them are a hard line break).
  if (input.body !== undefined) patch.body = input.body;
  if (input.noteDate !== undefined) patch.noteDate = input.noteDate;
  if (input.flag !== undefined) patch.flag = input.flag;
  if (input.contexts !== undefined) patch.contexts = input.contexts;
  if (input.nodeId !== undefined) patch.nodeId = input.nodeId;
  if (input.contactId !== undefined) patch.contactId = input.contactId;

  const updated = await db
    .update(notes)
    .set(patch)
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
    .returning({ id: notes.id });

  if (updated.length === 0) throw new Error("Note not found.");
}

/** Deletes a note. Its descendants cascade. */
export async function deleteNote(userId: string, noteId: string): Promise<void> {
  const deleted = await db
    .delete(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
    .returning({ id: notes.id });

  if (deleted.length === 0) throw new Error("Note not found.");
}

export async function setNoteCollapsed(
  userId: string,
  noteId: string,
  collapsed: boolean,
): Promise<void> {
  const updated = await db
    .update(notes)
    .set({ collapsed, updatedAt: new Date() })
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
    .returning({ id: notes.id });

  if (updated.length === 0) throw new Error("Note not found.");
}

/** Expand or collapse every note for a user, for Expand All / Collapse All. */
export async function setAllNotesCollapsed(
  userId: string,
  collapsed: boolean,
): Promise<void> {
  await db
    .update(notes)
    .set({ collapsed, updatedAt: new Date() })
    .where(eq(notes.userId, userId));
}

/** Moves a note under a new parent and/or to a new position among its siblings. */
export async function moveNote(params: {
  userId: string;
  noteId: string;
  parentId: string | null;
  position: NotePosition;
}): Promise<void> {
  const { userId, noteId, parentId, position } = params;

  await db.transaction(async (tx) => {
    await requireNote(tx, userId, noteId);

    if (await isSelfOrDescendant(tx, userId, noteId, parentId)) {
      throw new Error("A note cannot be moved inside itself.");
    }

    if (parentId !== null) await requireNote(tx, userId, parentId);

    const sortKey = await sortKeyFor(tx, userId, parentId, position, noteId);

    await tx
      .update(notes)
      .set({ parentId, sortKey, updatedAt: new Date() })
      .where(and(eq(notes.id, noteId), eq(notes.userId, userId)));

    await expandParent(tx, userId, parentId);
  });
}

/** Makes a note the last child of its previous sibling. */
export async function indentNote(userId: string, noteId: string): Promise<void> {
  const note = await requireNote(db, userId, noteId);
  const siblings = await siblingKeys(db, userId, note.parentId);
  const index = siblings.findIndex((s) => s.id === noteId);

  if (index <= 0) {
    throw new Error("Nothing to indent under — this is the first note at its level.");
  }

  await moveNote({
    userId,
    noteId,
    parentId: siblings[index - 1].id,
    position: { at: "last" },
  });
}

/** Makes a note the next sibling of its parent. */
export async function outdentNote(userId: string, noteId: string): Promise<void> {
  const note = await requireNote(db, userId, noteId);

  if (note.parentId === null) throw new Error("Already at the top level.");

  const parent = await requireNote(db, userId, note.parentId);

  await moveNote({
    userId,
    noteId,
    parentId: parent.parentId,
    position: { at: "after", siblingId: parent.id },
  });
}

/** Swaps a note with its previous or next sibling. */
export async function moveNoteVertically(
  userId: string,
  noteId: string,
  direction: "up" | "down",
): Promise<void> {
  const note = await requireNote(db, userId, noteId);
  const siblings = await siblingKeys(db, userId, note.parentId);
  const index = siblings.findIndex((s) => s.id === noteId);

  const target = direction === "up" ? index - 1 : index + 1;
  // Already at the end of its level — a no-op rather than an error.
  if (target < 0 || target >= siblings.length) return;

  await moveNote({
    userId,
    noteId,
    parentId: note.parentId,
    position: {
      at: direction === "up" ? "before" : "after",
      siblingId: siblings[target].id,
    },
  });
}
