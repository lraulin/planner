"use server";

import * as notes from "@/lib/notes/mutations";
import type { NoteInput } from "@/lib/notes/mutations";
import type { NoteFilter } from "@/lib/notes/filter";
import {
  loadNote,
  loadNoteIdsMatchingFilter,
  loadNoteSummary,
} from "@/lib/notes/queries";
import type { NoteNode, NotePosition, NoteSummary } from "@/lib/notes/types";
import {
  run,
  runQuery,
  runWithData,
  type ActionResult,
  type DataActionResult,
  type QueryResult,
} from "../actionResult";

/**
 * Thin wrappers: resolve the user, delegate, and return `{ ok: false, error }` rather than
 * throwing, so a rejected save renders inline instead of crashing the view
 * (`drawer-pattern.md`).
 *
 * Field updates (including drawer autosave) pass `revalidate: []` — the list patches itself
 * from the returned summary and must not refresh the whole Notes RSC every 800 ms.
 * Structural moves still layout-invalidate so every surface sees the new tree.
 */

export async function createNoteAction(params: {
  parentId?: string | null;
  position?: NotePosition;
  values?: Partial<NoteInput>;
}): Promise<ActionResult> {
  return run((userId) => notes.createNote({ userId, ...params }));
}

export async function updateNoteAction(
  id: string,
  input: Partial<NoteInput>,
): Promise<DataActionResult<NoteSummary>> {
  return runWithData(
    async (userId) => {
      await notes.updateNote(userId, id, input);
      const summary = await loadNoteSummary(userId, id);
      if (!summary) throw new Error("Note not found.");
      return summary;
    },
    { revalidate: [] },
  );
}

export async function deleteNoteAction(id: string): Promise<ActionResult> {
  return run((userId) => notes.deleteNote(userId, id));
}

export async function setNoteCollapsedAction(
  id: string,
  collapsed: boolean,
): Promise<ActionResult> {
  return run((userId) => notes.setNoteCollapsed(userId, id, collapsed));
}

export async function setAllNotesCollapsedAction(
  collapsed: boolean,
): Promise<ActionResult> {
  return run((userId) => notes.setAllNotesCollapsed(userId, collapsed));
}

export async function moveNoteAction(params: {
  noteId: string;
  parentId: string | null;
  position: NotePosition;
}): Promise<ActionResult> {
  return run((userId) => notes.moveNote({ userId, ...params }));
}

export async function indentNoteAction(id: string): Promise<ActionResult> {
  return run((userId) => notes.indentNote(userId, id));
}

export async function outdentNoteAction(id: string): Promise<ActionResult> {
  return run((userId) => notes.outdentNote(userId, id));
}

export async function moveNoteVerticallyAction(
  id: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  return run((userId) => notes.moveNoteVertically(userId, id, direction));
}

/** Full body for the drawer / deep-link — list rows never carry Markdown. */
export async function getNoteAction(id: string): Promise<QueryResult<NoteNode | null>> {
  return runQuery((userId) => loadNote(userId, id));
}

/**
 * Server-side body filter: returns the ids that match when the list has only summaries.
 * Exact same semantics as client `notePassesFilter`.
 */
export async function matchNoteFilterAction(
  filter: NoteFilter,
): Promise<QueryResult<string[]>> {
  return runQuery((userId) => loadNoteIdsMatchingFilter(userId, filter));
}
