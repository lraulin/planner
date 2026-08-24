import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { financeTags } from "@/db/schema";
import { normalizeTagInput } from "../tags";
import { listFinanceTags, usedFinanceTags, type FinanceTagRow } from "./queries";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export type FinanceTagEdit = {
  color?: string | null;
  description?: string;
  hidden?: boolean;
};

function colorValue(color: string | null | undefined): string | null | undefined {
  if (color === undefined) return undefined;
  if (color === null || color.trim() === "") return null;
  const value = color.trim();
  if (!HEX_COLOR.test(value))
    throw new Error("A tag color must be a six-digit hex color.");
  return value.toLowerCase();
}

async function requireTag(userId: string, tagId: string) {
  const [row] = await db
    .select({ id: financeTags.id })
    .from(financeTags)
    .where(and(eq(financeTags.userId, userId), eq(financeTags.id, tagId)))
    .limit(1);
  if (!row) throw new Error("That tag does not exist.");
}

/** Add metadata, or revive/update the exact same case-sensitive tag. */
export async function createFinanceTag(
  userId: string,
  input: { tag: string; color?: string | null; description?: string },
): Promise<FinanceTagRow> {
  const tag = normalizeTagInput(input.tag);
  const color = colorValue(input.color) ?? null;
  const description = input.description ?? "";
  const [row] = await db
    .insert(financeTags)
    .values({ userId, tag, color, description })
    .onConflictDoUpdate({
      target: [financeTags.userId, financeTags.tag],
      set: { color, description, hidden: false, updatedAt: new Date() },
    })
    .returning({ id: financeTags.id });
  if (!row) throw new Error("Could not save that tag.");
  const saved = (await listFinanceTags(userId)).find((entry) => entry.id === row.id);
  if (!saved) throw new Error("Could not read the saved tag.");
  return saved;
}

export async function updateFinanceTag(
  userId: string,
  tagId: string,
  edit: FinanceTagEdit,
): Promise<void> {
  await requireTag(userId, tagId);
  const color = colorValue(edit.color);
  await db
    .update(financeTags)
    .set({
      ...(color !== undefined ? { color } : {}),
      ...(edit.description !== undefined ? { description: edit.description } : {}),
      ...(edit.hidden !== undefined ? { hidden: edit.hidden } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(financeTags.userId, userId), eq(financeTags.id, tagId)));
}

/** Metadata only. Transaction Notes deliberately remain untouched. */
export async function deleteFinanceTag(userId: string, tagId: string): Promise<void> {
  await requireTag(userId, tagId);
  await db
    .delete(financeTags)
    .where(and(eq(financeTags.userId, userId), eq(financeTags.id, tagId)));
}

/** Materialize metadata for every currently used unmanaged token. */
export async function discoverFinanceTags(userId: string): Promise<FinanceTagRow[]> {
  const used = await usedFinanceTags(userId);
  if (used.length > 0) {
    await db
      .insert(financeTags)
      .values(used.map((tag) => ({ userId, tag })))
      .onConflictDoNothing({ target: [financeTags.userId, financeTags.tag] });
  }
  return listFinanceTags(userId);
}
