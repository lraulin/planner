import { describe, expect, it } from "vitest";
import { gridTemplate, setColumns, type SetShape } from "./setColumns";

function keys(shape: SetShape): string[] {
  return setColumns(shape).map((c) => c.key);
}

function labels(shape: SetShape): string[] {
  return setColumns(shape).map((c) => c.label);
}

describe("setColumns — the four shapes that existed before measure", () => {
  it("bodyweight reps: index, reps, delete", () => {
    expect(
      keys({ measure: "reps", equipment: "bodyweight", unilateral: false }),
    ).toEqual(["index", "reps", "delete"]);
  });

  it("bodyweight unilateral reps: L and R, no weight", () => {
    expect(
      keys({ measure: "reps", equipment: "bodyweight", unilateral: true }),
    ).toEqual(["index", "repsLeft", "repsRight", "delete"]);
  });

  it("barbell reps: reps, weight, unit", () => {
    expect(keys({ measure: "reps", equipment: "barbell", unilateral: false })).toEqual([
      "index",
      "reps",
      "weight",
      "unit",
      "delete",
    ]);
  });

  it("dumbbell unilateral reps: L, R, weight, unit", () => {
    expect(keys({ measure: "reps", equipment: "dumbbell", unilateral: true })).toEqual([
      "index",
      "repsLeft",
      "repsRight",
      "weight",
      "unit",
      "delete",
    ]);
  });

  it("keeps the grid templates the hand-written variants used", () => {
    // Regression guard: these four rows shipped before measure existed and must not shift.
    expect(
      gridTemplate(
        setColumns({ measure: "reps", equipment: "bodyweight", unilateral: false }),
      ),
    ).toBe("2rem 1fr 2rem");
    expect(
      gridTemplate(
        setColumns({ measure: "reps", equipment: "bodyweight", unilateral: true }),
      ),
    ).toBe("2rem 1fr 1fr 2rem");
    expect(
      gridTemplate(
        setColumns({ measure: "reps", equipment: "barbell", unilateral: false }),
      ),
    ).toBe("2rem minmax(3rem,1fr) minmax(7rem,1.4fr) 3.5rem 2rem");
    expect(
      gridTemplate(
        setColumns({ measure: "reps", equipment: "dumbbell", unilateral: true }),
      ),
    ).toBe(
      "2rem minmax(2.5rem,0.7fr) minmax(2.5rem,0.7fr) minmax(6.5rem,1.3fr) 3.5rem 2rem",
    );
  });
});

describe("setColumns — timed shapes", () => {
  it("a bodyweight hold drops reps for a duration", () => {
    expect(
      keys({ measure: "time", equipment: "bodyweight", unilateral: false }),
    ).toEqual(["index", "duration", "delete"]);
  });

  it("a loaded carry keeps its weight beside the duration", () => {
    // The whole reason measure is not an equipment kind.
    expect(keys({ measure: "time", equipment: "dumbbell", unilateral: false })).toEqual(
      ["index", "duration", "weight", "unit", "delete"],
    );
  });

  it("reps + hold shows both, in the order they are performed", () => {
    expect(
      keys({ measure: "reps_and_time", equipment: "bodyweight", unilateral: false }),
    ).toEqual(["index", "reps", "duration", "delete"]);
    expect(
      keys({ measure: "reps_and_time", equipment: "barbell", unilateral: false }),
    ).toEqual(["index", "reps", "duration", "weight", "unit", "delete"]);
  });

  it("names the duration column for what it is in context", () => {
    expect(
      labels({ measure: "time", equipment: "bodyweight", unilateral: false }),
    ).toContain("Time");
    expect(
      labels({ measure: "reps_and_time", equipment: "bodyweight", unilateral: false }),
    ).toContain("Hold");
  });

  it("ignores unilateral for the duration — a side plank is two sets", () => {
    expect(
      keys({ measure: "time", equipment: "bodyweight", unilateral: true }),
    ).toEqual(["index", "duration", "delete"]);
  });

  it("still pairs L/R reps with a hold when the exercise does both", () => {
    expect(
      keys({ measure: "reps_and_time", equipment: "dumbbell", unilateral: true }),
    ).toEqual([
      "index",
      "repsLeft",
      "repsRight",
      "duration",
      "weight",
      "unit",
      "delete",
    ]);
  });

  it("narrows the rep tracks once a duration competes for the row", () => {
    expect(
      gridTemplate(
        setColumns({
          measure: "reps_and_time",
          equipment: "bodyweight",
          unilateral: false,
        }),
      ),
    ).toBe("2rem minmax(3rem,1fr) 1fr 2rem");
  });
});
