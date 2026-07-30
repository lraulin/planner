import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { exercises, users, workoutSessions } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { saveNodeDetail } from "@/lib/detail/mutations";
import { createNode, deleteNode } from "@/lib/tree/mutations";
import {
  createExercise,
  createSession,
  deleteExercise,
  deleteSession,
  findOrCreateExercise,
  renameExercise,
} from "./mutations";
import {
  getSessionDetail,
  listExercises,
  listSessions,
  loadExerciseHistory,
} from "./queries";

/**
 * Fitness mutations against real Postgres. The history invariant is the product:
 * deleting a linked task must not remove sessions or exercises.
 */

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("fitness mutations");

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

describeDb("fitness sessions", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("logs a multi-exercise session with sets", async () => {
    const sessionId = await createSession(userId, {
      performedAt: new Date("2026-07-30T18:00:00Z"),
      title: "Push",
      exercises: [
        {
          exerciseName: "Bench Press",
          sets: [
            { reps: 5, weight: 185 },
            { reps: 5, weight: 185 },
            { reps: 5, weight: 185 },
          ],
        },
        {
          exerciseName: "OHP",
          sets: [{ reps: 8, weight: 95 }],
        },
      ],
    });

    const detail = await getSessionDetail(userId, sessionId);
    expect(detail).not.toBeNull();
    expect(detail!.title).toBe("Push");
    expect(detail!.exercises).toHaveLength(2);
    expect(detail!.exercises[0].exerciseName).toBe("Bench Press");
    expect(detail!.exercises[0].sets).toHaveLength(3);
    expect(detail!.exercises[0].sets[0].weight).toBe(185);
    expect(detail!.exercises[1].exerciseName).toBe("OHP");

    const catalog = await listExercises(userId);
    expect(catalog.map((e) => e.name).sort()).toEqual(["Bench Press", "OHP"]);

    const sessions = await listSessions(userId);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].exerciseLabels[0]).toContain("Bench Press");
    expect(sessions[0].exerciseLabels[0]).toContain("3×5");
  });

  it("reuses an existing exercise by name", async () => {
    const id = await createExercise(userId, "Squat");
    const again = await findOrCreateExercise(userId, "Squat");
    expect(again).toBe(id);

    await createSession(userId, {
      performedAt: new Date(),
      exercises: [{ exerciseId: id, sets: [{ reps: 5, weight: 225 }] }],
    });

    expect(await listExercises(userId)).toHaveLength(1);
  });

  it("stores bodyweight sets as unit bw with null weight", async () => {
    const sessionId = await createSession(userId, {
      performedAt: new Date(),
      exercises: [
        {
          exerciseName: "Pull-up",
          sets: [
            { reps: 8, weight: null, unit: "bw" },
            { reps: 6, weight: 0, unit: "bw" },
          ],
        },
      ],
    });

    const detail = await getSessionDetail(userId, sessionId);
    expect(detail!.exercises[0].sets).toEqual([
      expect.objectContaining({ reps: 8, weight: null, unit: "bw" }),
      expect.objectContaining({ reps: 6, weight: null, unit: "bw" }),
    ]);
    const sessions = await listSessions(userId);
    expect(sessions[0].exerciseLabels[0]).toContain("BW");
    expect(sessions[0].exerciseLabels[0]).not.toContain("0");
  });

  it("blocks deleting an exercise that has history", async () => {
    const exerciseId = await createExercise(userId, "Deadlift");
    await createSession(userId, {
      performedAt: new Date(),
      exercises: [{ exerciseId, sets: [{ reps: 5, weight: 315 }] }],
    });

    await expect(deleteExercise(userId, exerciseId)).rejects.toThrow(/history/);
    expect(await listExercises(userId)).toHaveLength(1);
  });

  it("allows deleting an unused exercise", async () => {
    const exerciseId = await createExercise(userId, "Unused");
    await deleteExercise(userId, exerciseId);
    expect(await listExercises(userId)).toHaveLength(0);
  });

  it("deletes only the session when asked, not the exercise catalog", async () => {
    const sessionId = await createSession(userId, {
      performedAt: new Date(),
      exercises: [{ exerciseName: "Row", sets: [{ reps: 10, weight: 135 }] }],
    });

    await deleteSession(userId, sessionId);

    expect(await listSessions(userId)).toHaveLength(0);
    expect(await listExercises(userId)).toHaveLength(1);
    expect(
      await loadExerciseHistory(userId, (await listExercises(userId))[0].id),
    ).toEqual([]);
  });

  it("keeps history when a linked task is deleted", async () => {
    const exerciseId = await createExercise(userId, "Bench Press");
    const sessionId = await createSession(userId, {
      performedAt: new Date("2026-07-01T12:00:00Z"),
      exercises: [
        {
          exerciseId,
          sets: [
            { reps: 5, weight: 185 },
            { reps: 5, weight: 185 },
          ],
        },
      ],
    });

    const taskId = await createNode({
      userId,
      parentId: null,
      type: "task",
      name: "Bench Press",
    });
    await saveNodeDetail(userId, taskId, {
      task: { exerciseId },
    });

    await deleteNode(userId, taskId);

    // Session and exercise must still exist — the whole point of the durable log.
    expect(await getSessionDetail(userId, sessionId)).not.toBeNull();
    const [ex] = await db.select().from(exercises).where(eq(exercises.id, exerciseId));
    expect(ex?.name).toBe("Bench Press");
    const history = await loadExerciseHistory(userId, exerciseId);
    expect(history).toHaveLength(1);
    expect(history[0].sets).toHaveLength(2);
  });
});

describeDb("fitness cross-user isolation", () => {
  let ownerId: string;
  let otherId: string;
  let exerciseId: string;
  let sessionId: string;

  beforeEach(async () => {
    ownerId = await makeUser();
    otherId = await makeUser();
    exerciseId = await createExercise(ownerId, "Owner Lift");
    sessionId = await createSession(ownerId, {
      performedAt: new Date(),
      exercises: [{ exerciseId, sets: [{ reps: 5, weight: 100 }] }],
    });
  });

  it("does not let another user read, rename, or delete owner data", async () => {
    expect(await getSessionDetail(otherId, sessionId)).toBeNull();
    expect(await listSessions(otherId)).toHaveLength(0);
    expect(await listExercises(otherId)).toHaveLength(0);
    expect(await loadExerciseHistory(otherId, exerciseId)).toHaveLength(0);

    await expect(renameExercise(otherId, exerciseId, "Stolen")).rejects.toThrow();
    await expect(deleteSession(otherId, sessionId)).rejects.toThrow();
    await expect(deleteExercise(otherId, exerciseId)).rejects.toThrow();

    // Owner rows untouched.
    expect(await getSessionDetail(ownerId, sessionId)).not.toBeNull();
    const [still] = await db
      .select()
      .from(workoutSessions)
      .where(eq(workoutSessions.id, sessionId));
    expect(still.userId).toBe(ownerId);
  });
});
