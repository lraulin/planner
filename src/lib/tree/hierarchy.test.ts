import { describe, expect, it } from "vitest";
import {
  assertCanNest,
  canNest,
  defaultChildType,
  STATE_CODES,
  STATE_LABELS,
} from "./hierarchy";
import { nodeStateEnum } from "@/db/schema";

const ALL_TYPES = ["result_area", "goal", "project", "task"] as const;

describe("hierarchy", () => {
  // Capturing an idea must never require deciding where it lives first, so nothing is
  // homeless-illegal. A task at the top level is a legitimate resting state, not a
  // half-filed mistake.
  it("hosts every type at the top level", () => {
    for (const type of ALL_TYPES) {
      expect(canNest(type, null)).toBe(true);
    }
  });

  it("lets every type nest inside itself", () => {
    expect(canNest("result_area", "result_area")).toBe(true);
    expect(canNest("goal", "goal")).toBe(true);
    expect(canNest("project", "project")).toBe(true);
    expect(canNest("task", "task")).toBe(true);
  });

  it("lets a type sit under any broader type", () => {
    expect(canNest("goal", "result_area")).toBe(true);
    expect(canNest("project", "result_area")).toBe(true);
    expect(canNest("project", "goal")).toBe(true);
    expect(canNest("task", "result_area")).toBe(true);
    expect(canNest("task", "goal")).toBe(true);
    expect(canNest("task", "project")).toBe(true);
  });

  // The one rule: you cannot go backwards. Flipping the rank comparison would pass every
  // test above, so these are the ones that pin it.
  it("refuses to go backwards", () => {
    expect(canNest("result_area", "goal")).toBe(false);
    expect(canNest("result_area", "project")).toBe(false);
    expect(canNest("result_area", "task")).toBe(false);
    expect(canNest("goal", "project")).toBe(false);
    expect(canNest("goal", "task")).toBe(false);
    expect(canNest("project", "task")).toBe(false);
  });

  it("names both types when rejecting a nesting", () => {
    expect(() => assertCanNest("goal", "task")).toThrow(
      "A Goal cannot go under a Task.",
    );
    expect(() => assertCanNest("result_area", "project")).toThrow(
      "A Result Area cannot go under a Project.",
    );
  });

  it("picks a sensible type for a new child", () => {
    expect(defaultChildType(null)).toBe("result_area");
    expect(defaultChildType("result_area")).toBe("project");
    expect(defaultChildType("goal")).toBe("project");
    expect(defaultChildType("project")).toBe("task");
    expect(defaultChildType("task")).toBe("task");
  });

  it("only suggests child types that are actually legal", () => {
    for (const parent of [null, ...ALL_TYPES] as const) {
      expect(canNest(defaultChildType(parent), parent)).toBe(true);
    }
  });
});

describe("state vocabulary", () => {
  // Widening nodeStateEnum must not leave the grid printing an empty cell.
  it("labels and codes every state", () => {
    for (const state of nodeStateEnum.enumValues) {
      expect(STATE_LABELS[state]).toBeTruthy();
      expect(STATE_CODES[state]).toBeTruthy();
    }
  });

  it("keeps the codes distinct", () => {
    const codes = Object.values(STATE_CODES);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
