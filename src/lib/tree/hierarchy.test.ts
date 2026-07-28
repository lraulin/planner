import { describe, expect, it } from "vitest";
import {
  assertCanNest,
  canNest,
  defaultChildType,
  STATE_CODES,
  STATE_LABELS,
} from "./hierarchy";
import { nodeStateEnum } from "@/db/schema";

describe("hierarchy", () => {
  it("puts result areas only at the top level", () => {
    expect(canNest("result_area", null)).toBe(true);
    expect(canNest("result_area", "result_area")).toBe(false);
    expect(canNest("result_area", "project")).toBe(false);
  });

  it("lets every type nest inside itself", () => {
    expect(canNest("goal", "goal")).toBe(true);
    expect(canNest("project", "project")).toBe(true);
    expect(canNest("task", "task")).toBe(true);
  });

  it("keeps the levels ordered", () => {
    expect(canNest("project", "result_area")).toBe(true);
    expect(canNest("project", "goal")).toBe(true);
    expect(canNest("task", "project")).toBe(true);

    expect(canNest("goal", "project")).toBe(false);
    expect(canNest("goal", "task")).toBe(false);
    expect(canNest("project", "task")).toBe(false);
  });

  it("keeps tasks out of the top level and off result areas", () => {
    expect(canNest("task", null)).toBe(false);
    expect(canNest("task", "result_area")).toBe(false);
    expect(canNest("task", "goal")).toBe(false);
  });

  it("keeps goals and projects off the top level", () => {
    expect(canNest("goal", null)).toBe(false);
    expect(canNest("project", null)).toBe(false);
  });

  it("names both types when rejecting a nesting", () => {
    expect(() => assertCanNest("task", "result_area")).toThrow(
      "A Task cannot go under a Result Area.",
    );
    expect(() => assertCanNest("goal", null)).toThrow(
      "A Goal cannot go under the top level.",
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
    for (const parent of [null, "result_area", "goal", "project", "task"] as const) {
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
