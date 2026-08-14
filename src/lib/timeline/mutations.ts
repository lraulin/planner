import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { lifeEvents } from "@/db/schema";
import { patchText, requireDateKey } from "@/lib/history/fields";
import type { LifeEventInput } from "./types";

/** Life events are standalone records. Every write scopes by `userId`. */

const TEXT_FIELDS = ["title", "category", "notes"] as const;

/**
 * `eventDate` is required because a life event is a date with a label on it, and one without
 * a date has nothing to be. The caller supplies today's key for a fresh row rather than
 * letting this module reach for `new Date()` — on the server that is UTC's today, and
 * `development/dates.md` forbids a rule that depends on the process timezone.
 */
export async function createLifeEvent(
  userId: string,
  input: LifeEventInput & { eventDate: string },
): Promise<string> {
  const text: Record<string, unknown> = {};
  patchText(text, input, TEXT_FIELDS);

  const [row] = await db
    .insert(lifeEvents)
    .values({
      userId,
      ...text,
      eventDate: requireDateKey(input.eventDate, "Date"),
    })
    .returning({ id: lifeEvents.id });
  return row.id;
}

export async function updateLifeEvent(
  userId: string,
  eventId: string,
  input: LifeEventInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: lifeEvents.id })
      .from(lifeEvents)
      .where(and(eq(lifeEvents.id, eventId), eq(lifeEvents.userId, userId)))
      .limit(1);
    if (!existing) throw new Error("Event not found.");

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    patchText(patch, input, TEXT_FIELDS);
    if (input.eventDate !== undefined) {
      patch.eventDate = requireDateKey(input.eventDate, "Date");
    }

    await tx
      .update(lifeEvents)
      .set(patch)
      .where(and(eq(lifeEvents.id, eventId), eq(lifeEvents.userId, userId)));
  });
}

export async function deleteLifeEvent(userId: string, eventId: string): Promise<void> {
  const deleted = await db
    .delete(lifeEvents)
    .where(and(eq(lifeEvents.id, eventId), eq(lifeEvents.userId, userId)))
    .returning({ id: lifeEvents.id });
  if (deleted.length === 0) throw new Error("Event not found.");
}
