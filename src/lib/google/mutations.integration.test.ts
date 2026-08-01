import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appointments, users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import type { GoogleCalendarListEntry } from "./client";
import {
  clearCalendarLinks,
  markCalendarsSynced,
  refreshCalendarLinks,
  setCalendarSyncEnabled,
} from "./mutations";
import {
  enabledCalendarLinks,
  listCalendarLinks,
  pushTargetCalendarId,
  syncIsStale,
} from "./queries";

/**
 * Integration tests against the local Postgres (`npm run db:up`), following the harness in
 * `src/lib/schedule/mutations.integration.test.ts`. Each test works under its own user.
 *
 * The cross-user block is the point of this file as much as the happy paths: every
 * function here takes a `userId` and must scope by it, and a dropped `userId` in a `where`
 * clause is invisible when only one user ever exists.
 */

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("google calendar links");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ email: `test-${crypto.randomUUID()}@localhost`, name: "Test User" })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

function entry(over: Partial<GoogleCalendarListEntry> = {}): GoogleCalendarListEntry {
  return { id: "personal@example.com", summary: "Personal", ...over };
}

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

describeDb("refreshCalendarLinks", () => {
  it("stores the calendars Google reports", async () => {
    const userId = await makeUser();
    await refreshCalendarLinks(userId, [
      entry({ id: "a@x", summary: "Personal", primary: true, backgroundColor: "#fff" }),
      entry({ id: "b@x", summary: "Work" }),
    ]);

    const links = await listCalendarLinks(userId);
    expect(links.map((l) => l.calendarId).sort()).toEqual(["a@x", "b@x"]);
    expect(links.find((l) => l.calendarId === "a@x")?.isPrimary).toBe(true);
  });

  it("enables the primary calendar and nothing else on first connect", async () => {
    // Mirroring every shared and holiday calendar by default would flood the week grid.
    const userId = await makeUser();
    await refreshCalendarLinks(userId, [
      entry({ id: "a@x", primary: true }),
      entry({ id: "holidays@x", summary: "Holidays" }),
    ]);

    const enabled = await enabledCalendarLinks(userId);
    expect(enabled.map((l) => l.calendarId)).toEqual(["a@x"]);
  });

  it("never overwrites the user's sync choice on a later refresh", async () => {
    // The invariant that matters: a refresh re-enabling a calendar someone deliberately
    // turned off (or disabling one they turned on) reads as the app ignoring them.
    const userId = await makeUser();
    await refreshCalendarLinks(userId, [
      entry({ id: "a@x", primary: true }),
      entry({ id: "b@x", summary: "Work" }),
    ]);
    await setCalendarSyncEnabled(userId, "a@x", false);
    await setCalendarSyncEnabled(userId, "b@x", true);

    await refreshCalendarLinks(userId, [
      entry({ id: "a@x", primary: true, summary: "Personal renamed" }),
      entry({ id: "b@x", summary: "Work" }),
    ]);

    const links = await listCalendarLinks(userId);
    expect(links.find((l) => l.calendarId === "a@x")?.syncEnabled).toBe(false);
    expect(links.find((l) => l.calendarId === "b@x")?.syncEnabled).toBe(true);
    // Google-owned fields do refresh.
    expect(links.find((l) => l.calendarId === "a@x")?.summary).toBe("Personal renamed");
  });

  it("drops calendars that disappeared from Google", async () => {
    const userId = await makeUser();
    await refreshCalendarLinks(userId, [entry({ id: "a@x" }), entry({ id: "b@x" })]);
    await refreshCalendarLinks(userId, [entry({ id: "a@x" })]);

    const links = await listCalendarLinks(userId);
    expect(links.map((l) => l.calendarId)).toEqual(["a@x"]);
  });

  it("is idempotent — refreshing twice does not duplicate rows", async () => {
    const userId = await makeUser();
    await refreshCalendarLinks(userId, [entry()]);
    await refreshCalendarLinks(userId, [entry()]);
    expect(await listCalendarLinks(userId)).toHaveLength(1);
  });
});

describeDb("disabling a calendar", () => {
  /** A mirrored row as the sync would have written it. */
  async function mirrorRow(userId: string, calendarId: string, externalId: string) {
    const [row] = await db
      .insert(appointments)
      .values({
        userId,
        subject: `Event ${externalId}`,
        startAt: new Date(2026, 6, 28, 9, 0),
        endAt: new Date(2026, 6, 28, 10, 0),
        externalSource: "google",
        externalId,
        externalCalendarId: calendarId,
      })
      .returning();
    return row;
  }

  it("removes that calendar's mirrored events", async () => {
    // The sweep in planMirror cannot do this: it only reaps calendars it fetched, and a
    // disabled calendar is never fetched. Without this the events would linger forever.
    const userId = await makeUser();
    await refreshCalendarLinks(userId, [
      entry({ id: "a@x", primary: true }),
      entry({ id: "b@x", summary: "Work" }),
    ]);
    await setCalendarSyncEnabled(userId, "b@x", true);
    await mirrorRow(userId, "a@x", "keep1");
    await mirrorRow(userId, "b@x", "drop1");

    await setCalendarSyncEnabled(userId, "b@x", false);

    const left = await db
      .select()
      .from(appointments)
      .where(eq(appointments.userId, userId));
    expect(left.map((r) => r.externalId)).toEqual(["keep1"]);
  });

  it("leaves planner-native appointments alone", async () => {
    const userId = await makeUser();
    await refreshCalendarLinks(userId, [entry({ id: "a@x", primary: true })]);
    await db.insert(appointments).values({
      userId,
      subject: "Mine",
      startAt: new Date(2026, 6, 28, 9, 0),
      endAt: new Date(2026, 6, 28, 10, 0),
    });

    await setCalendarSyncEnabled(userId, "a@x", false);

    const left = await db
      .select()
      .from(appointments)
      .where(eq(appointments.userId, userId));
    expect(left.map((r) => r.subject)).toEqual(["Mine"]);
  });

  it("does not delete another user's events for the same calendar id", async () => {
    // A shared calendar has the same id for both people; the delete must still be scoped.
    const ownerId = await makeUser();
    const otherId = await makeUser();
    for (const id of [ownerId, otherId]) {
      await refreshCalendarLinks(id, [entry({ id: "shared@x", primary: true })]);
    }
    await mirrorRow(ownerId, "shared@x", "owner1");
    await mirrorRow(otherId, "shared@x", "other1");

    await setCalendarSyncEnabled(ownerId, "shared@x", false);

    const otherLeft = await db
      .select()
      .from(appointments)
      .where(eq(appointments.userId, otherId));
    expect(otherLeft.map((r) => r.externalId)).toEqual(["other1"]);
  });
});

describeDb("pushTargetCalendarId", () => {
  it("is the primary calendar", async () => {
    const userId = await makeUser();
    await refreshCalendarLinks(userId, [
      entry({ id: "a@x", primary: true }),
      entry({ id: "b@x" }),
    ]);
    expect(await pushTargetCalendarId(userId)).toBe("a@x");
  });

  it("is null before any calendar list has been fetched", async () => {
    // Callers must not fall back to the literal "primary" alias — writing to a calendar
    // the user has never seen listed is how events land somewhere surprising.
    expect(await pushTargetCalendarId(await makeUser())).toBeNull();
  });
});

describeDb("syncIsStale", () => {
  it("is stale when an enabled calendar has never synced", async () => {
    const userId = await makeUser();
    await refreshCalendarLinks(userId, [entry({ primary: true })]);
    expect(await syncIsStale(userId, 5 * 60_000)).toBe(true);
  });

  it("is fresh right after a sync and stale once the window passes", async () => {
    const userId = await makeUser();
    await refreshCalendarLinks(userId, [entry({ id: "a@x", primary: true })]);

    await markCalendarsSynced(userId, ["a@x"], new Date());
    expect(await syncIsStale(userId, 5 * 60_000)).toBe(false);

    await markCalendarsSynced(userId, ["a@x"], new Date(Date.now() - 10 * 60_000));
    expect(await syncIsStale(userId, 5 * 60_000)).toBe(true);
  });

  it("is fresh with no enabled calendars, so /schedule skips the network", async () => {
    const userId = await makeUser();
    await refreshCalendarLinks(userId, [entry({ id: "a@x" })]);
    expect(await syncIsStale(userId, 5 * 60_000)).toBe(false);
  });
});

describeDb("cross-user isolation", () => {
  it("does not let one user read, change, or delete another's calendar links", async () => {
    const ownerId = await makeUser();
    const intruderId = await makeUser();

    await refreshCalendarLinks(ownerId, [
      entry({ id: "owner@x", summary: "Owner", primary: true }),
    ]);

    // Read
    expect(await listCalendarLinks(intruderId)).toEqual([]);
    expect(await enabledCalendarLinks(intruderId)).toEqual([]);
    expect(await pushTargetCalendarId(intruderId)).toBeNull();

    // Change — by calendar id, which the intruder could plausibly guess
    await expect(setCalendarSyncEnabled(intruderId, "owner@x", false)).rejects.toThrow(
      /not found/i,
    );
    await markCalendarsSynced(intruderId, ["owner@x"], new Date());

    // Delete
    await clearCalendarLinks(intruderId);

    // The owner's row is untouched by every one of those.
    const ownerLinks = await listCalendarLinks(ownerId);
    expect(ownerLinks).toHaveLength(1);
    expect(ownerLinks[0].syncEnabled).toBe(true);
    expect(ownerLinks[0].lastSyncedAt).toBeNull();
  });

  it("keeps two users' identical calendar ids apart", async () => {
    // A shared calendar legitimately appears in both users' lists under the same id; the
    // unique index is on (user_id, calendar_id) precisely so that is not a collision.
    const firstId = await makeUser();
    const secondId = await makeUser();

    await refreshCalendarLinks(firstId, [entry({ id: "shared@x", primary: true })]);
    await refreshCalendarLinks(secondId, [entry({ id: "shared@x" })]);

    await setCalendarSyncEnabled(firstId, "shared@x", false);

    expect((await listCalendarLinks(firstId))[0].syncEnabled).toBe(false);
    expect((await listCalendarLinks(secondId))[0].syncEnabled).toBe(false);
    expect(await listCalendarLinks(firstId)).toHaveLength(1);
    expect(await listCalendarLinks(secondId)).toHaveLength(1);
  });
});
