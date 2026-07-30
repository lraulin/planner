import { describe, expect, it } from "vitest";
import {
  draftToSessionInput,
  emptySet,
  setFromPrevious,
  type SessionDraft,
} from "./sessionDraft";

const catalog = [
  { id: "ex-bench", name: "Bench Press" },
  { id: "ex-squat", name: "Squat" },
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
            sets: [{ reps: "5", weight: "185", unit: "lb" }],
          },
          {
            key: "b2",
            exerciseId: "ex-squat",
            exerciseName: "Squat",
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
              sets: [emptySet()],
            },
          ],
        }),
        catalog,
      ),
    ).toBeNull();
  });
});
