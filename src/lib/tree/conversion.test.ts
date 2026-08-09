import { describe, expect, it } from "vitest";
import { planNodeConversion } from "./conversion";

describe("node conversion planner", () => {
  it("retains Goal detail shape for Goal ↔ Dream", () => {
    const plan = planNodeConversion({
      nodeId: "goal",
      sourceKind: "goal",
      targetKind: "dream",
      nodes: [{ id: "goal", parentId: null, type: "goal", name: "Learn" }],
      sourceDetailFields: ["range", "values"],
    });
    expect(plan.retainedFields).toContain("range");
    expect(plan.discardedFields).toEqual([]);
  });

  it("reports type-specific loss and hoists an invalid conversion to the nearest legal branch", () => {
    const plan = planNodeConversion({
      nodeId: "task",
      sourceKind: "task",
      targetKind: "result_area",
      nodes: [
        { id: "area", parentId: null, type: "result_area", name: "Work" },
        { id: "project", parentId: "area", type: "project", name: "Project" },
        { id: "task", parentId: "project", type: "task", name: "Task" },
      ],
    });
    expect(plan.placement).toMatchObject({
      parentId: "area",
      hoisted: true,
      position: { at: "after", siblingId: "project" },
    });
    expect(plan.discardedFields).toContain("recurrence");
    expect(plan.discardedFields).toEqual(
      expect.arrayContaining(["state", "deferred date", "completion time"]),
    );
    expect(plan.lifecycleChange).toContain("will be cleared");
  });

  it("explains that conversion out of a Result Area initializes state", () => {
    const plan = planNodeConversion({
      nodeId: "area",
      sourceKind: "result_area",
      targetKind: "project",
      nodes: [{ id: "area", parentId: null, type: "result_area", name: "Work" }],
    });
    expect(plan.lifecycleChange).toBe("State will be initialized to Not started.");
    expect(plan.retainedFields).not.toContain("state");
  });

  it("blocks a conversion when a direct child would become illegal", () => {
    const plan = planNodeConversion({
      nodeId: "project",
      sourceKind: "project",
      targetKind: "task",
      nodes: [
        { id: "project", parentId: null, type: "project", name: "Project" },
        { id: "goal", parentId: "project", type: "goal", name: "Goal" },
      ],
    });
    expect(plan.descendantConflicts).toEqual([
      { id: "goal", name: "Goal", type: "goal" },
    ]);
  });
});
