import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { createJob } from "@/lib/jobs/mutations";
import { createResidence } from "@/lib/residences/mutations";
import { loadChronology, loadLifeHistory } from "./chronology";
import {
  createLifeEvent,
  createLifeEventOnce,
  deleteLifeEvent,
  updateLifeEvent,
} from "./mutations";
import { getLifeEvent, listLifeEvents } from "./queries";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("timeline mutations");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `timeline-test-${crypto.randomUUID()}@localhost`,
      name: "Timeline Test",
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

describeDb("life event mutations", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("round-trips a date as the same key it was given", async () => {
    // The whole reason these columns are `date` and not timestamptz-at-UTC-noon: what goes in
    // is what comes out, with no encoding step to get wrong in either direction.
    const id = await createLifeEvent(userId, {
      eventDate: "2026-08-01",
      title: "Got the car",
    });
    await expect(getLifeEvent(userId, id)).resolves.toMatchObject({
      eventDate: "2026-08-01",
    });
  });

  it("refuses an event with no date", async () => {
    await expect(
      createLifeEvent(userId, { eventDate: "", title: "Someday" }),
    ).rejects.toThrow("Date is required.");
  });

  it("refuses a date that is not a date key", async () => {
    await expect(
      createLifeEvent(userId, { eventDate: "8/1/2026", title: "Got the car" }),
    ).rejects.toThrow("Date must be a date.");
  });

  it("writes only the fields supplied on update", async () => {
    const id = await createLifeEvent(userId, {
      eventDate: "2010-05-04",
      title: "Adopted Biscuit",
      category: "Pets",
      notes: "From the shelter on Elm",
    });
    await updateLifeEvent(userId, id, { category: "Family" });

    await expect(getLifeEvent(userId, id)).resolves.toMatchObject({
      title: "Adopted Biscuit",
      category: "Family",
      notes: "From the shelter on Elm",
    });
  });

  it("replays a create with the same external key instead of inserting again", async () => {
    const first = await createLifeEventOnce(
      userId,
      { eventDate: "2010-05-04", title: "Adopted Biscuit" },
      { source: "import", id: "event-1" },
    );
    const replay = await createLifeEventOnce(
      userId,
      { eventDate: "2020-01-01", title: "Different" },
      { source: "import", id: "event-1" },
    );
    expect(replay).toEqual({ id: first.id, created: false });
    expect((await getLifeEvent(userId, first.id))?.title).toBe("Adopted Biscuit");
    expect(await listLifeEvents(userId)).toHaveLength(1);
  });

  it("lets two users share the same external key", async () => {
    const otherId = await makeUser();
    const first = await createLifeEventOnce(
      userId,
      { eventDate: "2010-05-04", title: "Mine" },
      { source: "import", id: "shared" },
    );
    const second = await createLifeEventOnce(
      otherId,
      { eventDate: "2011-01-01", title: "Theirs" },
      { source: "import", id: "shared" },
    );
    expect(second.created).toBe(true);
    expect(second.id).not.toBe(first.id);
  });

  it("lists events oldest first", async () => {
    await createLifeEvent(userId, { eventDate: "2020-01-01", title: "Later" });
    await createLifeEvent(userId, { eventDate: "2010-01-01", title: "Earlier" });
    const titles = (await listLifeEvents(userId)).map((row) => row.title);
    expect(titles).toEqual(["Earlier", "Later"]);
  });
});

describeDb("chronology", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("merges events, job edges and residence edges into one ordered list", async () => {
    await createLifeEvent(userId, {
      eventDate: "2010-05-04",
      title: "Adopted Biscuit",
    });
    await createJob(userId, {
      employer: "Acme Corp",
      jobTitle: "Engineer",
      startDate: "2019-03-01",
      endDate: "2022-06-30",
    });
    await createResidence(userId, {
      city: "Seoul",
      country: "South Korea",
      movedIn: "2014-08-01",
      movedOut: "2017-02-15",
    });

    const rows = await loadChronology(userId);
    expect(rows.map((row) => [row.dateKey, row.title, row.category])).toEqual([
      ["2010-05-04", "Adopted Biscuit", ""],
      ["2014-08-01", "Moved to Seoul", "Home"],
      ["2017-02-15", "Left Seoul", "Home"],
      ["2019-03-01", "Started at Acme Corp", "Work"],
      ["2022-06-30", "Left Acme Corp", "Work"],
    ]);
  });

  it("gives a current job one row and points it back at the record", async () => {
    const jobId = await createJob(userId, {
      employer: "Acme",
      startDate: "2024-01-01",
    });
    const rows = await loadChronology(userId);
    expect(rows).toEqual([
      expect.objectContaining({
        id: `job:${jobId}:start`,
        source: "job",
        sourceId: jobId,
      }),
    ]);
  });
});

describeDb("life event user isolation", () => {
  let ownerId: string;
  let intruderId: string;
  let eventId: string;

  beforeEach(async () => {
    ownerId = await makeUser();
    intruderId = await makeUser();
    eventId = await createLifeEvent(ownerId, {
      eventDate: "2010-05-04",
      title: "Private",
    });
  });

  it("does not let a second user read another user's event", async () => {
    expect(await listLifeEvents(intruderId)).toEqual([]);
    expect(await getLifeEvent(intruderId, eventId)).toBeNull();
  });

  it("does not let a second user change another user's event", async () => {
    await expect(
      updateLifeEvent(intruderId, eventId, { title: "Stolen" }),
    ).rejects.toThrow();
    expect((await getLifeEvent(ownerId, eventId))?.title).toBe("Private");
  });

  it("does not let a second user delete another user's event", async () => {
    await expect(deleteLifeEvent(intruderId, eventId)).rejects.toThrow();
    expect(await getLifeEvent(ownerId, eventId)).not.toBeNull();
  });

  it("keeps one user's chronology free of every source of another user's rows", async () => {
    // The union query is three scoped reads; a dropped userId on any one of them would be
    // invisible in the two isolation cases above.
    await createJob(ownerId, { employer: "Private job", startDate: "2019-03-01" });
    await createResidence(ownerId, { city: "Private city", movedIn: "2014-08-01" });
    expect(await loadChronology(intruderId)).toEqual([]);
    expect(await loadChronology(ownerId)).toHaveLength(3);
  });

  it("keeps one user's life history free of another user's records", async () => {
    // `loadLifeHistory` is the read the Timeline page actually makes — the chronology and the
    // ribbon are both derived from it — so its scoping is checked directly rather than through
    // whichever projection happens to be tested.
    await createJob(ownerId, { employer: "Private job", startDate: "2019-03-01" });
    await createResidence(ownerId, { city: "Private city", movedIn: "2014-08-01" });

    expect(await loadLifeHistory(intruderId)).toEqual({
      events: [],
      jobs: [],
      residences: [],
    });

    const owned = await loadLifeHistory(ownerId);
    expect([owned.events.length, owned.jobs.length, owned.residences.length]).toEqual([
      1, 1, 1,
    ]);
  });
});
