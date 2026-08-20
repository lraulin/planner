import { describe, expect, it } from "vitest";
import {
  formatMeasureTag,
  isExerciseMeasure,
  normaliseMeasure,
  tracksReps,
  tracksTime,
} from "./measure";

describe("normaliseMeasure", () => {
  it("falls back to reps for anything unrecognised", () => {
    expect(normaliseMeasure("time")).toBe("time");
    expect(normaliseMeasure("reps_and_time")).toBe("reps_and_time");
    expect(normaliseMeasure("isometric")).toBe("reps");
    expect(normaliseMeasure(null)).toBe("reps");
    expect(normaliseMeasure(undefined)).toBe("reps");
    expect(normaliseMeasure("")).toBe("reps");
  });

  it("narrows the type", () => {
    expect(isExerciseMeasure("time")).toBe(true);
    expect(isExerciseMeasure("distance")).toBe(false);
  });
});

describe("tracksReps / tracksTime", () => {
  it("overlap only on the hybrid", () => {
    expect([tracksReps("reps"), tracksTime("reps")]).toEqual([true, false]);
    expect([tracksReps("time"), tracksTime("time")]).toEqual([false, true]);
    expect([tracksReps("reps_and_time"), tracksTime("reps_and_time")]).toEqual([
      true,
      true,
    ]);
  });
});

describe("formatMeasureTag", () => {
  it("says nothing for the default and names the rest", () => {
    expect(formatMeasureTag("reps")).toBe("");
    expect(formatMeasureTag("time")).toBe("Hold");
    expect(formatMeasureTag("reps_and_time")).toBe("Reps + hold");
  });
});
