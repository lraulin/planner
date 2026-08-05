import { describe, expect, it } from "vitest";
import type { OutlineNode } from "./types";
import { flattenLevels, type FlattenableLevel } from "./flattenLevels";

type Shape = [name: string, parent: string | null, depth: number, type: string];

/**
 * Career (area)
 *   Ship it (goal)
 *     Website (project)
 *       Write copy (task)
 *   Loose project (project)          ← under the area, no goal
 * Health (area)
 *   Someday (dream)
 *     Run a marathon (project)
 */
const SHAPE: Shape[] = [
  ["Career", null, 0, "result_area"],
  ["Ship it", "Career", 1, "goal"],
  ["Website", "Ship it", 2, "project"],
  ["Write copy", "Website", 3, "task"],
  ["Loose project", "Career", 1, "project"],
  ["Health", null, 0, "result_area"],
  ["Someday", "Health", 1, "goal"],
  ["Run a marathon", "Someday", 2, "project"],
];

function tree(): OutlineNode[] {
  return SHAPE.map(([name, parent, depth, type]) => ({
    id: name,
    parentId: parent,
    depth,
    type,
    name,
    isDream: name === "Someday",
  })) as unknown as OutlineNode[];
}

function flat(...hidden: FlattenableLevel[]): string[] {
  return flattenLevels(tree(), new Set(hidden)).map(
    (node) => `${"  ".repeat(node.depth)}${node.name}`,
  );
}

describe("flattenLevels", () => {
  it("returns the tree untouched when nothing is hidden", () => {
    expect(flat()).toEqual([
      "Career",
      "  Ship it",
      "    Website",
      "      Write copy",
      "  Loose project",
      "Health",
      "  Someday",
      "    Run a marathon",
    ]);
  });

  it("promotes the children of a hidden level to top level", () => {
    // This is the whole point, and the opposite of what the old checkbox did: turning
    // Areas off used to empty the grid.
    expect(flat("result_area")).toEqual([
      "Ship it",
      "  Website",
      "    Write copy",
      "Loose project",
      "Someday",
      "  Run a marathon",
    ]);
  });

  it("treats a dream as a goal, so one switch cannot strand it a level deeper", () => {
    expect(flat("goal")).toEqual([
      "Career",
      "  Website",
      "    Write copy",
      "  Loose project",
      "Health",
      "  Run a marathon",
    ]);
  });

  it("re-depths by surviving ancestry, not by a constant", () => {
    // Website rises two levels (area + goal gone) while Loose project rises one — it never
    // had a goal above it. Subtracting a fixed amount would put them at different depths
    // than the tree they now belong to.
    expect(flat("result_area", "goal")).toEqual([
      "Website",
      "  Write copy",
      "Loose project",
      "Run a marathon",
    ]);
  });

  it("keeps tree order", () => {
    const names = flattenLevels(tree(), new Set<FlattenableLevel>(["goal"])).map(
      (node) => node.name,
    );
    expect(names).toEqual([
      "Career",
      "Website",
      "Write copy",
      "Loose project",
      "Health",
      "Run a marathon",
    ]);
  });

  it("leaves untouched rows as the same objects", () => {
    // Only the re-depthed rows are copied, so the rest keep referential identity and the
    // grid does not re-render every cell because one level was hidden.
    const before = tree();
    const after = flattenLevels(before, new Set<FlattenableLevel>(["goal"]));
    expect(after[0]).toBe(before[0]); // Career, still depth 0
    expect(after[1]).not.toBe(before[2]); // Website, re-depthed
  });

  it("does not mutate its input", () => {
    const before = tree();
    flattenLevels(before, new Set<FlattenableLevel>(["result_area", "goal"]));
    expect(before.map((node) => node.depth)).toEqual(SHAPE.map(([, , depth]) => depth));
  });
});
