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

/** The tree, optionally with some rows collapsed (and their subtrees `hidden` for it). */
function tree(...collapsed: string[]): OutlineNode[] {
  const nodes = SHAPE.map(([name, parent, depth, type]) => ({
    id: name,
    parentId: parent,
    depth,
    type,
    name,
    isDream: name === "Someday",
    collapsed: collapsed.includes(name),
    hidden: false,
  })) as unknown as OutlineNode[];

  // What `derive` does: a row is hidden when any ancestor is collapsed.
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    const parent = node.parentId === null ? null : byId.get(node.parentId)!;
    if (parent) node.hidden = parent.hidden || parent.collapsed;
  }
  return nodes;
}

function render(nodes: readonly OutlineNode[]): string[] {
  return nodes
    .filter((node) => !node.hidden)
    .map((node) => `${"  ".repeat(node.depth)}${node.name}`);
}

function flat(...hidden: FlattenableLevel[]): string[] {
  return render(flattenLevels(tree(), new Set(hidden)));
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

  it("shows the subtree of a collapsed row whose own level was dissolved", () => {
    // The bug: collapsing Career and then turning Areas off left its whole branch out of
    // the grid. Collapsing is not filtering — Career is gone, so nothing is holding its
    // goals shut, and they arrive at the top level like Health's do.
    expect(
      render(flattenLevels(tree("Career"), new Set<FlattenableLevel>(["result_area"]))),
    ).toEqual([
      "Ship it",
      "  Website",
      "    Write copy",
      "Loose project",
      "Someday",
      "  Run a marathon",
    ]);
  });

  it("keeps a surviving collapsed row's subtree hidden", () => {
    // Ship it is still on screen with a twisty to click, so unticking Areas must not blow
    // its subtree open — only the dissolved level loses its grip.
    expect(
      render(
        flattenLevels(tree("Ship it"), new Set<FlattenableLevel>(["result_area"])),
      ),
    ).toEqual(["Ship it", "Loose project", "Someday", "  Run a marathon"]);
  });

  it("hides a promoted row when an ancestor above the dissolved level is collapsed", () => {
    // Career survives Goals being turned off and is collapsed, so Ship it's children come
    // up to sit under it — still hidden, because the row that hid them is still there.
    expect(
      render(flattenLevels(tree("Career"), new Set<FlattenableLevel>(["goal"]))),
    ).toEqual(["Career", "Health", "  Run a marathon"]);
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
