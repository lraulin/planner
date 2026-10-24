/**
 * Agent tools over Brain, the PersonalBrain-style thought network: list, read, create,
 * update, link, unlink and delete.
 *
 * Handlers call only `src/lib/brain/{queries,mutations}` — never the database directly,
 * never a server action. Thoughts are standalone: nothing here points at a Note, Contact or
 * outline node.
 */

import {
  createThought,
  deleteThought,
  linkThoughts,
  renameThought,
  setHomeThought,
  setThoughtNote,
  setThoughtTags,
  setThoughtType,
  unlinkThoughts,
} from "@/lib/brain/mutations";
import type { LinkRelation } from "@/lib/brain/links";
import { neighbourhood } from "@/lib/brain/neighbourhood";
import { listThoughts, listTypes, loadPlex, searchThoughts } from "@/lib/brain/queries";
import { AgentError } from "./errors";
import { pageBounds, paginate } from "./pagination";
import {
  optionalBoolean,
  optionalExternalRef,
  optionalNumber,
  optionalString,
  optionalStringArray,
  requireString,
} from "./parse";

const RELATIONS: readonly LinkRelation[] = ["parent", "child", "jump"];

function parseRelation(value: unknown): LinkRelation {
  if (typeof value !== "string" || !RELATIONS.includes(value as LinkRelation)) {
    throw new AgentError(
      "validation",
      `relation must be one of: ${RELATIONS.join(", ")}`,
    );
  }
  return value as LinkRelation;
}

/** A type's id from its name, or null to clear. Unknown names list what exists. */
async function resolveType(
  userId: string,
  name: string | null,
): Promise<string | null> {
  if (name === null) return null;
  const types = await listTypes(userId);
  const found = types.find((t) => t.name.toLowerCase() === name.trim().toLowerCase());
  if (found) return found.id;
  const known = types.map((t) => t.name).join(", ") || "none yet";
  throw new AgentError(
    "validation",
    `Unknown thought type "${name}". Existing types: ${known}. Types are created on the Brain page.`,
  );
}

async function thoughtDetail(userId: string, id: string) {
  const plex = await loadPlex(userId, id);
  if (!plex) throw new AgentError("not_found", `Thought not found: ${id}`);
  const hood = neighbourhood(plex.active.id, plex.links);
  const labels = new Map(plex.links.map((l) => [l.id, l.label]));
  const nameOf = (thoughtId: string) => plex.thoughts[thoughtId]?.name ?? "";
  const linked = (list: { thoughtId: string; linkId: string }[]) =>
    list.map((n) => ({
      id: n.thoughtId,
      name: nameOf(n.thoughtId),
      label: labels.get(n.linkId) ?? "",
    }));
  const types = plex.active.typeId ? await listTypes(userId) : [];
  return {
    id: plex.active.id,
    name: plex.active.name,
    note: plex.active.note,
    type: types.find((t) => t.id === plex.active.typeId)?.name ?? null,
    tags: plex.active.tags,
    isHome: plex.active.isHome,
    parents: linked(hood.parents),
    children: linked(hood.children),
    jumps: linked(hood.jumps),
    siblings: hood.siblings.map((s) => ({
      id: s.thoughtId,
      name: nameOf(s.thoughtId),
    })),
  };
}

export async function listThoughtsTool(userId: string, args: Record<string, unknown>) {
  const bounds = pageBounds(
    optionalNumber(args, "offset"),
    optionalNumber(args, "limit"),
  );
  const query = optionalString(args, "query")?.trim();
  const [types, all, hits] = await Promise.all([
    listTypes(userId),
    listThoughts(userId),
    query ? searchThoughts(userId, query, 200) : null,
  ]);
  const typeName = new Map(types.map((t) => [t.id, t.name]));
  const byId = new Map(all.map((t) => [t.id, t]));
  // Search order (name hits first) is kept; the list supplies the Home flag.
  const rows = hits ? hits.flatMap((hit) => byId.get(hit.id) ?? []) : all;

  const page = paginate(rows, bounds);
  return {
    thoughts: page.items.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.typeId ? (typeName.get(row.typeId) ?? null) : null,
      isHome: row.isHome,
    })),
    pageInfo: page.pageInfo,
  };
}

export async function getThoughtTool(userId: string, args: Record<string, unknown>) {
  return { thought: await thoughtDetail(userId, requireString(args, "id")) };
}

export async function createThoughtTool(userId: string, args: Record<string, unknown>) {
  const name = requireString(args, "name");
  const linkToId = optionalString(args, "linkToId");
  const relationArg = args.relation;
  if ((linkToId === undefined) !== (relationArg === undefined)) {
    throw new AgentError(
      "validation",
      "linkToId and relation must be provided together",
    );
  }
  const typeName = optionalString(args, "type");
  const typeId =
    typeName === undefined ? undefined : await resolveType(userId, typeName);

  const result = await createThought(userId, {
    name,
    note: optionalString(args, "note"),
    typeId: typeId ?? undefined,
    tags: optionalStringArray(args, "tags"),
    linkTo:
      linkToId === undefined
        ? undefined
        : {
            thoughtId: linkToId,
            relation: parseRelation(relationArg),
            label: optionalString(args, "label"),
          },
    external: optionalExternalRef(args),
  });
  return { thought: await thoughtDetail(userId, result.id), created: result.created };
}

export async function updateThoughtTool(userId: string, args: Record<string, unknown>) {
  const id = requireString(args, "id");
  const name = optionalString(args, "name");
  const note = optionalString(args, "note");
  const tags = optionalStringArray(args, "tags");
  const home = optionalBoolean(args, "home");
  const typeProvided = "type" in args && args.type !== undefined;
  if (
    name === undefined &&
    note === undefined &&
    tags === undefined &&
    home === undefined &&
    !typeProvided
  ) {
    throw new AgentError("validation", "Provide at least one field to update");
  }
  if (typeProvided && args.type !== null && typeof args.type !== "string") {
    throw new AgentError("validation", "type must be a string or null");
  }

  const current = await thoughtDetail(userId, id);
  // Resolve before the first write, so an unknown type changes nothing.
  const typeId = typeProvided
    ? await resolveType(userId, args.type as string | null)
    : undefined;

  if (name !== undefined) await renameThought(userId, id, name);
  if (note !== undefined) await setThoughtNote(userId, id, note);
  if (typeProvided) await setThoughtType(userId, id, typeId ?? null);
  if (tags !== undefined) await setThoughtTags(userId, id, tags);
  if (home === true) await setHomeThought(userId, id);
  else if (home === false && current.isHome) await setHomeThought(userId, null);

  return { thought: await thoughtDetail(userId, id) };
}

export async function linkThoughtsTool(userId: string, args: Record<string, unknown>) {
  const id = requireString(args, "id");
  const otherId = requireString(args, "otherId");
  if (id === otherId)
    throw new AgentError("validation", "A thought cannot link to itself");
  await linkThoughts(
    userId,
    id,
    parseRelation(args.relation),
    otherId,
    optionalString(args, "label"),
  );
  return { thought: await thoughtDetail(userId, id) };
}

export async function unlinkThoughtsTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const id = requireString(args, "id");
  await unlinkThoughts(userId, id, requireString(args, "otherId"));
  return { thought: await thoughtDetail(userId, id) };
}

export async function deleteThoughtTool(userId: string, args: Record<string, unknown>) {
  const id = requireString(args, "id");
  await deleteThought(userId, id);
  return { deleted: true, id };
}
