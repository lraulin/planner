"use server";

import {
  createThought,
  createThoughtType,
  deleteThought,
  deleteThoughtType,
  linkThoughts,
  markThoughtVisited,
  renameThought,
  setHomeThought,
  setLinkLabel,
  setThoughtNote,
  setThoughtTags,
  setThoughtType,
  unlinkThoughts,
  type CreateThoughtInput,
} from "@/lib/brain/mutations";
import { searchThoughts } from "@/lib/brain/queries";
import type { LinkRelation } from "@/lib/brain/links";
import type { ThoughtSearchHit } from "@/lib/brain/types";
import { run, runQuery, type ActionResult, type QueryResult } from "@/app/actionResult";

export async function createThoughtAction(
  input: CreateThoughtInput,
): Promise<ActionResult> {
  return run((userId) => createThought(userId, input));
}

export async function renameThoughtAction(
  thoughtId: string,
  name: string,
): Promise<ActionResult> {
  return run((userId) => renameThought(userId, thoughtId, name));
}

/** Autosaves while the note is open, so it must not re-render the page under the editor. */
export async function setThoughtNoteAction(
  thoughtId: string,
  note: string,
): Promise<ActionResult> {
  return run((userId) => setThoughtNote(userId, thoughtId, note), { revalidate: [] });
}

export async function setThoughtTypeAction(
  thoughtId: string,
  typeId: string | null,
): Promise<ActionResult> {
  return run((userId) => setThoughtType(userId, thoughtId, typeId));
}

export async function setThoughtTagsAction(
  thoughtId: string,
  names: string[],
): Promise<ActionResult> {
  return run((userId) => setThoughtTags(userId, thoughtId, names));
}

export async function setHomeThoughtAction(
  thoughtId: string | null,
): Promise<ActionResult> {
  return run((userId) => setHomeThought(userId, thoughtId));
}

export async function deleteThoughtAction(thoughtId: string): Promise<ActionResult> {
  return run((userId) => deleteThought(userId, thoughtId));
}

export async function linkThoughtsAction(
  thoughtId: string,
  relation: LinkRelation,
  otherId: string,
): Promise<ActionResult> {
  return run((userId) => linkThoughts(userId, thoughtId, relation, otherId));
}

export async function unlinkThoughtsAction(
  a: string,
  b: string,
): Promise<ActionResult> {
  return run((userId) => unlinkThoughts(userId, a, b));
}

export async function setLinkLabelAction(
  linkId: string,
  label: string,
): Promise<ActionResult> {
  return run((userId) => setLinkLabel(userId, linkId, label));
}

export async function createThoughtTypeAction(input: {
  name: string;
  color: number;
}): Promise<ActionResult> {
  return run((userId) => createThoughtType(userId, input));
}

export async function deleteThoughtTypeAction(typeId: string): Promise<ActionResult> {
  return run((userId) => deleteThoughtType(userId, typeId));
}

/** Stamps the Recent list. Revalidates nothing: visiting must not re-render the plex. */
export async function markThoughtVisitedAction(
  thoughtId: string,
): Promise<ActionResult> {
  return run((userId) => markThoughtVisited(userId, thoughtId), { revalidate: [] });
}

export async function searchThoughtsAction(
  query: string,
): Promise<QueryResult<ThoughtSearchHit[]>> {
  return runQuery((userId) => searchThoughts(userId, query));
}
