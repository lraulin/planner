/**
 * Agent tools over notes: create, update, list.
 */

import type { NoteFlag } from "@/db/schema";
import {
  createNoteOnce,
  updateNote as updateNoteMutation,
} from "@/lib/notes/mutations";
import { loadNote, loadNotes, loadNotesForNode } from "@/lib/notes/queries";
import { AgentError } from "./errors";
import {
  optionalNullableString,
  optionalNumber,
  optionalString,
  optionalStringArray,
  parseDate,
  requireString,
  optionalExternalRef,
} from "./parse";
import { pageBounds, paginate } from "./pagination";
import { noteSearchSummary, noteSummary } from "./serialize";

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

  const result = await createNoteOnce({
    userId,
    external: optionalExternalRef(args),
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

  const note = await loadNote(userId, result.id);
  if (!note) throw new AgentError("internal", "Created note missing on reload");
  return { note: noteSummary(note), created: result.created };
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
  const note = await loadNote(userId, id);
  if (!note) throw new AgentError("not_found", "Note not found.");
  return { note: noteSummary(note) };
}

export async function listNotesTool(userId: string, args: Record<string, unknown>) {
  const nodeId = optionalString(args, "nodeId");
  const bounds = pageBounds(
    optionalNumber(args, "offset"),
    optionalNumber(args, "limit"),
    { limit: 30, max: 100 },
  );

  if (nodeId) {
    const notes = await loadNotesForNode(userId, nodeId);
    const page = paginate(notes, bounds);
    return { notes: page.items.map(noteSummary), pageInfo: page.pageInfo };
  }

  const notes = await loadNotes(userId);
  // Most recent first by noteDate / updatedAt-ish: outline order is tree order; reverse for capture feel.
  const sorted = [...notes].sort((a, b) => {
    const ta = (a.noteDate ?? a.updatedAt).getTime();
    const tb = (b.noteDate ?? b.updatedAt).getTime();
    return tb - ta;
  });
  const page = paginate(sorted, bounds);
  return { notes: page.items.map(noteSummary), pageInfo: page.pageInfo };
}

export async function searchNotesTool(userId: string, args: Record<string, unknown>) {
  const nodeId = optionalString(args, "nodeId");
  const query = optionalString(args, "query")?.trim().toLowerCase() ?? "";
  const bounds = pageBounds(
    optionalNumber(args, "offset"),
    optionalNumber(args, "limit"),
    { limit: 30, max: 100 },
  );
  const notes = nodeId
    ? await loadNotesForNode(userId, nodeId)
    : await loadNotes(userId);
  const matched = notes
    .filter((note) => {
      if (!query) return true;
      return `${note.title} ${note.subject} ${note.body} ${note.contexts.join(" ")}`
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => {
      const aTime = (a.noteDate ?? a.updatedAt).getTime();
      const bTime = (b.noteDate ?? b.updatedAt).getTime();
      return bTime - aTime;
    });
  const page = paginate(matched, bounds);
  return { notes: page.items.map(noteSearchSummary), pageInfo: page.pageInfo };
}

export async function getNoteTool(userId: string, args: Record<string, unknown>) {
  const id = requireString(args, "id");
  // One note, not the whole tree — loadNotes would pull every body just to pick one.
  const note = await loadNote(userId, id);
  if (!note) throw new AgentError("not_found", `Note not found: ${id}`);
  return { note: noteSummary(note) };
}
