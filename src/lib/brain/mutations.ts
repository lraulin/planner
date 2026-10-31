import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import type { DbExecutor } from "@/db/executor";
import {
  brainLinks,
  brainTags,
  brainThoughtTags,
  brainThoughtTypes,
  brainThoughts,
} from "@/db/schema";
import { ownedRow, requireOwnedRow } from "@/lib/db/owned";
import { canonicalLink, planLink, type LinkRelation } from "./links";

/** Brain is standalone per-user data. Every write scopes by `userId`. */

const NAME_MAX = 200;
const LABEL_MAX = 100;
const PALETTE_SIZE = 8;

function cleanName(raw: string, what: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) throw new Error(`${what} cannot be empty.`);
  if (name.length > NAME_MAX) throw new Error(`${what} is too long.`);
  return name;
}

async function requireThought(tx: DbExecutor, userId: string, thoughtId: string) {
  await requireOwnedRow(tx, brainThoughts, thoughtId, userId, "Thought not found.");
}

async function requireType(tx: DbExecutor, userId: string, typeId: string) {
  await requireOwnedRow(
    tx,
    brainThoughtTypes,
    typeId,
    userId,
    "Thought type not found.",
  );
}

function pairWhere(userId: string, a: string, b: string) {
  return and(
    eq(brainLinks.userId, userId),
    or(
      and(eq(brainLinks.fromId, a), eq(brainLinks.toId, b)),
      and(eq(brainLinks.fromId, b), eq(brainLinks.toId, a)),
    ),
  );
}

/** Link two thoughts, or change how they are already linked — one row per pair. */
async function linkIn(
  tx: DbExecutor,
  userId: string,
  thoughtId: string,
  relation: LinkRelation,
  otherId: string,
  label?: string,
): Promise<string> {
  const wanted = canonicalLink(thoughtId, relation, otherId);
  await requireThought(tx, userId, thoughtId);
  await requireThought(tx, userId, otherId);

  const [existing] = await tx
    .select({
      id: brainLinks.id,
      fromId: brainLinks.fromId,
      toId: brainLinks.toId,
      kind: brainLinks.kind,
    })
    .from(brainLinks)
    .where(pairWhere(userId, thoughtId, otherId))
    .limit(1);
  const plan = planLink(wanted, existing ?? null);

  const cleanLabel = label === undefined ? undefined : cleanLabelText(label);
  if (plan.action === "insert") {
    const [row] = await tx
      .insert(brainLinks)
      .values({ userId, ...plan.link, label: cleanLabel ?? "" })
      .returning({ id: brainLinks.id });
    return row.id;
  }
  if (plan.action === "update") {
    await tx
      .update(brainLinks)
      .set({ ...plan.link, ...(cleanLabel === undefined ? {} : { label: cleanLabel }) })
      .where(ownedRow(brainLinks, plan.id, userId));
    return plan.id;
  }
  if (cleanLabel !== undefined) {
    await tx
      .update(brainLinks)
      .set({ label: cleanLabel })
      .where(ownedRow(brainLinks, plan.id, userId));
  }
  return plan.id;
}

function cleanLabelText(raw: string): string {
  const label = raw.trim();
  if (label.length > LABEL_MAX) throw new Error("Link label is too long.");
  return label;
}

export type CreateThoughtInput = {
  name: string;
  note?: string;
  /** Create already linked to an existing thought; `relation` is what that thought is to the new one. */
  linkTo?: { thoughtId: string; relation: LinkRelation; label?: string };
  typeId?: string;
  tags?: string[];
  /** Retry safety for agents: the same source+id returns the thought it already made. */
  external?: { source: string; id: string };
};

export async function createThought(
  userId: string,
  input: CreateThoughtInput,
): Promise<{ id: string; created: boolean }> {
  const name = cleanName(input.name, "Thought name");
  return db.transaction(async (tx) => {
    if (input.external) {
      const [existing] = await tx
        .select({ id: brainThoughts.id })
        .from(brainThoughts)
        .where(
          and(
            eq(brainThoughts.userId, userId),
            eq(brainThoughts.externalSource, input.external.source),
            eq(brainThoughts.externalId, input.external.id),
          ),
        )
        .limit(1);
      if (existing) return { id: existing.id, created: false };
    }
    if (input.linkTo) await requireThought(tx, userId, input.linkTo.thoughtId);
    if (input.typeId) await requireType(tx, userId, input.typeId);

    const [row] = await tx
      .insert(brainThoughts)
      .values({
        userId,
        name,
        note: input.note ?? "",
        typeId: input.typeId ?? null,
        externalSource: input.external?.source ?? null,
        externalId: input.external?.id ?? null,
      })
      .returning({ id: brainThoughts.id });

    if (input.linkTo) {
      await linkIn(
        tx,
        userId,
        row.id,
        input.linkTo.relation,
        input.linkTo.thoughtId,
        input.linkTo.label,
      );
    }
    if (input.tags?.length) await tagsIn(tx, userId, row.id, input.tags);
    return { id: row.id, created: true };
  });
}

async function touch(tx: DbExecutor, userId: string, thoughtId: string, set: object) {
  const rows = await tx
    .update(brainThoughts)
    .set({ ...set, updatedAt: sql`now()` })
    .where(ownedRow(brainThoughts, thoughtId, userId))
    .returning({ id: brainThoughts.id });
  if (rows.length === 0) throw new Error("Thought not found.");
}

export async function renameThought(userId: string, thoughtId: string, name: string) {
  await touch(db, userId, thoughtId, { name: cleanName(name, "Thought name") });
}

export async function setThoughtNote(userId: string, thoughtId: string, note: string) {
  await touch(db, userId, thoughtId, { note });
}

export async function setThoughtType(
  userId: string,
  thoughtId: string,
  typeId: string | null,
) {
  await db.transaction(async (tx) => {
    if (typeId) await requireType(tx, userId, typeId);
    await touch(tx, userId, thoughtId, { typeId });
  });
}

/** Make this the Home thought, or pass null to clear Home. */
export async function setHomeThought(userId: string, thoughtId: string | null) {
  await db.transaction(async (tx) => {
    if (thoughtId) await requireThought(tx, userId, thoughtId);
    await tx
      .update(brainThoughts)
      .set({ isHome: false })
      .where(and(eq(brainThoughts.userId, userId), eq(brainThoughts.isHome, true)));
    if (thoughtId) {
      await tx
        .update(brainThoughts)
        .set({ isHome: true })
        .where(ownedRow(brainThoughts, thoughtId, userId));
    }
  });
}

export async function markThoughtVisited(userId: string, thoughtId: string) {
  await db
    .update(brainThoughts)
    .set({ lastVisitedAt: sql`now()` })
    .where(ownedRow(brainThoughts, thoughtId, userId));
}

export async function deleteThought(userId: string, thoughtId: string) {
  const rows = await db
    .delete(brainThoughts)
    .where(ownedRow(brainThoughts, thoughtId, userId))
    .returning({ id: brainThoughts.id });
  if (rows.length === 0) throw new Error("Thought not found.");
}

async function tagsIn(
  tx: DbExecutor,
  userId: string,
  thoughtId: string,
  names: string[],
) {
  const wanted = [...new Set(names.map((n) => cleanName(n, "Tag name")))];
  await requireThought(tx, userId, thoughtId);
  if (wanted.length > 0) {
    await tx
      .insert(brainTags)
      .values(wanted.map((name) => ({ userId, name })))
      .onConflictDoNothing();
  }
  const tagRows =
    wanted.length === 0
      ? []
      : await tx
          .select({ id: brainTags.id })
          .from(brainTags)
          .where(and(eq(brainTags.userId, userId), inArray(brainTags.name, wanted)));
  await tx
    .delete(brainThoughtTags)
    .where(
      and(
        eq(brainThoughtTags.userId, userId),
        eq(brainThoughtTags.thoughtId, thoughtId),
      ),
    );
  if (tagRows.length > 0) {
    await tx
      .insert(brainThoughtTags)
      .values(tagRows.map((t) => ({ userId, thoughtId, tagId: t.id })));
  }
}

/** Replace the thought's tags with exactly these names, creating any that are new. */
export async function setThoughtTags(
  userId: string,
  thoughtId: string,
  names: string[],
) {
  await db.transaction((tx) => tagsIn(tx, userId, thoughtId, names));
}

/** Link `thoughtId` to `otherId`; `relation` says what `otherId` is to `thoughtId`. */
export async function linkThoughts(
  userId: string,
  thoughtId: string,
  relation: LinkRelation,
  otherId: string,
  label?: string,
): Promise<string> {
  return db.transaction((tx) =>
    linkIn(tx, userId, thoughtId, relation, otherId, label),
  );
}

export async function unlinkThoughts(userId: string, a: string, b: string) {
  const rows = await db
    .delete(brainLinks)
    .where(pairWhere(userId, a, b))
    .returning({ id: brainLinks.id });
  if (rows.length === 0) throw new Error("Link not found between those thoughts.");
}

export async function setLinkLabel(userId: string, linkId: string, label: string) {
  const rows = await db
    .update(brainLinks)
    .set({ label: cleanLabelText(label) })
    .where(ownedRow(brainLinks, linkId, userId))
    .returning({ id: brainLinks.id });
  if (rows.length === 0) throw new Error("Link not found.");
}

function requireColor(color: number) {
  if (!Number.isInteger(color) || color < 0 || color >= PALETTE_SIZE) {
    throw new Error(`Color must be a whole number from 0 to ${PALETTE_SIZE - 1}.`);
  }
}

export async function createThoughtType(
  userId: string,
  input: { name: string; color: number },
): Promise<string> {
  requireColor(input.color);
  const [row] = await db
    .insert(brainThoughtTypes)
    .values({ userId, name: cleanName(input.name, "Type name"), color: input.color })
    .onConflictDoUpdate({
      target: [brainThoughtTypes.userId, brainThoughtTypes.name],
      set: { color: input.color },
    })
    .returning({ id: brainThoughtTypes.id });
  return row.id;
}

/** Delete a type; its thoughts keep existing, untyped. */
export async function deleteThoughtType(userId: string, typeId: string) {
  await db.transaction(async (tx) => {
    await requireType(tx, userId, typeId);
    await tx
      .update(brainThoughts)
      .set({ typeId: null })
      .where(and(eq(brainThoughts.userId, userId), eq(brainThoughts.typeId, typeId)));
    await tx
      .delete(brainThoughtTypes)
      .where(ownedRow(brainThoughtTypes, typeId, userId));
  });
}
