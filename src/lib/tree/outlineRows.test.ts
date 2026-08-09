import { describe, expect, it } from "vitest";
import { withAncestors } from "@/lib/grid/ancestors";
import { derive } from "./derive";
import { row } from "./fixtures";
import { outlineGridRows } from "./outlineRows";
import type { GridRow } from "./slice";

function tree(collapsed: boolean) {
  return derive([
    row({ id: "area", type: "result_area", collapsed }),
    row({ id: "goal", type: "goal", parentId: "area", depth: 1 }),
    row({ id: "project", type: "project", parentId: "goal", depth: 2 }),
    row({
      id: "proposed",
      type: "task",
      parentId: "project",
      depth: 3,
      state: "proposed",
    }),
    row({
      id: "delegated",
      type: "task",
      parentId: "project",
      depth: 3,
      state: "delegated",
    }),
  ]);
}

function nodeIds(rows: readonly GridRow[]): string[] {
  return rows.flatMap((row) => (row.kind === "node" ? [row.id] : []));
}

function stateFilterPassIds(rows: readonly GridRow[]): ReadonlySet<string> {
  const nodes = rows.flatMap((row) => (row.kind === "node" ? [row] : []));
  const direct = new Set(
    nodes
      .filter((row) => row.node.state === "proposed" || row.node.state === "delegated")
      .map((row) => row.id),
  );
  return withAncestors(nodes, direct);
}

describe("outlineGridRows", () => {
  it("makes filtering independent of whether the outline was collapsed first", () => {
    const expandedNodes = tree(false);
    // The client patches the parent's `collapsed` field immediately; derived `hidden`
    // flags arrive on the server refresh. Presentation must honour that current state too.
    const collapsedNodes = expandedNodes.map((node) =>
      node.id === "area" ? { ...node, collapsed: true } : node,
    );
    const collapsed = outlineGridRows(
      collapsedNodes,
      false,
      new Map(collapsedNodes.map((node) => [node.id, node])),
    );
    const expanded = outlineGridRows(
      expandedNodes,
      false,
      new Map(expandedNodes.map((node) => [node.id, node])),
    );

    // Collapse changes only what is drawn now, never what the filter evaluates.
    expect(nodeIds(collapsed.rows)).toEqual(["area"]);
    expect(nodeIds(collapsed.narrowingRows)).toEqual(nodeIds(expanded.narrowingRows));

    const filteredWhileCollapsed = stateFilterPassIds(collapsed.narrowingRows);
    const filteredWhileExpanded = stateFilterPassIds(expanded.narrowingRows);
    expect([...filteredWhileCollapsed]).toEqual([...filteredWhileExpanded]);

    // Expanding after applying the filter yields exactly the fully-expanded filter result.
    expect(
      nodeIds(expanded.rows).filter((id) => filteredWhileCollapsed.has(id)),
    ).toEqual(nodeIds(expanded.rows).filter((id) => filteredWhileExpanded.has(id)));
    expect(
      nodeIds(expanded.rows).filter((id) => filteredWhileCollapsed.has(id)),
    ).toEqual(["area", "goal", "project", "proposed", "delegated"]);
  });
});
