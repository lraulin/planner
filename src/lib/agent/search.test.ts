import { describe, expect, it } from "vitest";
import type { OutlineNode } from "@/lib/tree/types";
import { filterOutline } from "./search";

function node(
  partial: Partial<OutlineNode> & Pick<OutlineNode, "id" | "type" | "name">,
): OutlineNode {
  return {
    parentId: null,
    sortKey: "a0",
    priorityLetter: null,
    priorityRank: null,
    state: "not_started",
    deadline: null,
    focus: false,
    collapsed: false,
    notes: "",
    completedAt: null,
    depth: 0,
    effortMinutes: null,
    effortLeftMinutes: null,
    actualEffortMinutes: null,
    percentComplete: null,
    contexts: [],
    color: null,
    category: null,
    targetStart: null,
    targetEnd: null,
    purpose: "",
    assignedTo: "",
    definition: "",
    range: "",
    isDream: false,
    lapLetter: null,
    lapRank: null,
    effortRollupMinutes: null,
    effortLeftRollupMinutes: null,
    actualEffortRollupMinutes: 0,
    percentCompleteRollup: 0,
    childCount: 0,
    hasChildren: false,
    hidden: false,
    ...partial,
  };
}

describe("filterOutline", () => {
  const outline: OutlineNode[] = [
    node({ id: "ra", type: "result_area", name: "Work", depth: 0 }),
    node({
      id: "p1",
      type: "project",
      name: "Ship API",
      parentId: "ra",
      depth: 1,
      focus: true,
      priorityLetter: "A",
      priorityRank: 1,
    }),
    node({
      id: "t1",
      type: "task",
      name: "Write tools",
      parentId: "p1",
      depth: 2,
      state: "in_progress",
      priorityLetter: "A",
    }),
    node({
      id: "t2",
      type: "task",
      name: "Old work",
      parentId: "p1",
      depth: 2,
      state: "completed",
    }),
  ];

  it("excludes completed by default", () => {
    const rows = filterOutline(outline, { type: "task" });
    expect(rows.map((r) => r.id)).toEqual(["t1"]);
  });

  it("matches name query case-insensitively", () => {
    const rows = filterOutline(outline, { query: "ship" });
    expect(rows.map((r) => r.id)).toEqual(["p1"]);
  });

  it("filters focus and builds path labels", () => {
    const rows = filterOutline(outline, { focus: true });
    expect(rows).toHaveLength(1);
    expect(rows[0].path).toBe("Work / Ship API");
  });

  it("respects parentId", () => {
    const rows = filterOutline(outline, { parentId: "p1", includeCompleted: true });
    expect(rows.map((r) => r.id).sort()).toEqual(["t1", "t2"]);
  });
});
