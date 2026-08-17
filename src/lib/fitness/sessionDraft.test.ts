import { describe, expect, it } from "vitest";
import {
  draftToSessionInput,
  emptyDraftBlock,
  setFromPrevious,
  setsFromHistory,
  type SessionDraft,
} from "./sessionDraft";

const catalog = [
  { id: "ex-bench", name: "Bench Press" },
  { id: "ex-db", name: "DB Row" },
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
        equipment: "barbell",
        barWeight: 45,
        unilateral: false,
        notes: "",
        sets: [
          {
            reps: "5",
            repsLeft: "",
            repsRight: "",
            weight: "185",
            unit: "lb",
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("draftToSessionInput", () => {
  it("returns null when nothing is filled", () => {
    const empty = emptyDraftBlock();
    expect(
      draftToSessionInput(
        baseDraft({ exercises: [{ ...empty, exerciseId: "", exerciseName: "" }] }),
        catalog,
      ),
    ).toBeNull();
  });

  it("maps bilateral barbell sets", () => {
    const input = draftToSessionInput(baseDraft(), catalog);
    expect(input?.exercises[0].sets).toEqual([
      {
        reps: 5,
        repsLeft: null,
        repsRight: null,
        weight: 185,
        unit: "lb",
      },
    ]);
  });

  it("maps unilateral dumbbell L/R", () => {
    const input = draftToSessionInput(
      baseDraft({
        exercises: [
          {
            key: "b1",
            exerciseId: "ex-db",
            exerciseName: "DB Row",
            equipment: "dumbbell",
            barWeight: 45,
            unilateral: true,
            notes: "",
            sets: [
              {
                reps: "",
                repsLeft: "8",
                repsRight: "6",
                weight: "50",
                unit: "lb",
              },
            ],
          },
        ],
      }),
      catalog,
    );
    expect(input?.exercises[0].sets[0]).toEqual({
      reps: null,
      repsLeft: 8,
      repsRight: 6,
      weight: 50,
      unit: "lb",
    });
  });

  it("includes a per-exercise note so replaceSession cannot wipe it", () => {
    const input = draftToSessionInput(
      baseDraft({
        exercises: [{ ...baseDraft().exercises[0], notes: "paused at chest" }],
      }),
      catalog,
    );
    expect(input?.exercises[0].notes).toBe("paused at chest");
  });

  it("sends an empty string when the note is blank", () => {
    const input = draftToSessionInput(baseDraft(), catalog);
    // Omit this and replaceSession writes notes: undefined ?? "" over a stored note.
    expect(input?.exercises[0].notes).toBe("");
  });
});

describe("setsFromHistory / setFromPrevious", () => {
  it("copies L/R when unilateral", () => {
    expect(
      setsFromHistory(
        [{ reps: null, repsLeft: 8, repsRight: 7, weight: 40, unit: "lb" }],
        { equipment: "dumbbell", unilateral: true },
      ),
    ).toEqual([
      {
        reps: "",
        repsLeft: "8",
        repsRight: "7",
        weight: "40",
        unit: "lb",
      },
    ]);
  });

  it("copies previous set fields", () => {
    const prev = {
      reps: "5",
      repsLeft: "",
      repsRight: "",
      weight: "185",
      unit: "lb",
    };
    expect(setFromPrevious(prev, { equipment: "barbell", unilateral: false })).toEqual(
      prev,
    );
  });
});
