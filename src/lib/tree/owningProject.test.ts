import { describe, expect, it } from "vitest";
import type { NodeType } from "@/db/schema";
import type { OutlineNode } from "./types";
import { owningProjectId } from "./owningProject";

const node = (id: string, parentId: string | null, type: NodeType): OutlineNode =>
  ({ id, parentId, type, name: id, depth: 0 }) as OutlineNode;

describe("owningProjectId", () => {
  const nodes = [
    node("area", null, "result_area"),
    node("goal", "area", "goal"),
    node("website", "goal", "project"),
    node("phase-2", "website", "project"),
    node("task", "phase-2", "task"),
    node("loose", "goal", "task"),
  ];

  it("walks up to the nearest project", () => {
    expect(owningProjectId(nodes, "task")).toBe("phase-2");
  });

  it("stops at the first project rather than the outermost", () => {
    // A task filed in Phase 2 belongs to Phase 2. Website is where you would go *next*, and
    // one step up is what the command promises.
    expect(owningProjectId(nodes, "task")).not.toBe("website");
  });

  it("answers a project with itself", () => {
    // Right-clicking a project and asking to view the project means this one — anything else
    // greys the command on the rows where it reads most obviously.
    expect(owningProjectId(nodes, "phase-2")).toBe("phase-2");
  });

  it("is null for a row filed straight under a goal", () => {
    // A real state, and the reason `View project…` is disabled with a sentence rather than
    // hidden.
    expect(owningProjectId(nodes, "loose")).toBeNull();
    expect(owningProjectId(nodes, "goal")).toBeNull();
  });

  it("is null for no row and for an id that is not in the tree", () => {
    expect(owningProjectId(nodes, null)).toBeNull();
    expect(owningProjectId(nodes, "ghost")).toBeNull();
  });

  it("terminates on a parent cycle rather than hanging the tab", () => {
    // `moveNode` refuses to build one, so this is corruption insurance: a wrong answer beats
    // a spinning grid.
    const cyclic = [node("a", "b", "task"), node("b", "a", "task")];
    expect(owningProjectId(cyclic, "a")).toBeNull();
  });
});
