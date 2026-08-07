"use server";

import * as notes from "@/lib/notes/mutations";
import type { NoteInput } from "@/lib/notes/mutations";
import type { NotePosition } from "@/lib/notes/types";
import { run, type ActionResult } from "../actionResult";

/**
 * Thin wrappers: resolve the user, delegate, and return `{ ok: false, error }` rather than
 * throwing, so a rejected save renders inline instead of crashing the view
 * (`drawer-pattern.md`).
 */

export type { ActionResult };

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
): Promise<ActionResult> {
  return run((userId) => notes.updateNote(userId, id, input));
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
