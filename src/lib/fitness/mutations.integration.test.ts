import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import {
  createExercise,
  createSession,
  deleteExercise,
  deleteSession,
  findOrCreateExercise,
  replaceSession,
  updateExercise,
} from "./mutations";
import {
  getExercise,
  getSessionDetail,
  listExercises,
  listSessions,
  loadExerciseHistory,
} from "./queries";

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
    expect(detail!.exercises[0].equipment).toBe("barbell");
    expect(detail!.exercises[0].sets).toHaveLength(3);
    expect(detail!.exercises[0].sets[0].weight).toBe(185);

    const catalog = await listExercises(userId);
    expect(catalog.map((e) => e.name).sort()).toEqual(["Bench Press", "OHP"]);

    const sessions = await listSessions(userId);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].exerciseLabels[0]).toContain("Bench Press");
    expect(sessions[0].exerciseLabels[0]).toContain("3×5");
  });

  it("stores catalog equipment prefs and unilateral sets", async () => {
    const exerciseId = await createExercise(userId, "DB Row", {
      equipment: "dumbbell",
      unilateral: true,
    });
    expect(await getExercise(userId, exerciseId)).toMatchObject({
      equipment: "dumbbell",
      unilateral: true,
    });

    const sessionId = await createSession(userId, {
      performedAt: new Date(),
      exercises: [
        {
          exerciseId,
          sets: [
            { repsLeft: 8, repsRight: 6, weight: 50, unit: "lb" },
            { repsLeft: 8, repsRight: 7, weight: 50, unit: "lb" },
          ],
        },
      ],
    });

    const detail = await getSessionDetail(userId, sessionId);
    expect(detail!.exercises[0].sets[0]).toMatchObject({
      reps: null,
      repsLeft: 8,
      repsRight: 6,
      weight: 50,
    });
    const sessions = await listSessions(userId);
    expect(sessions[0].exerciseLabels[0]).toContain("8/6");
  });

  it("updates exercise equipment without session prefs write-back", async () => {
    const id = await createExercise(userId, "Curl", {
      equipment: "barbell",
      barWeight: 15,
      notes: "elbows in",
    });
    await updateExercise(userId, id, {
      equipment: "dumbbell",
      unilateral: true,
    });
    // A patch that names only equipment and unilateral must merge against the stored row.
    // Dropping that merge reads as working — equipment and unilateral are still right —
    // while silently resetting the EZ bar to the 45lb default and blanking the notes.
    expect(await getExercise(userId, id)).toMatchObject({
      name: "Curl",
      equipment: "dumbbell",
      unilateral: true,
      barWeight: 15,
      notes: "elbows in",
    });
  });

  it("persists a per-exercise session note independently of the other lift", async () => {
    const bench = await createExercise(userId, "Bench Press");
    const ohp = await createExercise(userId, "OHP");
    const sessionId = await createSession(userId, {
      performedAt: new Date("2026-08-17T18:00:00Z"),
      exercises: [
        {
          exerciseId: bench,
          notes: "paused at chest",
          sets: [{ reps: 5, weight: 185 }],
        },
        {
          exerciseId: ohp,
          sets: [{ reps: 8, weight: 95 }],
        },
      ],
    });

    let detail = await getSessionDetail(userId, sessionId);
    expect(detail!.exercises[0].notes).toBe("paused at chest");
    expect(detail!.exercises[1].notes).toBe("");

    await replaceSession(userId, sessionId, {
      performedAt: detail!.performedAt,
      title: detail!.title,
      notes: detail!.notes,
      durationMinutes: detail!.durationMinutes,
      exercises: [
        {
          exerciseId: bench,
          notes: "belt on last set",
          sets: [{ reps: 5, weight: 185 }],
        },
        {
          exerciseId: ohp,
          notes: "",
          sets: [{ reps: 8, weight: 95 }],
        },
      ],
    });

    detail = await getSessionDetail(userId, sessionId);
    expect(detail!.exercises[0].notes).toBe("belt on last set");
    expect(detail!.exercises[1].notes).toBe("");

    await replaceSession(userId, sessionId, {
      performedAt: detail!.performedAt,
      title: detail!.title,
      notes: detail!.notes,
      durationMinutes: detail!.durationMinutes,
      exercises: [
        {
          exerciseId: bench,
          notes: "",
          sets: [{ reps: 5, weight: 185 }],
        },
        {
          exerciseId: ohp,
          notes: "",
          sets: [{ reps: 8, weight: 95 }],
        },
      ],
    });

    detail = await getSessionDetail(userId, sessionId);
    expect(detail!.exercises[0].notes).toBe("");
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
    const exerciseId = await createExercise(userId, "Pull-up", {
      equipment: "bodyweight",
    });
    const sessionId = await createSession(userId, {
      performedAt: new Date(),
      exercises: [
        {
          exerciseId,
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

  it("isolates second user from first user's fitness rows", async () => {
    const owner = userId;
    const intruder = await makeUser();
    const exerciseId = await createExercise(owner, "Private Lift");
    const sessionId = await createSession(owner, {
      performedAt: new Date(),
      exercises: [{ exerciseId, sets: [{ reps: 1, weight: 1 }] }],
    });

    await expect(
      updateExercise(intruder, exerciseId, { name: "Hijacked" }),
    ).rejects.toThrow();
    await expect(deleteSession(intruder, sessionId)).rejects.toThrow();
    expect(await getSessionDetail(intruder, sessionId)).toBeNull();
    expect(await listExercises(intruder)).toHaveLength(0);
  });
});
