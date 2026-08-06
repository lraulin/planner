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
