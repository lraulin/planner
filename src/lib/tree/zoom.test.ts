import { describe, expect, it } from "vitest";
import type { OutlineNode } from "./types";
import { zoomBranch, zoomOutRoot } from "./zoom";

const node = (id: string, parentId: string | null, depth: number): OutlineNode =>
  ({ id, parentId, depth, name: id, type: "task", hidden: false }) as OutlineNode;

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

  it("clears a stale root and walks out one ancestor at a time", () => {
    expect(zoomBranch(nodes, "gone")).toEqual({ nodes: [], stale: true });
    expect(zoomOutRoot(nodes, "task")).toBe("project");
    expect(zoomOutRoot(nodes, "area")).toBeNull();
  });
});
