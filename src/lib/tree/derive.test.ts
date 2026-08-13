import { describe, expect, it } from "vitest";
import { derive } from "./derive";
import { formatEffort } from "./format";
import { row } from "./fixtures";

describe("derive — inherited priority (L.A.P.)", () => {
  it("uses the node's own priority when it has one", () => {
    const [node] = derive([
      row({ id: "a", type: "result_area", priorityLetter: "B", priorityRank: 2 }),
    ]);
    expect(node.lapLetter).toBe("B");
    expect(node.lapRank).toBe(2);
  });

  it("inherits from the nearest ancestor that has one", () => {
    const nodes = derive([
      row({ id: "a", type: "result_area", priorityLetter: "A", priorityRank: 1 }),
      row({ id: "b", type: "project", parentId: "a", depth: 1 }),
      row({ id: "c", type: "task", parentId: "b", depth: 2 }),
    ]);
    expect(nodes[2].lapLetter).toBe("A");
    expect(nodes[2].lapRank).toBe(1);
  });

  it("stops at the nearest ancestor, not the outermost", () => {
    const nodes = derive([
      row({ id: "a", type: "result_area", priorityLetter: "A" }),
      row({ id: "b", type: "project", parentId: "a", priorityLetter: "C", depth: 1 }),
      row({ id: "c", type: "task", parentId: "b", depth: 2 }),
    ]);
    expect(nodes[2].lapLetter).toBe("C");
  });

  it("reports null when nothing in the chain has a priority", () => {
    const nodes = derive([
      row({ id: "a", type: "result_area" }),
      row({ id: "b", type: "project", parentId: "a", depth: 1 }),
    ]);
    expect(nodes[1].lapLetter).toBeNull();
  });
});

describe("derive — ancestry display values", () => {
  it("keeps Result Area Name and Project Priority distinct from L.A.P.", () => {
    const nodes = derive([
      row({ id: "ra", type: "result_area", name: "  Health  ", priorityLetter: "A" }),
      row({ id: "goal", type: "goal", parentId: "ra", depth: 1, priorityLetter: "B" }),
      row({
        id: "project",
        type: "project",
        parentId: "goal",
        depth: 2,
        priorityLetter: "C",
        priorityRank: 2,
      }),
      row({
        id: "task",
        type: "task",
        parentId: "project",
        depth: 3,
        priorityLetter: "A",
      }),
    ]);

    expect(nodes.map((node) => node.resultAreaName)).toEqual([
      "Health",
      "Health",
      "Health",
      "Health",
    ]);
    expect(nodes[0]?.projectPriorityLetter).toBeNull();
    expect(nodes[1]?.projectPriorityLetter).toBeNull();
    expect(nodes[2]?.projectPriorityLetter).toBe("C");
    expect(nodes[3]?.projectPriorityLetter).toBe("C");
    expect(nodes[3]?.projectPriorityRank).toBe(2);
    // Task's own priority wins L.A.P.; Project Priority answers a different question.
    expect(nodes[3]?.lapLetter).toBe("A");
  });
});

describe("derive — effort rollups", () => {
  it("reports a leaf's own effort", () => {
    const [node] = derive([row({ id: "a", type: "task", effortMinutes: 120 })]);
    expect(node.effortRollupMinutes).toBe(120);
  });

  it("sums children into the parent", () => {
    // Mirrors TasksTabSS.png: Requirements = 7 h = 4 h + 2 h + 1 h.
    const nodes = derive([
      row({ id: "req", type: "task" }),
      row({
        id: "gather",
        type: "task",
        parentId: "req",
        depth: 1,
        effortMinutes: 240,
      }),
      row({ id: "prep", type: "task", parentId: "req", depth: 1, effortMinutes: 120 }),
      row({ id: "review", type: "task", parentId: "req", depth: 1, effortMinutes: 60 }),
    ]);
    expect(nodes[0].effortRollupMinutes).toBe(420);
    expect(formatEffort(nodes[0].effortRollupMinutes)).toBe("7 h");
  });

  it("rolls up through multiple levels", () => {
    const nodes = derive([
      row({ id: "root", type: "project" }),
      row({ id: "mid", type: "task", parentId: "root", depth: 1 }),
      row({ id: "leaf1", type: "task", parentId: "mid", depth: 2, effortMinutes: 30 }),
      row({ id: "leaf2", type: "task", parentId: "mid", depth: 2, effortMinutes: 45 }),
      row({ id: "other", type: "task", parentId: "root", depth: 1, effortMinutes: 15 }),
    ]);
    expect(nodes[1].effortRollupMinutes).toBe(75);
    expect(nodes[0].effortRollupMinutes).toBe(90);
  });

  it("ignores children with no estimate rather than counting them as zero", () => {
    const nodes = derive([
      row({ id: "root", type: "project" }),
      row({ id: "a", type: "task", parentId: "root", depth: 1, effortMinutes: 60 }),
      row({ id: "b", type: "task", parentId: "root", depth: 1, effortMinutes: null }),
    ]);
    expect(nodes[0].effortRollupMinutes).toBe(60);
  });

  it("leaves the rollup null when nothing in the subtree is estimated", () => {
    const nodes = derive([
      row({ id: "root", type: "project" }),
      row({ id: "a", type: "task", parentId: "root", depth: 1 }),
    ]);
    expect(nodes[0].effortRollupMinutes).toBeNull();
  });

  it("weights percent complete by effort", () => {
    const nodes = derive([
      row({ id: "root", type: "project" }),
      row({
        id: "big",
        type: "task",
        parentId: "root",
        depth: 1,
        effortMinutes: 300,
        percentComplete: 100,
      }),
      row({
        id: "small",
        type: "task",
        parentId: "root",
        depth: 1,
        effortMinutes: 100,
        percentComplete: 0,
      }),
    ]);
    expect(nodes[0].percentCompleteRollup).toBe(75);
  });

  it("reports percent rollup 0 on a leaf with no effort estimate", () => {
    // Weighted rollup needs a denominator. Display must use the stored value instead —
    // see displayPercentComplete / percentColumn, which used to sort and chip from the
    // rollup alone and silently hid progress on every un-estimated task.
    const [leaf] = derive([row({ id: "t", type: "task", percentComplete: 40 })]);
    expect(leaf?.percentComplete).toBe(40);
    expect(leaf?.percentCompleteRollup).toBe(0);
  });
});

describe("derive — structure", () => {
  it("counts children", () => {
    const nodes = derive([
      row({ id: "a", type: "result_area" }),
      row({ id: "b", type: "project", parentId: "a", depth: 1 }),
      row({ id: "c", type: "project", parentId: "a", depth: 1 }),
    ]);
    expect(nodes[0].childCount).toBe(2);
    expect(nodes[0].hasChildren).toBe(true);
    expect(nodes[0].hasActiveChildren).toBe(true);
    expect(nodes[1].hasChildren).toBe(false);
    expect(nodes[1].hasActiveChildren).toBe(false);
  });

  it("treats only completed/cancelled children as inactive for hasActiveChildren", () => {
    const nodes = derive([
      row({ id: "p", type: "project" }),
      row({
        id: "done",
        type: "task",
        parentId: "p",
        depth: 1,
        state: "completed",
      }),
    ]);
    expect(nodes[0].hasChildren).toBe(true);
    expect(nodes[0].hasActiveChildren).toBe(false);
  });

  it("hides descendants of a collapsed node", () => {
    const nodes = derive([
      row({ id: "a", type: "result_area", collapsed: true }),
      row({ id: "b", type: "project", parentId: "a", depth: 1 }),
      row({ id: "c", type: "task", parentId: "b", depth: 2 }),
    ]);
    expect(nodes[0].hidden).toBe(false);
    expect(nodes[1].hidden).toBe(true);
    expect(nodes[2].hidden).toBe(true);
  });

  it("keeps siblings of a collapsed node visible", () => {
    const nodes = derive([
      row({ id: "a", type: "result_area" }),
      row({ id: "b", type: "project", parentId: "a", depth: 1, collapsed: true }),
      row({ id: "c", type: "task", parentId: "b", depth: 2 }),
      row({ id: "d", type: "project", parentId: "a", depth: 1 }),
    ]);
    expect(nodes[2].hidden).toBe(true);
    expect(nodes[3].hidden).toBe(false);
  });

  it("handles an empty tree", () => {
    expect(derive([])).toEqual([]);
  });
});

/**
 * Category is inherited the same way L.A.P. is. Only Result Areas are given one in
 * practice, but the rule is written against the field rather than the type — that is what
 * lets Category be an ordinary column you can show, sort and filter, instead of a grouping
 * dimension with no visible value behind it.
 */
describe("derive — effectiveCategory", () => {
  it("inherits from the nearest ancestor that has one", () => {
    const nodes = derive([
      row({ id: "ra", type: "result_area", category: "Personal" }),
      row({ id: "g", type: "goal", parentId: "ra", depth: 1 }),
      row({ id: "p", type: "project", parentId: "g", depth: 2 }),
      row({ id: "t", type: "task", parentId: "p", depth: 3 }),
    ]);

    expect(nodes.map((n) => n.effectiveCategory)).toEqual([
      "Personal",
      "Personal",
      "Personal",
      "Personal",
    ]);
  });

  it("prefers the node's own category over an ancestor's", () => {
    const nodes = derive([
      row({ id: "ra", type: "result_area", category: "Personal" }),
      row({
        id: "inner",
        type: "result_area",
        parentId: "ra",
        depth: 1,
        category: "Work",
      }),
      row({ id: "p", type: "project", parentId: "inner", depth: 2 }),
    ]);

    expect(nodes.map((n) => n.effectiveCategory)).toEqual(["Personal", "Work", "Work"]);
  });

  it("does not care which type carries the category", () => {
    // Nothing sets one below a result area today, but the rule must not special-case type
    // or the column would show a value that grouping ignored.
    const nodes = derive([
      row({ id: "ra", type: "result_area", category: "Personal" }),
      row({ id: "p", type: "project", parentId: "ra", depth: 1, category: "Work" }),
      row({ id: "t", type: "task", parentId: "p", depth: 2 }),
    ]);

    expect(nodes.map((n) => n.effectiveCategory)).toEqual(["Personal", "Work", "Work"]);
  });

  it("is null when nothing above the row has one", () => {
    const nodes = derive([
      row({ id: "ra", type: "result_area" }),
      row({ id: "p", type: "project", parentId: "ra", depth: 1 }),
    ]);

    expect(nodes.map((n) => n.effectiveCategory)).toEqual([null, null]);
  });

  it("trims, so whitespace variants are one category", () => {
    const nodes = derive([
      row({ id: "ra", type: "result_area", category: "  Personal  " }),
      row({ id: "p", type: "project", parentId: "ra", depth: 1 }),
    ]);

    expect(nodes.map((n) => n.effectiveCategory)).toEqual(["Personal", "Personal"]);
  });

  it("treats a blank category as absent rather than as a value", () => {
    const nodes = derive([
      row({ id: "ra", type: "result_area", category: "Personal" }),
      row({ id: "p", type: "project", parentId: "ra", depth: 1, category: "   " }),
    ]);

    expect(nodes.map((n) => n.effectiveCategory)).toEqual(["Personal", "Personal"]);
  });
});

describe("derive — broken parent pointers", () => {
  it("does not hang when parent pointers form a cycle", () => {
    // walkUp already refuses to loop. derive's inherited walks used to recurse on
    // parentId and would blow the stack on the same corruption.
    const nodes = derive([
      row({ id: "a", type: "task", parentId: "b", priorityLetter: "A" }),
      row({ id: "b", type: "task", parentId: "a" }),
    ]);
    expect(nodes).toHaveLength(2);
    expect(nodes.find((n) => n.id === "a")?.lapLetter).toBe("A");
    expect(nodes.find((n) => n.id === "b")?.lapLetter).toBe("A");
  });

  it("treats a missing parent as the top of the chain", () => {
    const [node] = derive([
      row({ id: "orphan", type: "task", parentId: "gone", priorityLetter: "B" }),
    ]);
    expect(node.lapLetter).toBe("B");
    expect(node.resultAreaName).toBeNull();
    expect(node.effectiveCategory).toBeNull();
  });
});
