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
function tree(overrides: Record<string, NodeState> = {}): CascadeNode[] {
  const shape: [string, string | null][] = [
    ["area", null],
    ["goal", "area"],
    ["project", "goal"],
    ["task-a", "project"],
    ["task-b", "project"],
    ["subtask", "task-b"],
    ["project-2", "goal"],
  ];
  return shape.map(([id, parentId]) => ({
    id,
    parentId,
    state: overrides[id] ?? "not_started",
  }));
}

function changes(nodes: CascadeNode[], id: string, next: NodeState) {
  return cascadeStateChange(nodes, id, next)
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
  it("settles every open descendant, at any depth", () => {
    expect(changes(tree(), "project", "completed")).toEqual([
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
      "subtask=completed",
      "task-b=completed",
    ]);
    // And cancelling must not erase work that was actually finished.
    expect(changes(tree({ "task-a": "completed" }), "project", "cancelled")).toEqual([
      "subtask=cancelled",
      "task-b=cancelled",
    ]);
  });

  it("still settles open work underneath an already-settled descendant", () => {
    // task-b is done but its subtask is not — leaving that open under a completed project
    // is exactly the contradiction this rule exists to prevent.
    expect(changes(tree({ "task-b": "completed" }), "project", "completed")).toEqual([
      "subtask=completed",
      "task-a=completed",
    ]);
  });

  it("settles a whole branch from the top", () => {
    expect(changes(tree(), "area", "cancelled")).toEqual([
      "goal=cancelled",
      "project-2=cancelled",
      "project=cancelled",
      "subtask=cancelled",
      "task-a=cancelled",
      "task-b=cancelled",
    ]);
  });

  it("changes nothing for a leaf", () => {
    expect(changes(tree(), "task-a", "completed")).toEqual([]);
    expect(changes(tree(), "subtask", "completed")).toEqual([]);
  });

  it("does not touch a sibling's subtree", () => {
    const result = changes(tree(), "task-b", "completed");
    expect(result).toEqual(["subtask=completed"]);
  });
});

describe("cascadeStateChange — re-opening", () => {
  it("reopens settled ancestors as in progress, not not-started", () => {
    const settled = tree({
      area: "completed",
      goal: "completed",
      project: "completed",
      "task-a": "completed",
    });
    expect(changes(settled, "task-a", "in_progress")).toEqual([
      "area=in_progress",
      "goal=in_progress",
      "project=in_progress",
    ]);
  });

  it("walks past an open ancestor to reach a settled one above it", () => {
    // A grandparent can be completed while the parent between them is not; leaving it
    // settled would put open work under a completed goal.
    const mixed = tree({
      area: "completed",
      goal: "in_progress",
      project: "completed",
    });
    expect(changes(mixed, "task-a", "waiting")).toEqual([
      "area=in_progress",
      "project=in_progress",
    ]);
  });

  it("leaves already-open ancestors alone", () => {
    expect(changes(tree(), "task-a", "in_progress")).toEqual([]);
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
    expect(result).toEqual([]);
  });

  it("stops at the root without looping", () => {
    expect(changes(tree({ area: "completed" }), "area", "in_progress")).toEqual([]);
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
