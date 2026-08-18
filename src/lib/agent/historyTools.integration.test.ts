import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { dispatchAgentTool } from "./tools";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("history agent tools");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `history-agent-${crypto.randomUUID()}@localhost`,
      name: "History Agent Test",
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of createdUserIds) await db.delete(users).where(eq(users.id, id));
});

type CreatedJob = {
  job: { id: string; employer: string; jobTitle: string };
  created: boolean;
};
type CreatedResidence = {
  residence: { id: string; city: string };
  created: boolean;
};
type CreatedEvent = { event: { id: string; title: string }; created: boolean };

describeDb("history agent tools", () => {
  let userId: string;
  let otherId: string;

  beforeEach(async () => {
    userId = await makeUser();
    otherId = await makeUser();
  });

  it("creates, lists, reads, and updates a job", async () => {
    const created = (await dispatchAgentTool(
      "create_job",
      {
        employer: "Hanbit",
        jobTitle: "Instructor",
        city: "Seoul",
        country: "South Korea",
        startDate: "2014-09-01",
        endDate: "2016-08-31",
        startingPay: "62500.50",
      },
      userId,
    )) as CreatedJob;
    expect(created.created).toBe(true);
    expect(created.job.employer).toBe("Hanbit");

    const listed = (await dispatchAgentTool(
      "list_jobs",
      { query: "Hanbit" },
      userId,
    )) as {
      jobs: { id: string; location: string; duties?: string }[];
      pageInfo: { total: number };
    };
    expect(listed.pageInfo.total).toBe(1);
    expect(listed.jobs[0]?.id).toBe(created.job.id);
    expect(listed.jobs[0]?.location).toContain("Seoul");
    expect(listed.jobs[0]).not.toHaveProperty("duties");

    const updated = (await dispatchAgentTool(
      "update_job",
      { id: created.job.id, jobTitle: "Senior Instructor" },
      userId,
    )) as { job: { jobTitle: string; employer: string; startingPay: string | null } };
    expect(updated.job.jobTitle).toBe("Senior Instructor");
    expect(updated.job.employer).toBe("Hanbit");
    expect(updated.job.startingPay).toBe("62500.50");
  });

  it("replays a keyed job create without changing the original row", async () => {
    const first = (await dispatchAgentTool(
      "create_job",
      { employer: "Acme", externalSource: "import", externalId: "job-1" },
      userId,
    )) as CreatedJob;
    const replay = (await dispatchAgentTool(
      "create_job",
      { employer: "Different", externalSource: "import", externalId: "job-1" },
      userId,
    )) as CreatedJob;
    expect(replay.created).toBe(false);
    expect(replay.job.id).toBe(first.job.id);
    expect(replay.job.employer).toBe("Acme");
  });

  it("rejects an inverted job date range as validation", async () => {
    await expect(
      dispatchAgentTool(
        "create_job",
        { employer: "Acme", startDate: "2020-06-01", endDate: "2020-01-01" },
        userId,
      ),
    ).rejects.toMatchObject({
      code: "validation",
      message: "End date cannot be before start date.",
    });
  });

  it("creates, lists, and updates a residence", async () => {
    const created = (await dispatchAgentTool(
      "create_residence",
      {
        label: "The Seoul apartment",
        city: "Seoul",
        country: "South Korea",
        movedIn: "2014-08-01",
        movedOut: "2017-02-15",
        monthlyRent: "1200",
      },
      userId,
    )) as CreatedResidence;
    expect(created.created).toBe(true);

    const listed = (await dispatchAgentTool(
      "list_residences",
      { query: "Seoul" },
      userId,
    )) as { residences: { id: string; address: string; notes?: string }[] };
    expect(listed.residences).toHaveLength(1);
    expect(listed.residences[0]?.address).toContain("Seoul");
    expect(listed.residences[0]).not.toHaveProperty("notes");

    const updated = (await dispatchAgentTool(
      "update_residence",
      { id: created.residence.id, movedOut: null },
      userId,
    )) as { residence: { movedOut: string | null; city: string } };
    expect(updated.residence.movedOut).toBeNull();
    expect(updated.residence.city).toBe("Seoul");
  });

  it("creates, lists, and updates a life event", async () => {
    const created = (await dispatchAgentTool(
      "create_life_event",
      { eventDate: "2010-05-04", title: "Adopted Biscuit", category: "Pets" },
      userId,
    )) as CreatedEvent;
    expect(created.created).toBe(true);

    const listed = (await dispatchAgentTool(
      "list_life_events",
      { query: "Biscuit", from: "2010-01-01", to: "2010-12-31" },
      userId,
    )) as { events: { id: string; title: string; notes?: string }[] };
    expect(listed.events.map((row) => row.id)).toContain(created.event.id);
    expect(listed.events[0]).not.toHaveProperty("notes");

    const updated = (await dispatchAgentTool(
      "update_life_event",
      { id: created.event.id, category: "Family" },
      userId,
    )) as { event: { category: string; title: string } };
    expect(updated.event.category).toBe("Family");
    expect(updated.event.title).toBe("Adopted Biscuit");
  });

  it("refuses a life event without a date", async () => {
    await expect(
      dispatchAgentTool("create_life_event", { title: "Someday" }, userId),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("does not let a second user read or change the first user's history", async () => {
    const job = (await dispatchAgentTool(
      "create_job",
      { employer: "Private" },
      userId,
    )) as CreatedJob;
    const residence = (await dispatchAgentTool(
      "create_residence",
      { city: "Private" },
      userId,
    )) as CreatedResidence;
    const event = (await dispatchAgentTool(
      "create_life_event",
      { eventDate: "2010-05-04", title: "Private" },
      userId,
    )) as CreatedEvent;

    const jobs = (await dispatchAgentTool("list_jobs", {}, otherId)) as {
      jobs: unknown[];
    };
    const residences = (await dispatchAgentTool("list_residences", {}, otherId)) as {
      residences: unknown[];
    };
    const events = (await dispatchAgentTool("list_life_events", {}, otherId)) as {
      events: unknown[];
    };
    expect(jobs.jobs).toEqual([]);
    expect(residences.residences).toEqual([]);
    expect(events.events).toEqual([]);

    await expect(
      dispatchAgentTool("get_job", { id: job.job.id }, otherId),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      dispatchAgentTool("get_residence", { id: residence.residence.id }, otherId),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      dispatchAgentTool("get_life_event", { id: event.event.id }, otherId),
    ).rejects.toMatchObject({ code: "not_found" });

    await expect(
      dispatchAgentTool("update_job", { id: job.job.id, employer: "Stolen" }, otherId),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      dispatchAgentTool(
        "update_residence",
        { id: residence.residence.id, city: "Stolen" },
        otherId,
      ),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      dispatchAgentTool(
        "update_life_event",
        { id: event.event.id, title: "Stolen" },
        otherId,
      ),
    ).rejects.toMatchObject({ code: "not_found" });

    const still = (await dispatchAgentTool("get_job", { id: job.job.id }, userId)) as {
      job: { employer: string };
    };
    expect(still.job.employer).toBe("Private");
  });
});
