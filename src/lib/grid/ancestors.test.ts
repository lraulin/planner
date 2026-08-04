import { describe, expect, it } from "vitest";
import { withAncestors, type DepthRow } from "./ancestors";

/**
 * ra
 *   goal
 *     project
 *       task-a
 *       task-b
 *   project-2
 * ra-2
 *   task-c
 */
const TREE: DepthRow[] = [
  { id: "ra", depth: 0 },
  { id: "goal", depth: 1 },
  { id: "project", depth: 2 },
  { id: "task-a", depth: 3 },
  { id: "task-b", depth: 3 },
  { id: "project-2", depth: 1 },
  { id: "ra-2", depth: 0 },
  { id: "task-c", depth: 1 },
];

function closure(...ids: string[]): string[] {
  return [...withAncestors(TREE, new Set(ids))].sort();
}

describe("withAncestors", () => {
  it("pulls in the whole parent chain of a deep match", () => {
    expect(closure("task-a")).toEqual(["goal", "project", "ra", "task-a"]);
  });

  it("only pulls the chain the match actually sits under", () => {
    // task-c is under ra-2, so nothing from the first result area comes with it.
    expect(closure("task-c")).toEqual(["ra-2", "task-c"]);
  });

  it("adds nothing for a root match", () => {
    expect(closure("ra")).toEqual(["ra"]);
  });

  it("merges the chains of several matches without duplicating them", () => {
    expect(closure("task-a", "task-b")).toEqual([
      "goal",
      "project",
      "ra",
      "task-a",
      "task-b",
    ]);
  });

  it("does not pull in siblings, only ancestors", () => {
    const result = closure("task-a");
    expect(result).not.toContain("task-b");
    expect(result).not.toContain("project-2");
    expect(result).not.toContain("ra-2");
  });

  it("leaves a flat list untouched — every row is its own ancestor set", () => {
    const flat: DepthRow[] = [
      { id: "a", depth: 0 },
      { id: "b", depth: 0 },
      { id: "c", depth: 0 },
    ];
    const passIds = new Set(["b"]);
    // Same object back: a grid with no tree pays nothing for this.
    expect(withAncestors(flat, passIds)).toBe(passIds);
  });

  it("returns the same set when the matches already include their ancestors", () => {
    const passIds = new Set(["ra", "goal"]);
    expect(withAncestors(TREE, passIds)).toBe(passIds);
  });

  it("is a no-op on an empty match set — filtering to nothing still shows nothing", () => {
    const passIds = new Set<string>();
    expect(withAncestors(TREE, passIds)).toBe(passIds);
  });

  it("treats a deeper row after a shallower one as its child, not its sibling", () => {
    // The stack has to pop by depth, not by count: task-c follows task-b (depth 3) but is
    // depth 1, so its ancestor is ra-2 alone.
    expect(closure("task-b", "task-c")).toEqual([
      "goal",
      "project",
      "ra",
      "ra-2",
      "task-b",
      "task-c",
    ]);
  });
});
