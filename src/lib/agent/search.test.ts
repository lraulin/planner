import { describe, expect, it } from "vitest";
import { row } from "@/lib/tree/fixtures";
import type { OutlineNode } from "@/lib/tree/types";
import { filterOutline } from "./search";

/** The shared row builder plus the derived fields, so widening `OutlineRow` stays a
 * one-file change. `filterOutline` reads none of the derived values. */
function node(
  partial: Partial<OutlineNode> & Pick<OutlineNode, "id" | "type" | "name">,
): OutlineNode {
  return {
    ...row(partial),
    lapLetter: null,
    lapRank: null,
    resultAreaName: null,
    projectPriorityLetter: null,
    projectPriorityRank: null,
    effectiveCategory: null,
    effortRollupMinutes: null,
    effortLeftRollupMinutes: null,
    actualEffortRollupMinutes: 0,
    percentCompleteRollup: 0,
    childCount: 0,
    hasChildren: false,
    hasActiveChildren: false,
    hidden: false,
    shelf: null,
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
