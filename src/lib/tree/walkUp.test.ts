import { describe, expect, it } from "vitest";
import type { NodeType } from "@/db/schema";
import type { OutlineNode } from "./types";
import { collapsedAncestorIds, walkUp } from "./walkUp";

const node = (
  id: string,
  parentId: string | null,
  type: NodeType = "task",
): OutlineNode => ({ id, parentId, type, name: id, depth: 0 }) as OutlineNode;

describe("walkUp", () => {
  it("yields self then each ancestor, nearest first", () => {
    const byId = new Map(
      [
        node("area", null, "result_area"),
        node("goal", "area", "goal"),
        node("task", "goal"),
      ].map((n) => [n.id, n]),
    );
    expect([...walkUp(byId.get("task"), byId)].map((n) => n.id)).toEqual([
      "task",
      "goal",
      "area",
    ]);
  });

  it("yields nothing for an undefined start", () => {
    expect([...walkUp(undefined, new Map())]).toEqual([]);
  });

  it("terminates on a parent cycle rather than hanging", () => {
    // Same insurance `owningProjectId` already carries: corruption gets a truncated walk.
    const byId = new Map([node("a", "b"), node("b", "a")].map((n) => [n.id, n]));
    expect([...walkUp(byId.get("a"), byId)].map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("stops when a parent id is missing from the map", () => {
    const byId = new Map([node("orphan", "ghost")].map((n) => [n.id, n]));
    expect([...walkUp(byId.get("orphan"), byId)].map((n) => n.id)).toEqual(["orphan"]);
  });
});

describe("collapsedAncestorIds", () => {
  const tree = (flags: Record<string, boolean>): OutlineNode[] => [
    { ...node("area", null, "result_area"), collapsed: flags.area ?? false },
    { ...node("goal", "area", "goal"), collapsed: flags.goal ?? false },
    { ...node("task", "goal"), collapsed: flags.task ?? false },
  ];

  it("names only the ancestors that are collapsed, not the target", () => {
    expect(collapsedAncestorIds(tree({ area: true, goal: true }), "task")).toEqual([
      "goal",
      "area",
    ]);
    expect(collapsedAncestorIds(tree({ task: true }), "task")).toEqual([]);
  });

  it("returns empty for a fully expanded path or an unknown id", () => {
    expect(collapsedAncestorIds(tree({}), "task")).toEqual([]);
    expect(collapsedAncestorIds(tree({ area: true }), "ghost")).toEqual([]);
  });
});
