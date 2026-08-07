/**
 * Agent tools over notes: create, update, list.
 */

import type { NoteFlag } from "@/db/schema";
import { createNote, updateNote as updateNoteMutation } from "@/lib/notes/mutations";
import { loadNotes, loadNotesForNode } from "@/lib/notes/queries";
import { AgentError } from "./errors";
import {
  optionalNullableString,
  optionalNumber,
  optionalString,
  optionalStringArray,
  parseDate,
  requireString,
} from "./parse";
import { noteSummary } from "./serialize";

export async function createNoteTool(userId: string, args: Record<string, unknown>) {
  const title = optionalString(args, "title") ?? "";
  const subject = optionalString(args, "subject");
  const body = optionalString(args, "body") ?? "";
  const nodeId = optionalNullableString(args, "nodeId");
  const noteDate = parseDate(
    optionalNullableString(args, "noteDate") ?? undefined,
    "noteDate",
  );
  const flag = optionalString(args, "flag") as NoteFlag | undefined;
  const contexts = optionalStringArray(args, "contexts");

  const id = await createNote({
    userId,
    values: {
      title,
      subject: subject ?? "General",
      body,
      nodeId: nodeId === undefined ? null : nodeId,
      noteDate: noteDate === undefined ? undefined : noteDate,
      flag: flag ?? "none",
      contexts: contexts ?? [],
    },
  });

  const notes = await loadNotes(userId);
  const note = notes.find((n) => n.id === id);
  if (!note) throw new AgentError("internal", "Created note missing on reload");
  return { note: noteSummary(note) };
}

export async function updateNoteTool(userId: string, args: Record<string, unknown>) {
  const id = requireString(args, "id");
  const patch: Parameters<typeof updateNoteMutation>[2] = {};
  if (args.title !== undefined) patch.title = requireString(args, "title");
  if (args.subject !== undefined) patch.subject = requireString(args, "subject");
  if (args.body !== undefined) patch.body = optionalString(args, "body") ?? "";
  if (args.nodeId !== undefined) {
    patch.nodeId = optionalNullableString(args, "nodeId") ?? null;
  }
  if (args.noteDate !== undefined) {
    patch.noteDate =
      parseDate(optionalNullableString(args, "noteDate") ?? null, "noteDate") ?? null;
  }
  if (args.flag !== undefined) {
    patch.flag = requireString(args, "flag") as NoteFlag;
  }
  if (args.contexts !== undefined) {
    patch.contexts = optionalStringArray(args, "contexts") ?? [];
  }

  await updateNoteMutation(userId, id, patch);
  const notes = await loadNotes(userId);
  const note = notes.find((n) => n.id === id);
  if (!note) throw new AgentError("not_found", "Note not found.");
  return { note: noteSummary(note) };
}

export async function listNotesTool(userId: string, args: Record<string, unknown>) {
  const nodeId = optionalString(args, "nodeId");
  const limit = Math.min(Math.max(optionalNumber(args, "limit") ?? 30, 1), 100);

  if (nodeId) {
    const notes = await loadNotesForNode(userId, nodeId);
    return { notes: notes.slice(0, limit).map(noteSummary) };
  }

  const notes = await loadNotes(userId);
  // Most recent first by noteDate / updatedAt-ish: outline order is tree order; reverse for capture feel.
  const sorted = [...notes].sort((a, b) => {
    const ta = (a.noteDate ?? a.updatedAt).getTime();
    const tb = (b.noteDate ?? b.updatedAt).getTime();
    return tb - ta;
  });
  return { notes: sorted.slice(0, limit).map(noteSummary) };
}
