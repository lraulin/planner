import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { createExercise, createSession, replaceSession } from "./mutations";
import { planDraftFromDetail } from "./sessionDraft";
import {
  getSessionDetail,
  latestSessionByTitle,
  listRepeatableTitles,
  listSessions,
  loadLatestForExercise,
} from "./queries";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("fitness queries");

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

describeDb("repeatable titles and last-time preference", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("lists distinct non-empty titles from the latest session of each name", async () => {
    const bench = await createExercise(userId, "Bench");
    const row = await createExercise(userId, "Row");

    await createSession(userId, {
      performedAt: new Date("2026-08-01T18:00:00Z"),
      title: "push",
      exercises: [
        { exerciseId: bench, sets: [{ reps: 5, weight: 135, completed: true }] },
      ],
    });
    const latestPush = await createSession(userId, {
      performedAt: new Date("2026-08-20T18:00:00Z"),
      title: "Push",
      exercises: [
        { exerciseId: bench, sets: [{ reps: 5, weight: 185, completed: true }] },
        { exerciseId: row, sets: [{ reps: 8, weight: 50, completed: true }] },
      ],
    });
    await createSession(userId, {
      performedAt: new Date("2026-08-21T18:00:00Z"),
      title: "  ",
      exercises: [
        { exerciseId: bench, sets: [{ reps: 5, weight: 95, completed: true }] },
      ],
    });
    await createSession(userId, {
      performedAt: new Date("2026-08-22T18:00:00Z"),
      title: "Pull",
      exercises: [
        { exerciseId: row, sets: [{ reps: 10, weight: 40, completed: false }] },
      ],
    });

    const titles = await listRepeatableTitles(userId);
    expect(titles.map((t) => t.title)).toEqual(["Pull", "Push"]);
    expect(titles[1]).toMatchObject({
      title: "Push",
      sessionId: latestPush,
      exerciseCount: 2,
      isIncomplete: false,
    });
    expect(titles[0].isIncomplete).toBe(true);

    const byTitle = await latestSessionByTitle(userId, " push ");
    expect(byTitle?.id).toBe(latestPush);
    expect(byTitle?.title).toBe("Push");
  });

  it("prefers last time this exercise appeared under the same title", async () => {
    const bench = await createExercise(userId, "Bench");
    await createSession(userId, {
      performedAt: new Date("2026-08-10T18:00:00Z"),
      title: "Push",
      exercises: [
        { exerciseId: bench, sets: [{ reps: 5, weight: 175, completed: true }] },
      ],
    });
    await createSession(userId, {
      performedAt: new Date("2026-08-20T18:00:00Z"),
      title: "Full body",
      exercises: [
        { exerciseId: bench, sets: [{ reps: 8, weight: 135, completed: true }] },
      ],
    });

    const sameTitle = await loadLatestForExercise(userId, bench, {
      sessionTitle: "push",
    });
    expect(sameTitle?.sets[0].weight).toBe(175);

    const anywhere = await loadLatestForExercise(userId, bench);
    expect(anywhere?.sets[0].weight).toBe(135);
  });

  it("does not let a second user list, open, or copy the first user's titled session", async () => {
    const owner = userId;
    const intruder = await makeUser();
    const bench = await createExercise(owner, "Bench");
    const sessionId = await createSession(owner, {
      performedAt: new Date("2026-08-20T18:00:00Z"),
      title: "Push",
      exercises: [
        { exerciseId: bench, sets: [{ reps: 5, weight: 185, completed: true }] },
      ],
    });

    expect(await listRepeatableTitles(intruder)).toEqual([]);
    expect(await latestSessionByTitle(intruder, "Push")).toBeNull();
    expect(await getSessionDetail(intruder, sessionId)).toBeNull();
    expect(await listSessions(intruder)).toEqual([]);
  });

  it("copying a plan does not mutate the source session", async () => {
    const bench = await createExercise(userId, "Bench");
    const sourceId = await createSession(userId, {
      performedAt: new Date("2026-08-20T18:00:00Z"),
      title: "Push",
      notes: "source day",
      durationMinutes: 40,
      exercises: [
        {
          exerciseId: bench,
          notes: "paused",
          sets: [{ reps: 5, weight: 185, completed: true }],
        },
      ],
    });
    const source = (await getSessionDetail(userId, sourceId))!;
    const draft = planDraftFromDetail(source);
    expect(draft.notes).toBe("");
    expect(draft.exercises[0].sets[0].completed).toBe(false);

    const after = (await getSessionDetail(userId, sourceId))!;
    expect(after.notes).toBe("source day");
    expect(after.exercises[0].sets[0].completed).toBe(true);
    expect(after.id).toBe(sourceId);
  });

  it("persists completed as written and refuses a second user flipping it", async () => {
    const owner = userId;
    const intruder = await makeUser();
    const bench = await createExercise(owner, "Bench");
    const sessionId = await createSession(owner, {
      performedAt: new Date(),
      title: "Push",
      exercises: [
        {
          exerciseId: bench,
          sets: [
            { reps: 5, weight: 185, completed: false },
            { reps: 5, weight: 185, completed: true },
          ],
        },
      ],
    });

    const detail = (await getSessionDetail(owner, sessionId))!;
    expect(detail.exercises[0].sets.map((s) => s.completed)).toEqual([false, true]);
    expect((await listSessions(owner))[0].isIncomplete).toBe(true);

    await expect(
      replaceSession(intruder, sessionId, {
        performedAt: detail.performedAt,
        exercises: [
          {
            exerciseId: bench,
            sets: [{ reps: 5, weight: 185, completed: true }],
          },
        ],
      }),
    ).rejects.toThrow();

    expect(
      (await getSessionDetail(owner, sessionId))!.exercises[0].sets.map(
        (s) => s.completed,
      ),
    ).toEqual([false, true]);
  });
});
