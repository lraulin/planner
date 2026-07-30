import { describe, expect, it } from "vitest";
import { barPresetId, barWeightInUnit, parseBarWeight } from "./bars";

describe("barPresetId", () => {
  it("recognises EZ and Olympic", () => {
    expect(barPresetId(15)).toBe("ez");
    expect(barPresetId(45)).toBe("olympic");
    expect(barPresetId(0)).toBe("none");
    expect(barPresetId(12)).toBe("custom");
  });
});

describe("barWeightInUnit", () => {
  it("keeps lb as-is and approximates kg", () => {
    expect(barWeightInUnit(45, "lb")).toBe(45);
    expect(barWeightInUnit(45, "kg")).toBe(20);
    expect(barWeightInUnit(15, "kg")).toBe(7);
  });
});

describe("parseBarWeight", () => {
  it("defaults empty to Olympic 45", () => {
    expect(parseBarWeight("")).toBe(45);
    expect(parseBarWeight("15")).toBe(15);
  });
});
