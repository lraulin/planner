import { describe, expect, it } from "vitest";
import { derive, formatEffort, formatPriority } from "./derive";
import type { OutlineRow } from "./types";

let counter = 0;

function row(
  partial: Partial<OutlineRow> & Pick<OutlineRow, "id" | "type">,
): OutlineRow {
  return {
    parentId: null,
    name: `node-${counter++}`,
    sortKey: "V",
    priorityLetter: null,
    priorityRank: null,
    state: "not_started",
    deadline: null,
    focus: false,
    collapsed: false,
    notes: "",
    completedAt: null,
    depth: 0,
    effortMinutes: null,
    effortLeftMinutes: null,
    actualEffortMinutes: 0,
    percentComplete: 0,
    contexts: [],
    color: null,
    category: null,
    ...partial,
  };
}

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
    expect(nodes[1].hasChildren).toBe(false);
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

describe("formatEffort", () => {
  it("formats the way Achieve does", () => {
    expect(formatEffort(45)).toBe("45 min");
    expect(formatEffort(120)).toBe("2 h");
    expect(formatEffort(225)).toBe("3:45 h");
    expect(formatEffort(60)).toBe("1 h");
    expect(formatEffort(1440)).toBe("3 d");
    expect(formatEffort(480)).toBe("1 d");
  });

  it("renders nothing for no estimate", () => {
    expect(formatEffort(null)).toBe("");
    expect(formatEffort(0)).toBe("");
  });
});

describe("formatPriority", () => {
  it("combines letter and rank", () => {
    expect(formatPriority("A", 1)).toBe("A1");
    expect(formatPriority("B", null)).toBe("B");
    expect(formatPriority(null, null)).toBe("");
  });
});
