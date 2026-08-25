import { describe, expect, it } from "vitest";
import { planBulkMove } from "./bulkMove";
import type { OutlineNode } from "./types";

function node(
  id: string,
  type: OutlineNode["type"],
  parentId: string | null,
): OutlineNode {
  return { id, parentId, type, name: id } as OutlineNode;
}

describe("planBulkMove", () => {
  const tree = [
    node("ra", "result_area", null),
    node("goal", "goal", "ra"),
    node("proj", "project", "goal"),
    node("task", "task", "proj"),
    node("task2", "task", "proj"),
    node("other-task", "task", null),
    node("other-proj", "project", "goal"),
  ];

  it("files tasks under a task", () => {
    const plan = planBulkMove(tree, ["other-task"], "task");
    expect(plan.legal).toEqual(["other-task"]);
    expect(plan.skipped).toEqual([]);
  });

  it("skips a project under a task and keeps a legal task", () => {
    const plan = planBulkMove(tree, ["other-proj", "other-task"], "task");
    expect(plan.legal).toEqual(["other-task"]);
    expect(plan.skipped[0]?.id).toBe("other-proj");
    expect(plan.skipped[0]?.reason).toMatch(/cannot go under a Task/);
  });

  it("refuses moving a node inside itself", () => {
    const plan = planBulkMove(tree, ["proj"], "task");
    expect(plan.legal).toEqual([]);
    expect(plan.skipped[0]?.reason).toMatch(/inside itself/);
  });

  it("allows top level for anything", () => {
    const plan = planBulkMove(tree, ["task", "proj", "ra"], null);
    expect(plan.legal).toEqual(["task", "proj", "ra"]);
  });
});
