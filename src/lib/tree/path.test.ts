import { describe, expect, it } from "vitest";
import { formatNodePath, type NodePathSegment } from "./path";

function seg(
  partial: Pick<NodePathSegment, "id" | "name" | "type"> &
    Partial<Pick<NodePathSegment, "parentId">>,
): NodePathSegment {
  return { parentId: null, ...partial };
}

describe("formatNodePath", () => {
  it("joins root-to-leaf names the way buildPathMap does", () => {
    expect(
      formatNodePath([
        seg({ id: "a", name: "Work", type: "result_area" }),
        seg({ id: "p", name: "Ship planner", type: "project", parentId: "a" }),
        seg({ id: "t", name: "Write tests", type: "task", parentId: "p" }),
      ]),
    ).toBe("Work / Ship planner / Write tests");
  });

  it("labels blank names so the path stays navigable", () => {
    // Same placeholder buildPathMap uses — agents paste these into follow-up tools.
    expect(
      formatNodePath([
        seg({ id: "a", name: "", type: "result_area" }),
        seg({ id: "t", name: "Do it", type: "task", parentId: "a" }),
      ]),
    ).toBe("(unnamed result_area) / Do it");
  });

  it("returns empty for an empty chain", () => {
    expect(formatNodePath([])).toBe("");
  });
});
