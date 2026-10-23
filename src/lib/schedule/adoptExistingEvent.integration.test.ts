import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { appointments, users, type NewAppointment } from "@/db/schema";
import type { GoogleOwnedFields } from "@/lib/google/mapping";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { adoptExistingEvent } from "./mutations";

/**
 * `adoptExistingEvent` is what a create does when write-through finds the same event
 * already on the Google calendar (spec 2026-10-23-1200-google-inbound-sync-and-write-zone):
 * link to it rather than insert a second Google event. Same harness as
 * `mutations.integration.test.ts`; each test works under its own user.
 */

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("adopt existing Google event");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ email: `test-${crypto.randomUUID()}@localhost`, name: "Test User" })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

const startAt = new Date("2026-10-09T12:45:00Z");
const endAt = new Date("2026-10-09T14:00:00Z");

function googleCopy(externalId: string): GoogleOwnedFields {
  return {
    subject: "CAC renewal – NAS Pax River",
    location: "Bldg 2",
    notes: "conf 0013347729",
    startAt,
    endAt,
    allDay: false,
    showAs: "busy",
    colorId: null,
    externalSource: "google",
    externalId,
    externalSeriesId: null,
    externalCalendarId: "primary@x",
    externalEtag: '"1"',
    externalUpdatedAt: new Date("2026-10-05T11:48:00Z"),
  };
}

function plannerValues(userId: string): NewAppointment {
  return {
    userId,
    subject: "CAC appointment",
    location: "",
    notes: "",
    startAt,
    endAt,
    priorityLetter: "A",
    priorityRank: 1,
  };
}

async function rowsFor(userId: string, externalId: string) {
  return db
    .select()
    .from(appointments)
    .where(
      and(eq(appointments.userId, userId), eq(appointments.externalId, externalId)),
    );
}

describeDb("adoptExistingEvent", () => {
  let userId: string;
  let externalId: string;

  beforeEach(async () => {
    userId = await makeUser();
    externalId = `evt-${crypto.randomUUID()}`;
  });

  it("stores Google's copy with the planner's annotations when no mirror row exists", async () => {
    const row = await adoptExistingEvent(
      userId,
      plannerValues(userId),
      googleCopy(externalId),
      {
        priorityLetter: "A",
        priorityRank: 1,
      },
    );

    expect(row).toMatchObject({
      userId,
      subject: "CAC renewal – NAS Pax River",
      notes: "conf 0013347729",
      externalId,
      externalCalendarId: "primary@x",
      priorityLetter: "A",
      priorityRank: 1,
    });
    expect(await rowsFor(userId, externalId)).toHaveLength(1);
  });

  it("reuses the mirrored row and only applies annotations the caller passed", async () => {
    const [mirrored] = await db
      .insert(appointments)
      .values({
        ...plannerValues(userId),
        ...googleCopy(externalId),
        priorityLetter: null,
        priorityRank: null,
      })
      .returning();

    const untouched = await adoptExistingEvent(
      userId,
      plannerValues(userId),
      googleCopy(externalId),
      {},
    );
    expect(untouched.id).toBe(mirrored.id);
    expect(untouched.priorityLetter).toBeNull();

    const annotated = await adoptExistingEvent(
      userId,
      plannerValues(userId),
      googleCopy(externalId),
      { priorityLetter: "A", priorityRank: 1 },
    );
    expect(annotated.id).toBe(mirrored.id);
    expect(annotated).toMatchObject({ priorityLetter: "A", priorityRank: 1 });
    expect(annotated.subject).toBe("CAC renewal – NAS Pax River");
    expect(await rowsFor(userId, externalId)).toHaveLength(1);
  });

  it("never adopts another user's mirrored row", async () => {
    const otherUserId = await makeUser();
    const [theirs] = await db
      .insert(appointments)
      .values({ ...plannerValues(otherUserId), ...googleCopy(externalId) })
      .returning();

    const mine = await adoptExistingEvent(
      userId,
      plannerValues(userId),
      googleCopy(externalId),
      {
        priorityLetter: "B",
      },
    );

    expect(mine.id).not.toBe(theirs.id);
    expect(mine.userId).toBe(userId);
    const [stillTheirs] = await rowsFor(otherUserId, externalId);
    expect(stillTheirs.priorityLetter).toBe("A");
  });
});
