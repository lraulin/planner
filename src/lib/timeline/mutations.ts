import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { lifeEvents, type ExternalRef } from "@/db/schema";
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
  return (await createLifeEventOnce(userId, input)).id;
}

export async function createLifeEventOnce(
  userId: string,
  input: LifeEventInput & { eventDate: string },
  external?: ExternalRef,
): Promise<{ id: string; created: boolean }> {
  const text: Record<string, unknown> = {};
  patchText(text, input, TEXT_FIELDS);
  const eventDate = requireDateKey(input.eventDate, "Date");

  return db.transaction(async (tx) => {
    if (external) {
      const [existing] = await tx
        .select({ id: lifeEvents.id })
        .from(lifeEvents)
        .where(
          and(
            eq(lifeEvents.userId, userId),
            eq(lifeEvents.externalSource, external.source),
            eq(lifeEvents.externalId, external.id),
          ),
        )
        .limit(1);
      if (existing) return { id: existing.id, created: false };
    }

    const [row] = await tx
      .insert(lifeEvents)
      .values({
        userId,
        ...text,
        eventDate,
        externalSource: external?.source ?? null,
        externalId: external?.id ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: lifeEvents.id });

    if (row) return { id: row.id, created: true };
    if (!external) throw new Error("Event could not be created.");
    const [existing] = await tx
      .select({ id: lifeEvents.id })
      .from(lifeEvents)
      .where(
        and(
          eq(lifeEvents.userId, userId),
          eq(lifeEvents.externalSource, external.source),
          eq(lifeEvents.externalId, external.id),
        ),
      )
      .limit(1);
    if (!existing) throw new Error("Event could not be created.");
    return { id: existing.id, created: false };
  });
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
