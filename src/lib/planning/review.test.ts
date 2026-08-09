import { describe, expect, it } from "vitest";
import { derive } from "@/lib/tree/derive";
import { row } from "@/lib/tree/fixtures";
import type { OutlineRow } from "@/lib/tree/types";
import {
  isAtLeastPriority,
  reviewProgress,
  selectGoalsForReview,
  selectProjectsForCommitment,
  selectResultAreasForReview,
} from "./review";

function tree(rows: OutlineRow[]) {
  return derive(rows);
}

describe("isAtLeastPriority", () => {
  it("reads A as outranking B, the way Achieve's ABCD does", () => {
    expect(isAtLeastPriority("A", "B")).toBe(true);
    expect(isAtLeastPriority("C", "B")).toBe(false);
  });

  it("excludes unprioritised records from any minimum", () => {
    expect(isAtLeastPriority(null, "D")).toBe(false);
  });

  it("admits everything when there is no minimum", () => {
    expect(isAtLeastPriority(null, null)).toBe(true);
  });
});

describe("selectResultAreasForReview", () => {
  it("lists every result area in outline order and nothing else", () => {
    const nodes = tree([
      row({ id: "a", type: "result_area", name: "Career", sortKey: "V", state: null }),
      row({ id: "b", type: "result_area", name: "Health", sortKey: "W", state: null }),
      row({ id: "c", type: "goal", parentId: "a", sortKey: "V" }),
    ]);
    expect(selectResultAreasForReview(nodes).map((n) => n.name)).toEqual([
      "Career",
      "Health",
    ]);
  });

  it("does not require a lifecycle state for the weekly walk-through", () => {
    const nodes = tree([row({ id: "a", type: "result_area", state: null })]);
    expect(selectResultAreasForReview(nodes)).toHaveLength(1);
  });

  it("keeps an unprioritised area — that is the one worth being asked about", () => {
    const nodes = tree([
      row({
        id: "a",
        type: "result_area",
        name: "Career",
        priorityLetter: null,
        state: null,
      }),
    ]);
    expect(selectResultAreasForReview(nodes)).toHaveLength(1);
  });
});

describe("selectGoalsForReview", () => {
  const nodes = tree([
    row({ id: "ra", type: "result_area", sortKey: "V" }),
    row({
      id: "g1",
      type: "goal",
      parentId: "ra",
      sortKey: "V",
      name: "A goal",
      priorityLetter: "A",
    }),
    row({
      id: "d1",
      type: "goal",
      parentId: "ra",
      sortKey: "W",
      name: "A dream",
      priorityLetter: "A",
      isDream: true,
    }),
    row({
      id: "g2",
      type: "goal",
      parentId: "ra",
      sortKey: "X",
      name: "B goal",
      priorityLetter: "B",
    }),
    row({
      id: "g3",
      type: "goal",
      parentId: "ra",
      sortKey: "Y",
      name: "Done goal",
      priorityLetter: "A",
      state: "completed",
    }),
  ]);

  it("shows dreams before goals", () => {
    expect(selectGoalsForReview(nodes).map((n) => n.name)).toEqual([
      "A dream",
      "A goal",
    ]);
  });

  it("hides anything below priority A by default, as Achieve's step 2 does", () => {
    expect(selectGoalsForReview(nodes).map((n) => n.name)).not.toContain("B goal");
  });

  it("hides goals that are neither New nor Active", () => {
    expect(selectGoalsForReview(nodes).map((n) => n.name)).not.toContain("Done goal");
  });

  it("widens to every open goal when the minimum is lifted", () => {
    const names = selectGoalsForReview(nodes, { minPriority: null }).map((n) => n.name);
    expect(names).toEqual(["A dream", "A goal", "B goal"]);
  });
});

describe("selectProjectsForCommitment", () => {
  const nodes = tree([
    row({ id: "ra", type: "result_area", sortKey: "V" }),
    row({
      id: "parent",
      type: "project",
      parentId: "ra",
      sortKey: "V",
      name: "Parent",
    }),
    row({
      id: "child",
      type: "project",
      parentId: "parent",
      sortKey: "V",
      name: "Child",
    }),
    row({ id: "solo", type: "project", parentId: "ra", sortKey: "W", name: "Solo" }),
    row({
      id: "done",
      type: "project",
      parentId: "ra",
      sortKey: "X",
      name: "Done",
      state: "completed",
    }),
  ]);

  it("offers leaf projects only, so a parent and its child are not both committed to", () => {
    expect(selectProjectsForCommitment(nodes).map((n) => n.name)).toEqual([
      "Child",
      "Solo",
    ]);
  });

  it("includes parents when leaf-only is turned off", () => {
    const names = selectProjectsForCommitment(nodes, { leafOnly: false }).map(
      (n) => n.name,
    );
    expect(names).toEqual(["Parent", "Child", "Solo"]);
  });

  it("leaves completed projects out of the week's budget", () => {
    expect(selectProjectsForCommitment(nodes).map((n) => n.name)).not.toContain("Done");
  });
});

describe("reviewProgress", () => {
  const items = tree([
    row({ id: "a", type: "result_area", sortKey: "V" }),
    row({ id: "b", type: "result_area", sortKey: "W" }),
  ]);

  it("counts how many of the step's records have been looked at", () => {
    expect(reviewProgress(items, new Set(["a"]))).toEqual({
      total: 2,
      reviewed: 1,
      complete: false,
    });
  });

  it("is not complete when there is nothing to review", () => {
    // An empty step must not report itself finished — the step never ran.
    expect(reviewProgress([], new Set()).complete).toBe(false);
  });
});
