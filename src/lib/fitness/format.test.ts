import { describe, expect, it } from "vitest";
import { formatSetsLabel, parseReps, parseWeight } from "./format";

describe("formatSetsLabel", () => {
  it("collapses identical sets to N×reps @ weight", () => {
    expect(
      formatSetsLabel([
        { reps: 5, weight: 185, unit: "lb", completed: true },
        { reps: 5, weight: 185, unit: "lb", completed: true },
        { reps: 5, weight: 185, unit: "lb", completed: true },
      ]),
    ).toBe("3×5 @ 185 lb");
  });

  it("lists varying reps and weights", () => {
    expect(
      formatSetsLabel([
        { reps: 5, weight: 185, unit: "lb", completed: true },
        { reps: 3, weight: 195, unit: "lb", completed: true },
      ]),
    ).toBe("5, 3 @ 185/195 lb");
  });

  it("ignores incomplete sets", () => {
    expect(
      formatSetsLabel([
        { reps: 5, weight: 100, unit: "lb", completed: true },
        { reps: 5, weight: 100, unit: "lb", completed: false },
      ]),
    ).toBe("1×5 @ 100 lb");
  });

  it("labels bodyweight sets without a weight", () => {
    expect(
      formatSetsLabel([
        { reps: 8, weight: null, unit: "bw", completed: true },
        { reps: 8, weight: null, unit: "bw", completed: true },
        { reps: 8, weight: null, unit: "bw", completed: true },
      ]),
    ).toBe("3×8 BW");
  });

  it("lists varying bodyweight reps", () => {
    expect(
      formatSetsLabel([
        { reps: 10, weight: null, unit: "bw", completed: true },
        { reps: 8, weight: null, unit: "bw", completed: true },
      ]),
    ).toBe("10, 8 BW");
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
