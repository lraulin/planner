"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";
import * as notes from "@/lib/notes/mutations";
import type { NoteInput } from "@/lib/notes/mutations";
import type { NotePosition } from "@/lib/notes/types";

/**
 * Thin wrappers: resolve the user, delegate, and return `{ ok: false, error }` rather than
 * throwing, so a rejected save renders inline instead of crashing the view
 * (`drawer-pattern.md`). Same `run()` shape as `src/app/schedule/actions.ts`.
 */

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

async function run<T>(work: (userId: string) => Promise<T>): Promise<ActionResult> {
  try {
    const userId = await getCurrentUserId();
    const result = await work(userId);
    revalidatePath("/", "layout");
    return typeof result === "string" ? { ok: true, id: result } : { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Something went wrong.",
    };
  }
}

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
