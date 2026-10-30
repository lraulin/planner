import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bankConnections, googleCalendarLinks, users } from "@/db/schema";
import type { SyncResult } from "@/lib/banksync/sync";
import type { MirrorWindow } from "@/lib/google/mirror";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import {
  bankSyncUserIds,
  calendarSyncUserIds,
  runBankSyncJob,
  runCalendarSyncJob,
} from "./jobs";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("cron jobs");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ email: `cron-test-${crypto.randomUUID()}@localhost`, name: "Cron Test" })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

async function addBankConnection(userId: string): Promise<void> {
  await db
    .insert(bankConnections)
    .values({ userId, accessUrl: "https://user:pass@bridge.invalid/simplefin" });
}

async function addCalendar(userId: string, syncEnabled: boolean): Promise<void> {
  await db
    .insert(googleCalendarLinks)
    .values({ userId, calendarId: `cal-${crypto.randomUUID()}`, syncEnabled });
}

const emptyBank: SyncResult = {
  connections: [],
  reclassified: false,
  auditBatchId: null,
};

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

describeDb("scheduled syncs", () => {
  it("bank sync runs once for each user with a connection and for nobody else", async () => {
    const twoConnections = await makeUser();
    const oneConnection = await makeUser();
    const none = await makeUser();
    await addBankConnection(twoConnections);
    await addBankConnection(twoConnections);
    await addBankConnection(oneConnection);

    const ids = await bankSyncUserIds();
    expect(ids).toEqual(expect.arrayContaining([twoConnections, oneConnection]));
    expect(ids).not.toContain(none);
    expect(ids.filter((id) => id === twoConnections)).toHaveLength(1);

    const synced: string[] = [];
    const report = await runBankSyncJob({
      syncAll: (userId) => {
        synced.push(userId);
        return Promise.resolve(emptyBank);
      },
    });

    expect(synced.filter((id) => id === twoConnections)).toHaveLength(1);
    expect(synced).toContain(oneConnection);
    expect(synced).not.toContain(none);
    expect(report.job).toBe("bank-sync");
  });

  it("one user's failure is reported and does not stop the next user's sync", async () => {
    const broken = await makeUser();
    const healthy = await makeUser();
    await addBankConnection(broken);
    await addBankConnection(healthy);

    const report = await runBankSyncJob({
      syncAll: (userId) =>
        userId === broken
          ? Promise.reject(new Error("bridge down"))
          : Promise.resolve(emptyBank),
    });

    expect(report.ok).toBe(false);
    expect(report.users.find((user) => user.userId === broken)).toEqual({
      userId: broken,
      ok: false,
      error: "bridge down",
    });
    expect(report.users.find((user) => user.userId === healthy)).toMatchObject({
      ok: true,
    });
  });

  it("calendar sync covers only users with an enabled calendar, with the clock's window", async () => {
    const enabled = await makeUser();
    const disabledOnly = await makeUser();
    await addCalendar(enabled, true);
    await addCalendar(enabled, false);
    await addCalendar(disabledOnly, false);

    const ids = await calendarSyncUserIds();
    expect(ids).toContain(enabled);
    expect(ids).not.toContain(disabledOnly);

    const calls = new Map<string, MirrorWindow>();
    const now = new Date(2026, 9, 28, 6, 0);
    const report = await runCalendarSyncJob(now, {
      syncWindow: (userId, window) => {
        calls.set(userId, window);
        return Promise.resolve(
          userId === enabled
            ? { state: "failed", message: "calendar 404" }
            : { state: "ok", inserted: 0, updated: 0, deleted: 0 },
        );
      },
    });

    expect(calls.has(disabledOnly)).toBe(false);
    const window = calls.get(enabled);
    expect(window && window.start < now && window.end > now).toBe(true);
    expect(report.ok).toBe(false);
    expect(report.users.find((user) => user.userId === enabled)).toMatchObject({
      ok: false,
      result: { state: "failed" },
    });
  });
});
