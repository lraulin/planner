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
        measure: "reps",
        barWeight: 45,
        unilateral: false,
        notes: "",
        sets: [
          {
            reps: "5",
            repsLeft: "",
            repsRight: "",
            duration: "",
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
        durationSeconds: null,
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
            measure: "reps",
            barWeight: 45,
            unilateral: true,
            notes: "",
            sets: [
              {
                reps: "",
                repsLeft: "8",
                repsRight: "6",
                duration: "",
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
      durationSeconds: null,
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
        [
          {
            reps: null,
            repsLeft: 8,
            repsRight: 7,
            durationSeconds: null,
            weight: 40,
            unit: "lb",
          },
        ],
        { equipment: "dumbbell", measure: "reps", unilateral: true },
      ),
    ).toEqual([
      {
        reps: "",
        repsLeft: "8",
        repsRight: "7",
        duration: "",
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
      duration: "",
      weight: "185",
      unit: "lb",
    };
    expect(setFromPrevious(prev, { equipment: "barbell", unilateral: false })).toEqual(
      prev,
    );
  });
});

describe("draftToSessionInput — timed exercises", () => {
  const timedCatalog = [
    { id: "ex-plank", name: "Plank" },
    { id: "ex-carry", name: "Farmer's Carry" },
    { id: "ex-pushup", name: "Push-up" },
  ];

  function timedDraft(block: Partial<SessionDraft["exercises"][number]>): SessionDraft {
    return baseDraft({
      exercises: [
        {
          key: "t1",
          exerciseId: "ex-plank",
          exerciseName: "Plank",
          equipment: "bodyweight",
          measure: "time",
          barWeight: 45,
          unilateral: false,
          notes: "",
          sets: [],
          ...block,
        },
      ],
    });
  }

  it("maps a bodyweight hold to a duration with no reps", () => {
    const input = draftToSessionInput(
      timedDraft({
        sets: [
          {
            reps: "",
            repsLeft: "",
            repsRight: "",
            duration: "45",
            weight: "",
            unit: "bw",
          },
        ],
      }),
      timedCatalog,
    );
    expect(input?.exercises[0].sets).toEqual([
      {
        reps: null,
        repsLeft: null,
        repsRight: null,
        durationSeconds: 45,
        weight: null,
        unit: "bw",
      },
    ]);
  });

  it("accepts m:ss as well as bare seconds", () => {
    const input = draftToSessionInput(
      timedDraft({
        sets: [
          {
            reps: "",
            repsLeft: "",
            repsRight: "",
            duration: "1:30",
            weight: "",
            unit: "bw",
          },
        ],
      }),
      timedCatalog,
    );
    expect(input?.exercises[0].sets[0].durationSeconds).toBe(90);
  });

  it("keeps the load on a timed carry", () => {
    const input = draftToSessionInput(
      timedDraft({
        exerciseId: "ex-carry",
        exerciseName: "Farmer's Carry",
        equipment: "dumbbell",
        sets: [
          {
            reps: "",
            repsLeft: "",
            repsRight: "",
            duration: "60",
            weight: "50",
            unit: "lb",
          },
        ],
      }),
      timedCatalog,
    );
    expect(input?.exercises[0].sets[0]).toEqual({
      reps: null,
      repsLeft: null,
      repsRight: null,
      durationSeconds: 60,
      weight: 50,
      unit: "lb",
    });
  });

  it("does not log a set that has only a load and no hold", () => {
    // A weight with no time is not a carry that happened.
    expect(
      draftToSessionInput(
        timedDraft({
          exerciseId: "ex-carry",
          exerciseName: "Farmer's Carry",
          equipment: "dumbbell",
          sets: [
            {
              reps: "",
              repsLeft: "",
              repsRight: "",
              duration: "",
              weight: "50",
              unit: "lb",
            },
          ],
        }),
        timedCatalog,
      ),
    ).toBeNull();
  });

  it("carries reps and hold together, and keeps a set whose hold is blank", () => {
    // The finisher case: hold only on the last set is why no per-set toggle is needed.
    const set = (reps: string, duration: string) => ({
      reps,
      repsLeft: "",
      repsRight: "",
      duration,
      weight: "",
      unit: "bw",
    });
    const input = draftToSessionInput(
      timedDraft({
        exerciseId: "ex-pushup",
        exerciseName: "Push-up",
        measure: "reps_and_time",
        sets: [set("10", ""), set("10", "20")],
      }),
      timedCatalog,
    );
    expect(input?.exercises[0].sets).toEqual([
      {
        reps: 10,
        repsLeft: null,
        repsRight: null,
        durationSeconds: null,
        weight: null,
        unit: "bw",
      },
      {
        reps: 10,
        repsLeft: null,
        repsRight: null,
        durationSeconds: 20,
        weight: null,
        unit: "bw",
      },
    ]);
  });

  it("drops a typed hold when the exercise no longer measures time", () => {
    // Switching the catalog back to reps must not smuggle the old duration through.
    const input = draftToSessionInput(
      timedDraft({
        measure: "reps",
        sets: [
          {
            reps: "12",
            repsLeft: "",
            repsRight: "",
            duration: "45",
            weight: "",
            unit: "bw",
          },
        ],
      }),
      timedCatalog,
    );
    expect(input?.exercises[0].sets[0].durationSeconds).toBeNull();
    expect(input?.exercises[0].sets[0].reps).toBe(12);
  });

  it("rejects an unparseable hold rather than writing a bad number", () => {
    const input = draftToSessionInput(
      timedDraft({
        sets: [
          {
            reps: "",
            repsLeft: "",
            repsRight: "",
            duration: "1:90",
            weight: "",
            unit: "bw",
          },
        ],
      }),
      timedCatalog,
    );
    expect(input?.exercises[0].sets[0].durationSeconds).toBeNull();
  });
});

describe("setsFromHistory — durations", () => {
  it("copies a prior hold into the new draft", () => {
    expect(
      setsFromHistory(
        [
          {
            reps: null,
            repsLeft: null,
            repsRight: null,
            durationSeconds: 45,
            weight: null,
            unit: "bw",
          },
        ],
        { equipment: "bodyweight", measure: "time", unilateral: false },
      )[0].duration,
    ).toBe("45");
  });

  it("leaves the hold out when the exercise measures reps only", () => {
    expect(
      setsFromHistory(
        [
          {
            reps: 10,
            repsLeft: null,
            repsRight: null,
            durationSeconds: 45,
            weight: null,
            unit: "bw",
          },
        ],
        { equipment: "bodyweight", measure: "reps", unilateral: false },
      )[0],
    ).toMatchObject({ reps: "10", duration: "" });
  });
});
