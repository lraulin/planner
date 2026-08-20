import { describe, expect, it } from "vitest";
import {
  formatSetMeasureToken,
  formatSetRepsToken,
  formatSetsLabel,
  parseReps,
  parseWeight,
} from "./format";

describe("formatSetsLabel", () => {
  it("collapses identical sets to N×reps @ weight", () => {
    expect(
      formatSetsLabel([
        {
          reps: 5,
          repsLeft: null,
          repsRight: null,
          durationSeconds: null,
          weight: 185,
          unit: "lb",
          completed: true,
        },
        {
          reps: 5,
          repsLeft: null,
          repsRight: null,
          durationSeconds: null,
          weight: 185,
          unit: "lb",
          completed: true,
        },
        {
          reps: 5,
          repsLeft: null,
          repsRight: null,
          durationSeconds: null,
          weight: 185,
          unit: "lb",
          completed: true,
        },
      ]),
    ).toBe("3×5 @ 185 lb");
  });

  it("lists varying reps and weights", () => {
    expect(
      formatSetsLabel([
        {
          reps: 5,
          repsLeft: null,
          repsRight: null,
          durationSeconds: null,
          weight: 185,
          unit: "lb",
          completed: true,
        },
        {
          reps: 3,
          repsLeft: null,
          repsRight: null,
          durationSeconds: null,
          weight: 195,
          unit: "lb",
          completed: true,
        },
      ]),
    ).toBe("5, 3 @ 185/195 lb");
  });

  it("ignores incomplete sets", () => {
    expect(
      formatSetsLabel([
        {
          reps: 5,
          repsLeft: null,
          repsRight: null,
          durationSeconds: null,
          weight: 100,
          unit: "lb",
          completed: true,
        },
        {
          reps: 5,
          repsLeft: null,
          repsRight: null,
          durationSeconds: null,
          weight: 100,
          unit: "lb",
          completed: false,
        },
      ]),
    ).toBe("1×5 @ 100 lb");
  });

  it("labels bodyweight sets without a weight", () => {
    expect(
      formatSetsLabel([
        {
          reps: 8,
          repsLeft: null,
          repsRight: null,
          durationSeconds: null,
          weight: null,
          unit: "bw",
          completed: true,
        },
        {
          reps: 8,
          repsLeft: null,
          repsRight: null,
          durationSeconds: null,
          weight: null,
          unit: "bw",
          completed: true,
        },
        {
          reps: 8,
          repsLeft: null,
          repsRight: null,
          durationSeconds: null,
          weight: null,
          unit: "bw",
          completed: true,
        },
      ]),
    ).toBe("3×8 BW");
  });

  it("formats unilateral L/R reps", () => {
    expect(
      formatSetsLabel([
        {
          reps: null,
          repsLeft: 8,
          repsRight: 6,
          durationSeconds: null,
          weight: 50,
          unit: "lb",
          completed: true,
        },
        {
          reps: null,
          repsLeft: 8,
          repsRight: 6,
          durationSeconds: null,
          weight: 50,
          unit: "lb",
          completed: true,
        },
      ]),
    ).toBe("2×8/6 @ 50 lb");
  });

  it("formats unilateral bodyweight", () => {
    expect(
      formatSetsLabel([
        {
          reps: null,
          repsLeft: 10,
          repsRight: 8,
          durationSeconds: null,
          weight: null,
          unit: "bw",
          completed: true,
        },
      ]),
    ).toBe("1×10/8 BW");
  });
});

describe("formatSetRepsToken", () => {
  it("uses L/R when present", () => {
    expect(formatSetRepsToken({ reps: null, repsLeft: 8, repsRight: 7 })).toBe("8/7");
    expect(formatSetRepsToken({ reps: 5, repsLeft: null, repsRight: null })).toBe("5");
  });
});

describe("parseWeight / parseReps", () => {
  it("accepts decimals and rejects junk", () => {
    expect(parseWeight("185.5")).toBe(185.5);
    expect(parseWeight("")).toBeNull();
    expect(parseWeight("nope")).toBeNull();
    expect(parseWeight(-1)).toBeNull();
  });

  it("requires integer reps", () => {
    expect(parseReps(5)).toBe(5);
    expect(parseReps("5.5")).toBeNull();
    expect(parseReps("")).toBeNull();
  });
});

describe("formatSetMeasureToken", () => {
  const base = { reps: null, repsLeft: null, repsRight: null, durationSeconds: null };

  it("reads a hold when there are no reps", () => {
    expect(formatSetMeasureToken({ ...base, durationSeconds: 45 })).toBe("45s");
    expect(formatSetMeasureToken({ ...base, durationSeconds: 90 })).toBe("1:30");
  });

  it("reads reps then hold when the set has both", () => {
    expect(formatSetMeasureToken({ ...base, reps: 10, durationSeconds: 20 })).toBe(
      "10 + 20s",
    );
    expect(
      formatSetMeasureToken({
        ...base,
        repsLeft: 8,
        repsRight: 6,
        durationSeconds: 20,
      }),
    ).toBe("8/6 + 20s");
  });

  it("is unchanged for a plain reps set", () => {
    expect(formatSetMeasureToken({ ...base, reps: 5 })).toBe("5");
    expect(formatSetMeasureToken({ ...base, repsLeft: 8, repsRight: 6 })).toBe("8/6");
  });

  it("is unknown only when the set recorded nothing", () => {
    expect(formatSetMeasureToken(base)).toBe("?");
  });
});

describe("formatSetsLabel — timed sets", () => {
  function timed(durationSeconds: number, weight: number | null, unit: string) {
    return {
      reps: null,
      repsLeft: null,
      repsRight: null,
      durationSeconds,
      weight,
      unit,
      completed: true,
    };
  }

  it("collapses identical bodyweight holds", () => {
    expect(
      formatSetsLabel([
        timed(45, null, "bw"),
        timed(45, null, "bw"),
        timed(45, null, "bw"),
      ]),
    ).toBe("3×45s BW");
  });

  it("keeps the load on a weighted carry", () => {
    // The whole point of measure being independent of equipment.
    expect(formatSetsLabel([timed(90, 50, "lb"), timed(90, 50, "lb")])).toBe(
      "2×1:30 @ 50 lb",
    );
  });

  it("lists varying holds rather than collapsing them", () => {
    expect(formatSetsLabel([timed(60, null, "bw"), timed(45, null, "bw")])).toBe(
      "1:00, 45s BW",
    );
  });

  it("labels a reps-then-hold exercise, hold optional per set", () => {
    const set = (reps: number, durationSeconds: number | null) => ({
      reps,
      repsLeft: null,
      repsRight: null,
      durationSeconds,
      weight: null,
      unit: "bw",
      completed: true,
    });
    expect(formatSetsLabel([set(10, 20), set(10, 20)])).toBe("2×10 + 20s BW");
    expect(formatSetsLabel([set(10, null), set(10, 20)])).toBe("10, 10 + 20s BW");
  });
});
