import { describe, expect, it } from "vitest";
import type { NodeState } from "@/db/schema";
import {
  cascadeStateChange,
  isSettled,
  openDescendantCount,
  type CascadeNode,
} from "./completionCascade";

/**
 * area
 *   goal
 *     project
 *       task-a
 *       task-b
 *         subtask
 *     project-2
 */
function tree(
  overrides: Partial<Record<string, NodeState | null>> = {},
): CascadeNode[] {
  const shape: [string, string | null][] = [
    ["area", null],
    ["goal", "area"],
    ["project", "goal"],
    ["task-a", "project"],
    ["task-b", "project"],
    ["subtask", "task-b"],
    ["project-2", "goal"],
  ];
  return shape.map(([id, parentId]) => {
    const override = overrides[id];
    return {
      id,
      parentId,
      state: override === undefined ? (id === "area" ? null : "not_started") : override,
    };
  });
}

function changes(
  nodes: CascadeNode[],
  id: string,
  next: NodeState,
  requested?: NodeState,
) {
  return cascadeStateChange(nodes, id, next, requested)
    .map((change) => `${change.id}=${change.state}`)
    .sort();
}

describe("isSettled", () => {
  it("treats completed and cancelled alike and nothing else", () => {
    expect(isSettled("completed")).toBe(true);
    expect(isSettled("cancelled")).toBe(true);
    for (const state of [
      "not_started",
      "in_progress",
      "waiting",
      "postponed",
      "delegated",
      "should_delegate",
      "proposed",
    ] as const) {
      expect(isSettled(state)).toBe(false);
    }
  });
});

describe("cascadeStateChange — settling", () => {
  it("settles every open descendant, at any depth, and starts not-started ancestors", () => {
    expect(changes(tree(), "project", "completed")).toEqual([
      "goal=in_progress",
      "subtask=completed",
      "task-a=completed",
      "task-b=completed",
    ]);
  });

  it("never includes the node being changed", () => {
    const result = cascadeStateChange(tree(), "project", "completed");
    expect(result.map((change) => change.id)).not.toContain("project");
  });

  it("leaves an already-settled descendant on its own settled state", () => {
    // Completing the project must not rewrite a task somebody deliberately cancelled.
    expect(changes(tree({ "task-a": "cancelled" }), "project", "completed")).toEqual([
      "goal=in_progress",
      "subtask=completed",
      "task-b=completed",
    ]);
    // And cancelling must not erase work that was actually finished — nor start the goal,
    // because cancelling is "not doing this", not "work has begun".
    expect(changes(tree({ "task-a": "completed" }), "project", "cancelled")).toEqual([
      "subtask=cancelled",
      "task-b=cancelled",
    ]);
  });

  it("still settles open work underneath an already-settled descendant", () => {
    // task-b is done but its subtask is not — leaving that open under a completed project
    // is exactly the contradiction this rule exists to prevent.
    expect(changes(tree({ "task-b": "completed" }), "project", "completed")).toEqual([
      "goal=in_progress",
      "subtask=completed",
      "task-a=completed",
    ]);
  });

  it("settles a whole stateful branch from the top", () => {
    expect(changes(tree(), "goal", "cancelled")).toEqual([
      "project-2=cancelled",
      "project=cancelled",
      "subtask=cancelled",
      "task-a=cancelled",
      "task-b=cancelled",
    ]);
  });

  it("starts not-started ancestors when a leaf is completed", () => {
    expect(changes(tree(), "task-a", "completed")).toEqual([
      "goal=in_progress",
      "project=in_progress",
    ]);
    expect(changes(tree(), "subtask", "completed")).toEqual([
      "goal=in_progress",
      "project=in_progress",
      "task-b=in_progress",
    ]);
  });

  it("does not touch a sibling's subtree", () => {
    const result = changes(tree(), "task-b", "completed");
    expect(result).toEqual([
      "goal=in_progress",
      "project=in_progress",
      "subtask=completed",
    ]);
  });
});

describe("cascadeStateChange — re-opening", () => {
  it("reopens settled ancestors as in progress, not not-started", () => {
    const settled = tree({
      goal: "completed",
      project: "completed",
      "task-a": "completed",
    });
    expect(changes(settled, "task-a", "in_progress")).toEqual([
      "goal=in_progress",
      "project=in_progress",
    ]);
  });

  it("walks past an open ancestor to reach a settled one above it", () => {
    // A grandparent can be completed while the parent between them is not; leaving it
    // settled would put open work under a completed goal.
    const mixed = tree({
      goal: "in_progress",
      project: "completed",
    });
    expect(changes(mixed, "task-a", "waiting")).toEqual(["project=in_progress"]);
  });

  it("starts not-started ancestors when a child moves to in progress", () => {
    // Achieve only does this on complete. We also do it on In progress: the parent is no
    // longer a thing that has not begun, which is exactly what Not started claims.
    expect(changes(tree(), "task-a", "in_progress")).toEqual([
      "goal=in_progress",
      "project=in_progress",
    ]);
  });

  it("leaves already-started, waiting, and postponed ancestors alone", () => {
    const mixed = tree({
      goal: "postponed",
      project: "in_progress",
    });
    expect(changes(mixed, "task-a", "in_progress")).toEqual([]);
    expect(changes(mixed, "task-a", "completed")).toEqual([]);
    expect(changes(tree({ project: "waiting" }), "task-a", "completed")).toEqual([
      "goal=in_progress",
    ]);
  });

  it("does not start ancestors for waiting, postponed, or delegated", () => {
    // Those are not "work has begun" in the same way — a postponed child is shelved, a
    // waiting one is blocked, and neither should flip a parent that has not started.
    expect(changes(tree(), "task-a", "waiting")).toEqual([]);
    expect(changes(tree(), "task-a", "postponed")).toEqual([]);
    expect(changes(tree(), "task-a", "delegated")).toEqual([]);
  });

  it("starts not-started ancestors when a repeating task is completed", () => {
    // Completing a repeating task shelves it until next time; reading only the result
    // would leave the project Not started after real work happened.
    expect(changes(tree(), "task-a", "postponed", "completed")).toEqual([
      "goal=in_progress",
      "project=in_progress",
    ]);
  });

  it("reopens the same way for every open state, cancelled being the interesting one", () => {
    const settled = tree({ project: "completed", "task-a": "completed" });
    // Achieve reopens a completed parent when a child is cancelled but not the reverse.
    // Here cancelled is settled, so it does the opposite — and stays consistent.
    expect(changes(settled, "task-a", "cancelled")).toEqual([]);
    expect(changes(settled, "task-a", "not_started")).toEqual(["project=in_progress"]);
  });

  it("never reopens descendants", () => {
    const settled = tree({
      project: "completed",
      "task-a": "completed",
      "task-b": "completed",
      subtask: "completed",
    });
    const result = changes(settled, "project", "in_progress");
    // The goal has not started, so it starts; the finished tasks stay finished.
    expect(result).toEqual(["goal=in_progress"]);
    expect(result.join(" ")).not.toMatch(/task|subtask/);
  });

  it("stops at the root without looping", () => {
    expect(changes(tree({ goal: "completed" }), "goal", "in_progress")).toEqual([]);
  });

  it("walks through a state-less Result Area without trying to reopen it", () => {
    const settled = tree({ goal: "completed", project: "completed" });
    expect(changes(settled, "project", "in_progress")).toEqual(["goal=in_progress"]);
    expect(changes(settled, "project", "in_progress").join(" ")).not.toContain("area");
  });
});

describe("openDescendantCount", () => {
  it("counts only what a settle would actually change", () => {
    expect(openDescendantCount(tree(), "project", "completed")).toBe(3);
    expect(
      openDescendantCount(tree({ "task-a": "completed" }), "project", "completed"),
    ).toBe(2);
    expect(openDescendantCount(tree(), "task-a", "completed")).toBe(0);
  });

  it("is zero for every open state, because re-opening asks nothing", () => {
    const settled = tree({ project: "completed", "task-a": "completed" });
    expect(openDescendantCount(settled, "project", "in_progress")).toBe(0);
  });
});
