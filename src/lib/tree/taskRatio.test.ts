import { describe, expect, it } from "vitest";
import { taskRatio } from "./taskRatio";
import type { OutlineNode } from "./types";

const node = (extra: Partial<OutlineNode>): OutlineNode =>
  ({
    id: "n",
    parentId: null,
    type: "task",
    name: "n",
    state: "not_started",
    hasChildren: false,
    childCount: 0,
    ...extra,
  }) as OutlineNode;

describe("taskRatio", () => {
  it("returns blank when the project has no tasks", () => {
    const project = node({ id: "p", type: "project" });
    const other = node({ id: "t", type: "task", parentId: "elsewhere" });
    expect(taskRatio("p", [project, other])).toBe("");
  });

  it("counts direct tasks as open/total", () => {
    const project = node({ id: "p", type: "project" });
    const open = node({ id: "t1", type: "task", parentId: "p", state: "in_progress" });
    const done = node({ id: "t2", type: "task", parentId: "p", state: "completed" });
    const cancelled = node({
      id: "t3",
      type: "task",
      parentId: "p",
      state: "cancelled",
    });
    expect(taskRatio("p", [project, open, done, cancelled])).toBe("1/3");
  });

  it("walks into nested projects so nested tasks are not under-counted", () => {
    // The plausible mistake: only count parentId === projectId. Nested filing is how real
    // projects grow, and a direct-only walk would report 0/0 while three tasks sit under it.
    const project = node({ id: "p", type: "project" });
    const sub = node({ id: "sub", type: "project", parentId: "p" });
    const nested = node({
      id: "t",
      type: "task",
      parentId: "sub",
      state: "not_started",
    });
    const direct = node({ id: "t2", type: "task", parentId: "p", state: "completed" });
    expect(taskRatio("p", [project, sub, nested, direct])).toBe("1/2");
  });

  it("ignores non-task descendants in the total", () => {
    const project = node({ id: "p", type: "project" });
    const wish = node({ id: "w", type: "goal", parentId: "p" });
    const task = node({ id: "t", type: "task", parentId: "p" });
    expect(taskRatio("p", [project, wish, task])).toBe("1/1");
  });
});
