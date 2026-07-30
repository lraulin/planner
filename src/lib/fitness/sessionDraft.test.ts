import { describe, expect, it } from "vitest";
import {
  applyBodyweightMode,
  draftToSessionInput,
  emptyBodyweightSet,
  emptySet,
  setFromPrevious,
  type SessionDraft,
} from "./sessionDraft";

const catalog = [
  { id: "ex-bench", name: "Bench Press" },
  { id: "ex-squat", name: "Squat" },
  { id: "ex-pullup", name: "Pull-up" },
];

function baseDraft(overrides: Partial<SessionDraft> = {}): SessionDraft {
  return {
    performedAt: "2026-07-30T10:00",
    title: "Push",
    notes: "",
    durationMinutes: "45",
    exercises: [
      {
        key: "b1",
        exerciseId: "ex-bench",
        exerciseName: "Bench Press",
        bodyweight: false,
        sets: [
          { reps: "5", weight: "185", unit: "lb" },
          { reps: "5", weight: "185", unit: "lb" },
        ],
      },
    ],
    ...overrides,
  };
}

describe("setFromPrevious", () => {
  it("copies reps, weight, and unit from the previous set", () => {
    expect(setFromPrevious({ reps: "8", weight: "135", unit: "kg" })).toEqual({
      reps: "8",
      weight: "135",
      unit: "kg",
    });
  });

  it("returns an empty set when there is no previous", () => {
    expect(setFromPrevious(undefined)).toEqual(emptySet());
  });
});

describe("applyBodyweightMode", () => {
  it("clears weights and tags sets as bw", () => {
    const next = applyBodyweightMode(
      {
        key: "b1",
        exerciseId: "ex-pullup",
        exerciseName: "Pull-up",
        bodyweight: false,
        sets: [{ reps: "8", weight: "0", unit: "lb" }],
      },
      true,
    );
    expect(next.bodyweight).toBe(true);
    expect(next.sets[0]).toEqual({ reps: "8", weight: "", unit: "bw" });
  });

  it("restores lb unit when leaving bodyweight mode", () => {
    const next = applyBodyweightMode(
      {
        key: "b1",
        exerciseId: "ex-pullup",
        exerciseName: "Pull-up",
        bodyweight: true,
        sets: [emptyBodyweightSet()],
      },
      false,
    );
    expect(next.bodyweight).toBe(false);
    expect(next.sets[0].unit).toBe("lb");
  });
});

describe("draftToSessionInput", () => {
  it("returns null when nothing is filled in", () => {
    expect(
      draftToSessionInput(
        baseDraft({
          exercises: [
            {
              key: "b1",
              exerciseId: "",
              exerciseName: "",
              bodyweight: false,
              sets: [emptySet(), emptySet()],
            },
          ],
        }),
        catalog,
      ),
    ).toBeNull();
  });

  it("drops empty set rows but keeps filled ones", () => {
    const input = draftToSessionInput(
      baseDraft({
        exercises: [
          {
            key: "b1",
            exerciseId: "ex-bench",
            exerciseName: "Bench Press",
            bodyweight: false,
            sets: [
              { reps: "5", weight: "185", unit: "lb" },
              emptySet("lb"),
              { reps: "3", weight: "195", unit: "lb" },
            ],
          },
        ],
      }),
      catalog,
    );
    expect(input?.exercises[0].sets).toEqual([
      { reps: 5, weight: 185, unit: "lb" },
      { reps: 3, weight: 195, unit: "lb" },
    ]);
  });

  it("drops exercise blocks that have no filled sets", () => {
    const input = draftToSessionInput(
      baseDraft({
        exercises: [
          {
            key: "b1",
            exerciseId: "ex-bench",
            exerciseName: "Bench Press",
            bodyweight: false,
            sets: [{ reps: "5", weight: "185", unit: "lb" }],
          },
          {
            key: "b2",
            exerciseId: "ex-squat",
            exerciseName: "Squat",
            bodyweight: false,
            sets: [emptySet()],
          },
        ],
      }),
      catalog,
    );
    expect(input?.exercises).toHaveLength(1);
    expect(input?.exercises[0].exerciseId).toBe("ex-bench");
  });

  it("creates by name when the exercise is not yet in the catalog", () => {
    const input = draftToSessionInput(
      baseDraft({
        exercises: [
          {
            key: "b1",
            exerciseId: "",
            exerciseName: "  Overhead Press  ",
            bodyweight: false,
            sets: [{ reps: "8", weight: "95", unit: "lb" }],
          },
        ],
      }),
      catalog,
    );
    expect(input?.exercises[0]).toMatchObject({
      exerciseName: "Overhead Press",
      sets: [{ reps: 8, weight: 95, unit: "lb" }],
    });
  });

  it("returns null when every exercise block is incomplete", () => {
    expect(
      draftToSessionInput(
        baseDraft({
          exercises: [
            {
              key: "b1",
              exerciseId: "ex-bench",
              exerciseName: "Bench Press",
              bodyweight: false,
              sets: [emptySet()],
            },
          ],
        }),
        catalog,
      ),
    ).toBeNull();
  });

  it("saves bodyweight sets with unit bw and null weight", () => {
    const input = draftToSessionInput(
      baseDraft({
        exercises: [
          {
            key: "b1",
            exerciseId: "ex-pullup",
            exerciseName: "Pull-up",
            bodyweight: true,
            sets: [
              { reps: "8", weight: "", unit: "bw" },
              { reps: "8", weight: "0", unit: "bw" },
            ],
          },
        ],
      }),
      catalog,
    );
    expect(input?.exercises[0].sets).toEqual([
      { reps: 8, weight: null, unit: "bw" },
      { reps: 8, weight: null, unit: "bw" },
    ]);
  });

  it("does not treat empty bodyweight rows as filled", () => {
    expect(
      draftToSessionInput(
        baseDraft({
          exercises: [
            {
              key: "b1",
              exerciseId: "ex-pullup",
              exerciseName: "Pull-up",
              bodyweight: true,
              sets: [emptyBodyweightSet()],
            },
          ],
        }),
        catalog,
      ),
    ).toBeNull();
  });
});
