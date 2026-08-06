import { describe, expect, it } from "vitest";
import type { OutlineNode } from "./types";
import { zoomBranch, zoomOutRoot } from "./zoom";

const node = (
  id: string,
  parentId: string | null,
  depth: number,
  extra: Partial<OutlineNode> = {},
): OutlineNode =>
  ({
    id,
    parentId,
    depth,
    name: id,
    type: "task",
    hidden: false,
    collapsed: false,
    ...extra,
  }) as OutlineNode;

describe("outline zoom", () => {
  const nodes = [
    node("area", null, 0),
    node("project", "area", 1),
    node("task", "project", 2),
  ];

  it("keeps a complete branch and rebases the zoom root", () => {
    const result = zoomBranch(nodes, "project");
    expect(result.stale).toBe(false);
    expect(result.nodes.map((entry) => entry.id)).toEqual(["project", "task"]);
    expect(result.nodes[0].depth).toBe(0);
  });

  // Indentation is drawn straight from `depth`. Rebasing only the root would leave the
  // branch indented as if the levels above it were still on screen — a task two levels
  // down from a root that is now at zero.
  it("rebases the whole branch, not just the root", () => {
    const deep = [
      node("area", null, 0),
      node("goal", "area", 1),
      node("project", "goal", 2),
      node("task", "project", 3),
    ];
    expect(
      zoomBranch(deep, "goal").nodes.map((entry) => [entry.id, entry.depth]),
    ).toEqual([
      ["goal", 0],
      ["project", 1],
      ["task", 2],
    ]);
  });

  // `hidden` means "an ancestor is collapsed". Ancestors above the zoom root are no longer
  // on screen, so their collapse cannot go on hiding the branch — otherwise zooming to an
  // item inside a collapsed area (which the item picker searches) shows the root alone.
  it("stops a collapsed ancestor above the root from hiding the branch", () => {
    const collapsedArea = [
      node("area", null, 0, { collapsed: true }),
      node("project", "area", 1, { hidden: true }),
      node("task", "project", 2, { hidden: true }),
    ];
    expect(
      zoomBranch(collapsedArea, "project").nodes.map((entry) => [
        entry.id,
        entry.hidden,
      ]),
    ).toEqual([
      ["project", false],
      ["task", false],
    ]);
  });

  // A collapse *inside* the branch is still the user's, and survives the zoom.
  it("keeps a collapse that lives inside the zoomed branch", () => {
    const collapsedProject = [
      node("area", null, 0),
      node("project", "area", 1, { collapsed: true }),
      node("task", "project", 2, { hidden: true }),
    ];
    expect(
      zoomBranch(collapsedProject, "area").nodes.map((entry) => [
        entry.id,
        entry.hidden,
      ]),
    ).toEqual([
      ["area", false],
      ["project", false],
      ["task", true],
    ]);
  });

  it("clears a stale root and walks out one ancestor at a time", () => {
    expect(zoomBranch(nodes, "gone")).toEqual({ nodes: [], stale: true });
    expect(zoomOutRoot(nodes, "task")).toBe("project");
    expect(zoomOutRoot(nodes, "area")).toBeNull();
  });
});
