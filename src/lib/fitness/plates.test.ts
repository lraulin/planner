import { describe, expect, it } from "vitest";
import { calculatePlates, formatPlateLoad, plateHint } from "./plates";

describe("calculatePlates (American lb)", () => {
  it("loads 225 as two 45s per side on a 45 bar", () => {
    const load = calculatePlates(225, "lb");
    expect(load).not.toBeNull();
    expect(load!.bar).toBe(45);
    expect(load!.perSide).toEqual([45, 45]);
    expect(load!.counts).toEqual([{ plate: 45, count: 2 }]);
    expect(load!.remainder).toBe(0);
  });

  it("loads 185 as 45 + 25 per side", () => {
    const load = calculatePlates(185, "lb");
    expect(load!.perSide).toEqual([45, 25]);
    expect(formatPlateLoad(load)).toBe("45 + 25 per side");
  });

  it("uses 2.5 plates when needed", () => {
    const load = calculatePlates(140, "lb");
    // (140 - 45) / 2 = 47.5 → 45 + 2.5
    expect(load!.perSide).toEqual([45, 2.5]);
    expect(load!.remainder).toBe(0);
  });

  it("returns bar-only for exactly bar weight", () => {
    const load = calculatePlates(45, "lb");
    expect(load!.perSide).toEqual([]);
    expect(formatPlateLoad(load)).toBe("bar only (45 lb)");
  });

  it("returns null for non-positive totals", () => {
    expect(calculatePlates(0, "lb")).toBeNull();
    expect(calculatePlates(-10, "lb")).toBeNull();
  });

  it("uses a 15 lb EZ bar when configured", () => {
    // 65 total = 15 bar + 25 per side
    const load = calculatePlates(65, "lb", 15);
    expect(load!.bar).toBe(15);
    expect(load!.perSide).toEqual([25]);
    expect(formatPlateLoad(load)).toBe("25 per side");
  });

  it("skips plate math when bar weight is 0 (dumbbells)", () => {
    expect(calculatePlates(50, "lb", 0)).toBeNull();
    expect(plateHint(50, "lb", 0)).toBeNull();
  });
});

describe("plateHint", () => {
  it("formats a common work set", () => {
    expect(plateHint(135, "lb")).toBe("45 per side");
  });

  it("returns null when weight is empty", () => {
    expect(plateHint(null, "lb")).toBeNull();
    expect(plateHint(undefined, "lb")).toBeNull();
  });
});
