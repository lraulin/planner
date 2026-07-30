import { describe, expect, it } from "vitest";
import { bumpWeight, weightStep } from "./weightStep";

describe("weightStep", () => {
  it("uses 5 lb and 2.5 kg", () => {
    expect(weightStep("lb")).toBe(5);
    expect(weightStep("kg")).toBe(2.5);
    expect(weightStep("bw")).toBe(5); // unused for BW, but default is lb-ish
  });
});

describe("bumpWeight", () => {
  it("steps lb by 5", () => {
    expect(bumpWeight("185", "lb", 1)).toBe("190");
    expect(bumpWeight("185", "lb", -1)).toBe("180");
  });

  it("starts from empty at one step", () => {
    expect(bumpWeight("", "lb", 1)).toBe("5");
    expect(bumpWeight("", "lb", -1)).toBe("");
  });

  it("clears at or below zero", () => {
    expect(bumpWeight("5", "lb", -1)).toBe("");
    expect(bumpWeight("3", "lb", -1)).toBe("");
  });

  it("steps kg by 2.5 without float junk", () => {
    expect(bumpWeight("60", "kg", 1)).toBe("62.5");
    expect(bumpWeight("62.5", "kg", 1)).toBe("65");
  });
});
