import { describe, expect, it } from "vitest";
import {
  isSelfOrDescendant,
  resolveCategoryGroupDrop,
  resolveDrop,
  withRootCategoryFromPlacement,
  type DropNode,
} from "./dnd";
import type { NodeType } from "@/db/schema";
import { derive } from "./derive";
import { row } from "./fixtures";
import { categoryGroupId, NO_CATEGORY } from "./slice";
import type { OutlineNode } from "./types";

function outlineTree(...rows: Parameters<typeof row>[0][]): OutlineNode[] {
  return derive(rows.map((r) => row(r)));
}

/**
 * A small outline used by most cases:
 *
 *   area          result_area
 *     goal        goal
 *       proj      project           (open, has children)
 *         t1      task
 *         t2      task
 *   area2         result_area       (collapsed, has children)
 *     goal2       goal
 *     proj2       project
 */
function tree(): Map<string, DropNode> {
  const nodes: DropNode[] = [
    node("area", null, "result_area", 0, { hasChildren: true }),
    node("goal", "area", "goal", 1, { hasChildren: true }),
    node("proj", "goal", "project", 2, { hasChildren: true }),
    node("t1", "proj", "task", 3),
    node("t2", "proj", "task", 3),
    node("area2", null, "result_area", 0, { hasChildren: true, collapsed: true }),
    node("goal2", "area2", "goal", 1),
    node("proj2", "area2", "project", 1),
  ];
  return new Map(nodes.map((n) => [n.id, n]));
}

function node(
  id: string,
  parentId: string | null,
  type: NodeType,
  depth: number,
  extra: Partial<DropNode> = {},
): DropNode {
  return { id, parentId, type, depth, hasChildren: false, collapsed: false, ...extra };
}

describe("resolveDrop", () => {
  it("makes a drop on the body of a row its last child", () => {
    expect(resolveDrop("proj2", "proj", "inside", tree())).toEqual({
      parentId: "proj",
      position: { at: "last" },
      depth: 3,
    });
  });

  it("reads the gap under an open parent as its first child", () => {
    // The row under `proj` is `t1`, so a line there means "above t1", not "after proj".
    expect(resolveDrop("t1", "proj", "after", tree())).toEqual({
      parentId: "proj",
      position: { at: "first" },
      depth: 3,
    });
  });

  it("reads the gap under a collapsed parent as a sibling", () => {
    // Nothing is drawn between `area2` and the next top-level row, so the plain reading
    // stands rather than hiding the node inside a closed subtree.
    expect(resolveDrop("area", "area2", "after", tree())).toEqual({
      parentId: null,
      position: { at: "after", siblingId: "area2" },
      depth: 0,
    });
  });

  it("places a node beside a target at the same level", () => {
    expect(resolveDrop("t1", "t2", "after", tree())).toEqual({
      parentId: "proj",
      position: { at: "after", siblingId: "t2" },
      depth: 3,
    });

    expect(resolveDrop("t2", "t1", "before", tree())).toEqual({
      parentId: "proj",
      position: { at: "before", siblingId: "t1" },
      depth: 3,
    });
  });

  it("snaps out to the nearest ancestor whose level will have the node", () => {
    // Nothing between a task and the top can host a result area, so hovering beside a deep
    // task climbs to the first level that can. That is the *enclosing result area*, not the
    // root: result areas nest inside each other, so `area` will have it as a sub-area.
    expect(resolveDrop("area2", "t1", "after", tree())).toEqual({
      parentId: "area",
      position: { at: "after", siblingId: "goal" },
      depth: 1,
    });

    // A goal cannot sit beside a task under a project, but can sit beside that project
    // under the goal above it.
    expect(resolveDrop("goal2", "t1", "before", tree())).toEqual({
      parentId: "goal",
      position: { at: "before", siblingId: "proj" },
      depth: 2,
    });
  });

  it("falls back to a sibling placement when a row cannot host the node", () => {
    // `inside` a task is illegal for a project, so the middle of the row is not dead — it
    // resolves to the placement the indicator will show instead.
    expect(resolveDrop("proj2", "t1", "inside", tree())).toEqual({
      parentId: "proj",
      position: { at: "after", siblingId: "t1" },
      depth: 3,
    });
  });

  it("refuses to drop a node on itself or inside its own subtree", () => {
    expect(resolveDrop("proj", "proj", "inside", tree())).toBeNull();
    expect(resolveDrop("proj", "t1", "after", tree())).toBeNull();
    expect(resolveDrop("area", "t2", "before", tree())).toBeNull();
  });

  // The ancestor walk used to be able to run out of levels and give up. It cannot any more:
  // the top level hosts every type, so the climb always terminates somewhere legal. A drop
  // is now refused only for self-containment or an unknown id — never for "nowhere to put
  // it". A regression here would show up as dead zones on rows during a drag.
  it("always finds a landing spot for a legal pair", () => {
    // A task beside a top-level result area lands at the root, where it is now welcome.
    expect(resolveDrop("t1", "area", "before", tree())).toEqual({
      parentId: null,
      position: { at: "before", siblingId: "area" },
      depth: 0,
    });

    // And dropped onto that result area, it becomes its child directly — no intervening
    // project required.
    expect(resolveDrop("t1", "area", "inside", tree())).toEqual({
      parentId: "area",
      position: { at: "last" },
      depth: 1,
    });
  });

  it("returns null for unknown ids", () => {
    expect(resolveDrop("nope", "t1", "after", tree())).toBeNull();
    expect(resolveDrop("t1", "nope", "after", tree())).toBeNull();
  });
});

describe("isSelfOrDescendant", () => {
  it("counts the node itself", () => {
    expect(isSelfOrDescendant(tree(), "proj", "proj")).toBe(true);
  });

  it("walks the whole ancestor chain", () => {
    expect(isSelfOrDescendant(tree(), "area", "t1")).toBe(true);
    expect(isSelfOrDescendant(tree(), "goal", "t1")).toBe(true);
    expect(isSelfOrDescendant(tree(), "area2", "t1")).toBe(false);
  });

  it("handles the root", () => {
    expect(isSelfOrDescendant(tree(), "area", null)).toBe(false);
  });

  it("terminates on a parent cycle rather than hanging", () => {
    // Clipboard paste and drag both call this; a corrupt cycle must not spin the tab.
    const cyclic = new Map([
      ["a", { parentId: "b" }],
      ["b", { parentId: "a" }],
    ]);
    expect(isSelfOrDescendant(cyclic, "x", "a")).toBe(false);
    expect(isSelfOrDescendant(cyclic, "a", "b")).toBe(true);
  });
});

describe("resolveCategoryGroupDrop", () => {
  const nodes = outlineTree(
    { id: "work", type: "result_area", name: "Job", category: "Work" },
    { id: "personal", type: "result_area", name: "Body", category: "Personal" },
    { id: "loose", type: "result_area", name: "Misc", category: null },
    { id: "goal", type: "goal", parentId: "work", depth: 1, name: "Ship" },
  );
  const byId = new Map(nodes.map((n) => [n.id, n]));

  it("reassigns a root result area and parks it after the last root in that group", () => {
    expect(
      resolveCategoryGroupDrop("loose", categoryGroupId("Work"), byId, nodes),
    ).toEqual({
      parentId: null,
      position: { at: "after", siblingId: "work" },
      depth: 0,
      category: "Work",
    });
  });

  it("clears category when dropping on the uncategorised group", () => {
    expect(
      resolveCategoryGroupDrop("work", categoryGroupId(NO_CATEGORY), byId, nodes),
    ).toEqual({
      parentId: null,
      position: { at: "after", siblingId: "loose" },
      depth: 0,
      category: null,
    });
  });

  it("refuses nested result areas and non-areas", () => {
    const nested = outlineTree(
      { id: "outer", type: "result_area", name: "Outer", category: "Work" },
      {
        id: "inner",
        type: "result_area",
        parentId: "outer",
        depth: 1,
        name: "Inner",
        category: "Work",
      },
      { id: "g", type: "goal", parentId: "outer", depth: 1, name: "G" },
    );
    const map = new Map(nested.map((n) => [n.id, n]));
    expect(
      resolveCategoryGroupDrop("inner", categoryGroupId("Personal"), map, nested),
    ).toBeNull();
    expect(
      resolveCategoryGroupDrop("g", categoryGroupId("Personal"), map, nested),
    ).toBeNull();
  });

  it("lands first at the root when the destination group has no other roots", () => {
    const only = outlineTree({
      id: "solo",
      type: "result_area",
      name: "Solo",
      category: "Work",
    });
    const map = new Map(only.map((n) => [n.id, n]));
    expect(
      resolveCategoryGroupDrop("solo", categoryGroupId("Personal"), map, only),
    ).toEqual({
      parentId: null,
      position: { at: "first" },
      depth: 0,
      category: "Personal",
    });
  });
});

describe("withRootCategoryFromPlacement", () => {
  const nodes = outlineTree(
    { id: "work", type: "result_area", name: "Job", category: "Work" },
    { id: "personal", type: "result_area", name: "Body", category: "Personal" },
    { id: "g", type: "goal", parentId: "work", depth: 1, name: "Ship" },
  );
  const byId = new Map(nodes.map((n) => [n.id, n]));

  it("copies the sibling's category when a root result area lands beside it", () => {
    const drop = {
      parentId: null as string | null,
      position: { at: "after" as const, siblingId: "personal" },
      depth: 0,
    };
    expect(withRootCategoryFromPlacement(drop, "work", byId)).toEqual({
      ...drop,
      category: "Personal",
    });
  });

  it("leaves nested placements alone so the server can inherit", () => {
    const drop = {
      parentId: "work" as string | null,
      position: { at: "last" as const },
      depth: 1,
    };
    expect(withRootCategoryFromPlacement(drop, "personal", byId)).toEqual(drop);
  });

  it("ignores non-result-areas", () => {
    const drop = {
      parentId: null as string | null,
      position: { at: "after" as const, siblingId: "personal" },
      depth: 0,
    };
    // A root goal has no category field; grouping is via its result-area ancestor.
    expect(withRootCategoryFromPlacement(drop, "g", byId)).toEqual(drop);
  });
});
