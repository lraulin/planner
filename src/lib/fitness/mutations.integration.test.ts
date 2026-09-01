import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, workoutSessionGroups, workoutSets } from "@/db/schema";
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
import { formatSetsLabel } from "./format";
import { groupSessionItems } from "./sessionGroups";
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
            { reps: 5, weight: 185, completed: true },
            { reps: 5, weight: 185, completed: true },
            { reps: 5, weight: 185, completed: true },
          ],
        },
        {
          exerciseName: "OHP",
          sets: [{ reps: 8, weight: 95, completed: true }],
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
            { repsLeft: 8, repsRight: 6, weight: 50, unit: "lb", completed: true },
            { repsLeft: 8, repsRight: 7, weight: 50, unit: "lb", completed: true },
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
            { reps: 8, weight: null, unit: "bw", completed: true },
            { reps: 6, weight: 0, unit: "bw", completed: true },
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

  it("logs a timed hold with no reps", async () => {
    const exerciseId = await createExercise(userId, "Plank", {
      equipment: "bodyweight",
      measure: "time",
    });
    expect(await getExercise(userId, exerciseId)).toMatchObject({
      equipment: "bodyweight",
      measure: "time",
    });

    const sessionId = await createSession(userId, {
      performedAt: new Date("2026-08-20T18:00:00Z"),
      exercises: [
        {
          exerciseId,
          sets: [
            { durationSeconds: 45, unit: "bw", completed: true },
            { durationSeconds: 45, unit: "bw", completed: true },
          ],
        },
      ],
    });

    const detail = await getSessionDetail(userId, sessionId);
    expect(detail!.exercises[0].measure).toBe("time");
    expect(detail!.exercises[0].sets[0]).toMatchObject({
      reps: null,
      repsLeft: null,
      repsRight: null,
      durationSeconds: 45,
      weight: null,
      unit: "bw",
    });
    expect((await listSessions(userId))[0].exerciseLabels[0]).toBe("Plank 2×45s BW");
  });

  it("keeps the load on a timed carry", async () => {
    // measure and equipment are separate axes; folding them together loses this weight.
    const exerciseId = await createExercise(userId, "Farmer's Carry", {
      equipment: "dumbbell",
      measure: "time",
    });
    const sessionId = await createSession(userId, {
      performedAt: new Date(),
      exercises: [
        {
          exerciseId,
          sets: [{ durationSeconds: 90, weight: 50, unit: "lb", completed: true }],
        },
      ],
    });

    expect(
      (await getSessionDetail(userId, sessionId))!.exercises[0].sets[0],
    ).toMatchObject({ durationSeconds: 90, weight: 50, unit: "lb" });
    expect((await listSessions(userId))[0].exerciseLabels[0]).toContain("1:30 @ 50 lb");
  });

  it("stores reps and hold on one set, and allows a blank hold on another", async () => {
    const exerciseId = await createExercise(userId, "Push-up", {
      equipment: "bodyweight",
      measure: "reps_and_time",
    });
    const sessionId = await createSession(userId, {
      performedAt: new Date(),
      exercises: [
        {
          exerciseId,
          sets: [
            { reps: 10, unit: "bw", completed: true },
            { reps: 10, durationSeconds: 20, unit: "bw", completed: true },
          ],
        },
      ],
    });

    const sets = (await getSessionDetail(userId, sessionId))!.exercises[0].sets;
    expect(sets[0]).toMatchObject({ reps: 10, durationSeconds: null });
    expect(sets[1]).toMatchObject({ reps: 10, durationSeconds: 20 });
    expect((await listSessions(userId))[0].exerciseLabels[0]).toBe(
      "Push-up 10, 10 + 20s BW",
    );
  });

  it("keeps measure and durations through a replaceSession", async () => {
    const exerciseId = await createExercise(userId, "Dead Hang", {
      equipment: "bodyweight",
      measure: "time",
    });
    const sessionId = await createSession(userId, {
      performedAt: new Date("2026-08-20T12:00:00Z"),
      exercises: [{ exerciseId, sets: [{ durationSeconds: 30, unit: "bw" }] }],
    });

    const before = await getSessionDetail(userId, sessionId);
    await replaceSession(userId, sessionId, {
      performedAt: before!.performedAt,
      title: before!.title,
      notes: before!.notes,
      durationMinutes: before!.durationMinutes,
      exercises: [
        {
          exerciseId,
          sets: [
            { durationSeconds: 30, unit: "bw" },
            { durationSeconds: 40, unit: "bw" },
          ],
        },
      ],
    });

    const after = await getSessionDetail(userId, sessionId);
    expect(after!.exercises[0].measure).toBe("time");
    expect(after!.exercises[0].sets.map((s) => s.durationSeconds)).toEqual([30, 40]);
  });

  it("changes an existing exercise to timed without touching its other prefs", async () => {
    const id = await createExercise(userId, "Side Plank", {
      equipment: "bodyweight",
      notes: "hips stacked",
    });
    expect(await getExercise(userId, id)).toMatchObject({ measure: "reps" });

    await updateExercise(userId, id, { measure: "time" });
    expect(await getExercise(userId, id)).toMatchObject({
      measure: "time",
      equipment: "bodyweight",
      notes: "hips stacked",
    });
  });

  it("refuses a non-positive duration at the column, not just in the parser", async () => {
    const exerciseId = await createExercise(userId, "Bad Hold", {
      equipment: "bodyweight",
      measure: "time",
    });
    const sessionId = await createSession(userId, {
      performedAt: new Date(),
      exercises: [{ exerciseId, sets: [{ durationSeconds: 10, unit: "bw" }] }],
    });
    const sessionExerciseId = (await getSessionDetail(userId, sessionId))!.exercises[0]
      .id;

    // normaliseSetInput nulls a zero, so the CHECK is the backstop for anything that
    // reaches the insert some other way. An otherwise identical positive row must land,
    // or this would pass on any insert error at all.
    await expect(
      db.insert(workoutSets).values({
        userId,
        sessionExerciseId,
        setIndex: 2,
        durationSeconds: 5,
        unit: "bw",
      }),
    ).resolves.toBeDefined();
    await expect(
      db.insert(workoutSets).values({
        userId,
        sessionExerciseId,
        setIndex: 3,
        durationSeconds: 0,
        unit: "bw",
      }),
    ).rejects.toThrow();
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

  it("isolates second user from first user's timed exercise and its holds", async () => {
    const owner = userId;
    const intruder = await makeUser();
    const exerciseId = await createExercise(owner, "Private Plank", {
      equipment: "bodyweight",
      measure: "time",
    });
    const sessionId = await createSession(owner, {
      performedAt: new Date(),
      exercises: [{ exerciseId, sets: [{ durationSeconds: 60, unit: "bw" }] }],
    });

    expect(await getExercise(intruder, exerciseId)).toBeNull();
    expect(await getSessionDetail(intruder, sessionId)).toBeNull();
    expect(await loadExerciseHistory(intruder, exerciseId)).toEqual([]);
    expect(await listSessions(intruder)).toEqual([]);

    await expect(
      updateExercise(intruder, exerciseId, { measure: "reps" }),
    ).rejects.toThrow();
    await expect(deleteExercise(intruder, exerciseId)).rejects.toThrow();
    await expect(
      replaceSession(intruder, sessionId, {
        performedAt: new Date(),
        exercises: [{ exerciseId, sets: [{ durationSeconds: 1, unit: "bw" }] }],
      }),
    ).rejects.toThrow();
    await expect(deleteSession(intruder, sessionId)).rejects.toThrow();

    // Nothing the intruder tried may have landed.
    expect(await getExercise(owner, exerciseId)).toMatchObject({ measure: "time" });
    expect(
      (await getSessionDetail(owner, sessionId))!.exercises[0].sets.map(
        (s) => s.durationSeconds,
      ),
    ).toEqual([60]);
  });
  it("logs a superset and folds it back into one group", async () => {
    const sessionId = await createSession(userId, {
      performedAt: new Date("2026-08-20T18:00:00Z"),
      title: "Upper",
      groups: [{ label: "Superset", restSeconds: 90 }],
      exercises: [
        {
          exerciseName: "Incline Press",
          groupIndex: 0,
          sets: [
            { reps: 10, weight: 50 },
            { reps: 10, weight: 50 },
          ],
        },
        {
          exerciseName: "Chest-Supported Row",
          groupIndex: 0,
          sets: [
            { reps: 12, weight: 70 },
            { reps: 12, weight: 70 },
          ],
        },
      ],
    });

    const detail = (await getSessionDetail(userId, sessionId))!;
    expect(detail.groups).toHaveLength(1);
    expect(detail.groups[0]).toMatchObject({ label: "Superset", restSeconds: 90 });

    const items = groupSessionItems(detail.exercises, detail.groups);
    expect(items).toHaveLength(1);
    expect(items[0].kind === "group" && items[0].rounds).toBe(2);
    expect(
      items[0].kind === "group" &&
        items[0].members.map((m) => `${m.label} ${m.member.exerciseName}`),
    ).toEqual(["A1 Incline Press", "A2 Chest-Supported Row"]);
  });

  it("keeps ungrouped, grouped and ungrouped in order through a rebuild", async () => {
    const sessionId = await createSession(userId, {
      performedAt: new Date("2026-08-20T18:00:00Z"),
      groups: [{ label: "Circuit", restSeconds: 60 }],
      exercises: [
        { exerciseName: "Squat", sets: [{ reps: 5, weight: 225 }] },
        { exerciseName: "Curl", groupIndex: 0, sets: [{ reps: 12, weight: 30 }] },
        { exerciseName: "Pushdown", groupIndex: 0, sets: [{ reps: 12, weight: 40 }] },
        { exerciseName: "Calf Raise", sets: [{ reps: 15, weight: 90 }] },
      ],
    });

    const before = (await getSessionDetail(userId, sessionId))!;

    // Round-trip the read model back through the writer, the way autosave does.
    await replaceSession(userId, sessionId, {
      performedAt: before.performedAt,
      groups: before.groups.map((g) => ({
        label: g.label,
        restSeconds: g.restSeconds,
      })),
      exercises: before.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        groupIndex:
          e.groupId === null
            ? null
            : before.groups.findIndex((g) => g.id === e.groupId),
        sets: e.sets,
      })),
    });

    const after = (await getSessionDetail(userId, sessionId))!;
    const items = groupSessionItems(after.exercises, after.groups);
    expect(
      items.map((item) =>
        item.kind === "exercise"
          ? `${item.letter} ${item.member.exerciseName}`
          : `${item.letter} [${item.members.map((m) => m.member.exerciseName).join(" + ")}]`,
      ),
    ).toEqual(["A Squat", "B [Curl + Pushdown]", "C Calf Raise"]);
  });

  it("keeps a skipped round aligned rather than sliding the next one onto it", async () => {
    const sessionId = await createSession(userId, {
      performedAt: new Date("2026-08-20T18:00:00Z"),
      groups: [{ label: "Circuit" }],
      exercises: [
        {
          exerciseName: "Goblet Squat",
          groupIndex: 0,
          sets: [
            { reps: 12, weight: 50, completed: true },
            { completed: false },
            { reps: 10, weight: 50, completed: true },
          ],
        },
        {
          exerciseName: "Push-up",
          groupIndex: 0,
          // Stopped after two rounds — a trailing shortfall, not a hole.
          sets: [
            { reps: 20, unit: "bw" },
            { reps: 18, unit: "bw" },
          ],
        },
      ],
    });

    const detail = (await getSessionDetail(userId, sessionId))!;
    const [squat, pushup] = detail.exercises;

    expect(squat.sets.map((s) => s.setIndex)).toEqual([1, 2, 3]);
    expect(squat.sets.map((s) => s.reps)).toEqual([12, null, 10]);
    expect(squat.sets[1].completed).toBe(false);
    expect(pushup.sets).toHaveLength(2);

    // The skipped round drops out of the history label without shifting the others.
    expect(formatSetsLabel(squat.sets)).toBe("12, 10 @ 50 lb");
    expect(groupSessionItems(detail.exercises, detail.groups)[0]).toMatchObject({
      rounds: 3,
    });
  });

  it("ungroups without losing a single set", async () => {
    const sessionId = await createSession(userId, {
      performedAt: new Date("2026-08-20T18:00:00Z"),
      groups: [{ label: "Superset", restSeconds: 90 }],
      exercises: [
        { exerciseName: "Fly", groupIndex: 0, sets: [{ reps: 12, weight: 30 }] },
        { exerciseName: "Dip", groupIndex: 0, sets: [{ reps: 8, unit: "bw" }] },
      ],
    });

    const before = (await getSessionDetail(userId, sessionId))!;
    await replaceSession(userId, sessionId, {
      performedAt: before.performedAt,
      exercises: before.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        sets: e.sets,
      })),
    });

    const after = (await getSessionDetail(userId, sessionId))!;
    expect(after.groups).toEqual([]);
    expect(after.exercises.map((e) => e.groupId)).toEqual([null, null]);
    expect(after.exercises.map((e) => e.sets.length)).toEqual([1, 1]);
    expect(after.exercises[0].sets[0].reps).toBe(12);
    expect(after.exercises[1].sets[0].reps).toBe(8);
  });

  it("drops the group rows when its session is rebuilt without them", async () => {
    const sessionId = await createSession(userId, {
      performedAt: new Date("2026-08-20T18:00:00Z"),
      groups: [{ label: "Superset" }],
      exercises: [
        { exerciseName: "Fly", groupIndex: 0, sets: [{ reps: 12, weight: 30 }] },
      ],
    });

    await replaceSession(userId, sessionId, {
      performedAt: new Date("2026-08-20T18:00:00Z"),
      exercises: [{ exerciseName: "Fly", sets: [{ reps: 12, weight: 30 }] }],
    });

    const rows = await db
      .select()
      .from(workoutSessionGroups)
      .where(eq(workoutSessionGroups.sessionId, sessionId));
    expect(rows).toEqual([]);
  });

  it("treats a zero or negative rest as no rest, so the check constraint holds", async () => {
    const sessionId = await createSession(userId, {
      performedAt: new Date("2026-08-20T18:00:00Z"),
      groups: [{ label: "Circuit", restSeconds: 0 }, { restSeconds: -30 }],
      exercises: [
        { exerciseName: "Fly", groupIndex: 0, sets: [{ reps: 12, weight: 30 }] },
        { exerciseName: "Dip", groupIndex: 1, sets: [{ reps: 8, unit: "bw" }] },
      ],
    });

    const detail = (await getSessionDetail(userId, sessionId))!;
    expect(detail.groups.map((g) => g.restSeconds)).toEqual([null, null]);
  });

  it("refuses an exercise pointing at a group that was not supplied", async () => {
    await expect(
      createSession(userId, {
        performedAt: new Date("2026-08-20T18:00:00Z"),
        groups: [{ label: "Superset" }],
        exercises: [
          { exerciseName: "Fly", groupIndex: 3, sets: [{ reps: 12, weight: 30 }] },
        ],
      }),
    ).rejects.toThrow(/group 3/);
  });

  it("isolates a second user from the first user's groups", async () => {
    const owner = userId;
    const intruder = await makeUser();
    const sessionId = await createSession(owner, {
      performedAt: new Date("2026-08-20T18:00:00Z"),
      groups: [{ label: "Private Superset", restSeconds: 90 }],
      exercises: [
        { exerciseName: "Secret Fly", groupIndex: 0, sets: [{ reps: 12, weight: 30 }] },
        { exerciseName: "Secret Dip", groupIndex: 0, sets: [{ reps: 8, unit: "bw" }] },
      ],
    });

    // Read
    expect(await getSessionDetail(intruder, sessionId)).toBeNull();
    expect(await listSessions(intruder)).toEqual([]);

    // Change
    await expect(
      replaceSession(intruder, sessionId, {
        performedAt: new Date(),
        groups: [{ label: "Hijacked", restSeconds: 15 }],
        exercises: [
          { exerciseName: "Secret Fly", groupIndex: 0, sets: [{ reps: 1, weight: 1 }] },
        ],
      }),
    ).rejects.toThrow();

    // Delete
    await expect(deleteSession(intruder, sessionId)).rejects.toThrow();

    const rows = await db
      .select()
      .from(workoutSessionGroups)
      .where(eq(workoutSessionGroups.sessionId, sessionId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: owner, label: "Private Superset" });

    const detail = (await getSessionDetail(owner, sessionId))!;
    expect(detail.groups[0].label).toBe("Private Superset");
    expect(detail.exercises.every((e) => e.groupId === detail.groups[0].id)).toBe(true);
  });
  it("saves a reordered exercise array in its new order, without a reorder mutation", async () => {
    const sessionId = await createSession(userId, {
      performedAt: new Date("2026-09-01T18:00:00Z"),
      title: "Push",
      groups: [{ label: "Superset", restSeconds: 60 }],
      exercises: [
        { exerciseName: "Bench Press", sets: [{ reps: 5, weight: 185 }] },
        {
          exerciseName: "Incline Fly",
          groupIndex: 0,
          sets: [{ reps: 12, weight: 30 }],
        },
        { exerciseName: "Pushdown", groupIndex: 0, sets: [{ reps: 12, weight: 40 }] },
        { exerciseName: "Lateral Raise", sets: [{ reps: 15, weight: 20 }] },
      ],
    });

    const before = (await getSessionDetail(userId, sessionId))!;
    expect(before.exercises.map((e) => e.exerciseName)).toEqual([
      "Bench Press",
      "Incline Fly",
      "Pushdown",
      "Lateral Raise",
    ]);

    // What `moveItem` produces: the lone Lateral Raise moved above the whole superset.
    const byName = new Map(before.exercises.map((e) => [e.exerciseName, e]));
    const reordered = ["Bench Press", "Lateral Raise", "Incline Fly", "Pushdown"].map(
      (name) => byName.get(name)!,
    );

    await replaceSession(userId, sessionId, {
      performedAt: before.performedAt,
      title: before.title,
      groups: before.groups.map((g) => ({
        label: g.label,
        restSeconds: g.restSeconds,
      })),
      exercises: reordered.map((e) => ({
        exerciseId: e.exerciseId,
        groupIndex:
          e.groupId === null
            ? null
            : before.groups.findIndex((g) => g.id === e.groupId),
        sets: e.sets,
      })),
    });

    // Reload reads by sortKey, so the new order is what next week's copy starts from.
    const after = (await getSessionDetail(userId, sessionId))!;
    expect(after.exercises.map((e) => e.exerciseName)).toEqual([
      "Bench Press",
      "Lateral Raise",
      "Incline Fly",
      "Pushdown",
    ]);
    const items = groupSessionItems(after.exercises, after.groups);
    expect(
      items.map((item) =>
        item.kind === "exercise"
          ? `${item.letter} ${item.member.exerciseName}`
          : `${item.letter} [${item.members.map((m) => m.member.exerciseName).join(" + ")}]`,
      ),
    ).toEqual(["A Bench Press", "B Lateral Raise", "C [Incline Fly + Pushdown]"]);
  });

  it("isolates a second user from reordering the first user's session", async () => {
    const owner = userId;
    const intruder = await makeUser();
    const sessionId = await createSession(owner, {
      performedAt: new Date("2026-09-01T18:00:00Z"),
      title: "Pull",
      exercises: [
        { exerciseName: "Private Row", sets: [{ reps: 8, weight: 135 }] },
        { exerciseName: "Private Curl", sets: [{ reps: 12, weight: 30 }] },
      ],
    });

    expect(await getSessionDetail(intruder, sessionId)).toBeNull();

    const before = (await getSessionDetail(owner, sessionId))!;
    await expect(
      replaceSession(intruder, sessionId, {
        performedAt: before.performedAt,
        title: before.title,
        exercises: [...before.exercises].reverse().map((e) => ({
          exerciseId: e.exerciseId,
          sets: e.sets,
        })),
      }),
    ).rejects.toThrow();

    const after = (await getSessionDetail(owner, sessionId))!;
    expect(after.exercises.map((e) => e.exerciseName)).toEqual([
      "Private Row",
      "Private Curl",
    ]);
  });
});
