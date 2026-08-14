import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { createJob, deleteJob, updateJob } from "./mutations";
import { getJobDetail, listJobDates, listJobs } from "./queries";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("jobs mutations");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ email: `jobs-test-${crypto.randomUUID()}@localhost`, name: "Jobs Test" })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

describeDb("jobs mutations", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("stores an international employer address unmangled", async () => {
    // Korea has neither a state nor a ZIP; nothing may quietly reshape this into a US address.
    const id = await createJob(userId, {
      employer: "Hanbit",
      jobTitle: "Instructor",
      city: "Seoul",
      region: "",
      postalCode: "04524",
      country: "South Korea",
      startDate: "2014-09-01",
      endDate: "2016-08-31",
    });

    await expect(getJobDetail(userId, id)).resolves.toMatchObject({
      city: "Seoul",
      region: "",
      postalCode: "04524",
      country: "South Korea",
      startDate: "2014-09-01",
      endDate: "2016-08-31",
    });
  });

  it("computes duration against today for a job with no end date", async () => {
    const id = await createJob(userId, { employer: "Acme", startDate: "2024-08-13" });
    const [row] = await listJobs(userId, "2026-08-13");
    expect(row.id).toBe(id);
    expect(row.duration).toBe("2y 0m 0d");
  });

  it("leaves duration blank when the caller does not know what day it is", async () => {
    // listJobs must never reach for new Date(): on the server that is UTC's today.
    await createJob(userId, { employer: "Acme", startDate: "2024-08-13" });
    const [row] = await listJobs(userId, null);
    expect(row.duration).toBeNull();
  });

  it("writes only the fields supplied on update", async () => {
    // Saving the Position tab must not blank the supervisor block.
    const id = await createJob(userId, {
      employer: "Acme",
      jobTitle: "Engineer",
      supervisorName: "Ada King",
      supervisorPhone: "555-0100",
    });
    await updateJob(userId, id, { jobTitle: "Senior Engineer" });

    await expect(getJobDetail(userId, id)).resolves.toMatchObject({
      employer: "Acme",
      jobTitle: "Senior Engineer",
      supervisorName: "Ada King",
      supervisorPhone: "555-0100",
    });
  });

  it("rejects an end date before the start date in our words, not Postgres's", async () => {
    await expect(
      createJob(userId, {
        employer: "Acme",
        startDate: "2020-06-01",
        endDate: "2020-01-01",
      }),
    ).rejects.toThrow("End date cannot be before start date.");
  });

  it("checks the ordering against the record as it will be, not as it was", async () => {
    // Moving only the start date past an existing end date must still be caught.
    const id = await createJob(userId, {
      employer: "Acme",
      startDate: "2020-01-01",
      endDate: "2020-06-01",
    });
    await expect(updateJob(userId, id, { startDate: "2021-01-01" })).rejects.toThrow(
      "End date cannot be before start date.",
    );
  });

  it("round-trips pay through numeric without losing cents", async () => {
    const id = await createJob(userId, { employer: "Acme", startingPay: 62_500.5 });
    await expect(getJobDetail(userId, id)).resolves.toMatchObject({
      startingPay: 62500.5,
    });
  });

  it("exposes only dated jobs' edges to the chronology", async () => {
    await createJob(userId, { employer: "Dated", startDate: "2019-03-01" });
    await createJob(userId, { employer: "Undated" });
    const dates = await listJobDates(userId);
    expect(dates).toHaveLength(2);
    expect(dates.filter((row) => row.startDate !== null)).toHaveLength(1);
  });
});

describeDb("job user isolation", () => {
  let ownerId: string;
  let intruderId: string;
  let jobId: string;

  beforeEach(async () => {
    ownerId = await makeUser();
    intruderId = await makeUser();
    jobId = await createJob(ownerId, { employer: "Private", jobTitle: "Secret" });
  });

  it("does not let a second user read another user's job", async () => {
    expect(await listJobs(intruderId)).toEqual([]);
    expect(await listJobDates(intruderId)).toEqual([]);
    expect(await getJobDetail(intruderId, jobId)).toBeNull();
  });

  it("does not let a second user change another user's job", async () => {
    await expect(
      updateJob(intruderId, jobId, { employer: "Stolen" }),
    ).rejects.toThrow();
    expect((await getJobDetail(ownerId, jobId))?.employer).toBe("Private");
  });

  it("does not let a second user delete another user's job", async () => {
    await expect(deleteJob(intruderId, jobId)).rejects.toThrow();
    expect(await getJobDetail(ownerId, jobId)).not.toBeNull();
  });
});
