import { eq } from "drizzle-orm";
import { db } from "@/db";
import { lifeEvents } from "@/db/schema";
import { findOwnedRow } from "@/lib/db/owned";
import type { LifeEventDetail } from "./types";

function toDetail(row: typeof lifeEvents.$inferSelect): LifeEventDetail {
  return {
    id: row.id,
    eventDate: row.eventDate,
    title: row.title,
    category: row.category,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Every life event, oldest first. `chronology.ts` merges these with the derived rows. */
export async function listLifeEvents(userId: string): Promise<LifeEventDetail[]> {
  const rows = await db
    .select()
    .from(lifeEvents)
    .where(eq(lifeEvents.userId, userId))
    .orderBy(lifeEvents.eventDate);
  return rows.map(toDetail);
}

/** One life event, scoped to the signed-in user. */
export async function getLifeEvent(
  userId: string,
  eventId: string,
): Promise<LifeEventDetail | null> {
  const row = await findOwnedRow(db, lifeEvents, eventId, userId);
  return row ? toDetail(row) : null;
}
