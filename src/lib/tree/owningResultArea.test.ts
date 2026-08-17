import { describe, expect, it } from "vitest";
import type { NodeType } from "@/db/schema";
import type { OutlineNode } from "./types";
import { owningResultAreaId, owningResultAreaIdFromChain } from "./owningResultArea";

const node = (id: string, parentId: string | null, type: NodeType): OutlineNode =>
  ({ id, parentId, type, name: id, depth: 0 }) as OutlineNode;

describe("owningResultAreaId", () => {
  const nodes = [
    node("work", null, "result_area"),
    node("career", "work", "result_area"),
    node("goal", "career", "goal"),
    node("project", "goal", "project"),
    node("task", "project", "task"),
    node("loose", null, "project"),
  ];

  it("walks up to the nearest result area", () => {
    expect(owningResultAreaId(nodes, "project")).toBe("career");
    expect(owningResultAreaId(nodes, "goal")).toBe("career");
    expect(owningResultAreaId(nodes, "task")).toBe("career");
  });

  it("stops at the first result area rather than the outermost", () => {
    // A project filed under Career belongs to Career. Work is where you would go
    // *next*, and the form dropdown names the owner, not the root of the area tree.
    expect(owningResultAreaId(nodes, "project")).not.toBe("work");
  });

  it("answers a result area with itself", () => {
    expect(owningResultAreaId(nodes, "career")).toBe("career");
    expect(owningResultAreaId(nodes, "work")).toBe("work");
  });

  it("is null for a row with no result-area ancestor", () => {
    expect(owningResultAreaId(nodes, "loose")).toBeNull();
  });

  it("is null for no row and for an id that is not in the tree", () => {
    expect(owningResultAreaId(nodes, null)).toBeNull();
    expect(owningResultAreaId(nodes, "ghost")).toBeNull();
  });

  it("terminates on a parent cycle rather than hanging", () => {
    const cyclic = [node("a", "b", "goal"), node("b", "a", "goal")];
    expect(owningResultAreaId(cyclic, "a")).toBeNull();
  });
});

describe("owningResultAreaIdFromChain", () => {
  it("picks the nearest area from a root-to-leaf chain", () => {
    expect(
      owningResultAreaIdFromChain([
        { id: "work", type: "result_area" },
        { id: "career", type: "result_area" },
        { id: "goal", type: "goal" },
      ]),
    ).toBe("career");
  });

  it("is null for an empty or missing chain", () => {
    expect(owningResultAreaIdFromChain([])).toBeNull();
    expect(owningResultAreaIdFromChain(null)).toBeNull();
  });
});
