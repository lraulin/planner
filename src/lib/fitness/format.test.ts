import { describe, expect, it } from "vitest";
import { formatSetRepsToken, formatSetsLabel, parseReps, parseWeight } from "./format";

describe("formatSetsLabel", () => {
  it("collapses identical sets to N×reps @ weight", () => {
    expect(
      formatSetsLabel([
        {
          reps: 5,
          repsLeft: null,
          repsRight: null,
          weight: 185,
          unit: "lb",
          completed: true,
        },
        {
          reps: 5,
          repsLeft: null,
          repsRight: null,
          weight: 185,
          unit: "lb",
          completed: true,
        },
        {
          reps: 5,
          repsLeft: null,
          repsRight: null,
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
          weight: 185,
          unit: "lb",
          completed: true,
        },
        {
          reps: 3,
          repsLeft: null,
          repsRight: null,
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
          weight: 100,
          unit: "lb",
          completed: true,
        },
        {
          reps: 5,
          repsLeft: null,
          repsRight: null,
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
          weight: null,
          unit: "bw",
          completed: true,
        },
        {
          reps: 8,
          repsLeft: null,
          repsRight: null,
          weight: null,
          unit: "bw",
          completed: true,
        },
        {
          reps: 8,
          repsLeft: null,
          repsRight: null,
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
          weight: 50,
          unit: "lb",
          completed: true,
        },
        {
          reps: null,
          repsLeft: 8,
          repsRight: 6,
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
