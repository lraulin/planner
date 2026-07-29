import { describe, expect, it } from "vitest";
import { derive } from "./derive";
import { row } from "./fixtures";
import { sliceTree, type GridRow } from "./slice";
import type { OutlineNode } from "./types";

/** Build a derived tree from plain rows — the same shape every tab hands `sliceTree`. */
function tree(...rows: Parameters<typeof row>[0][]): OutlineNode[] {
  return derive(rows.map((r) => row(r)));
}

function nodeIds(rows: GridRow[]): string[] {
  return rows.filter((r) => r.kind === "node").map((r) => r.id);
}

function groups(rows: GridRow[]): Extract<GridRow, { kind: "group" }>[] {
  return rows.filter((r) => r.kind === "group");
}

const projectsAndGoals = (n: OutlineNode) => n.type === "project" || n.type === "goal";
const projectsOnly = (n: OutlineNode) => n.type === "project";
const tasksOnly = (n: OutlineNode) => n.type === "task";

describe("sliceTree — keep and scope", () => {
  const sample = tree(
    { id: "ra1", type: "result_area", name: "Health", category: "Personal" },
    { id: "g1", type: "goal", parentId: "ra1", depth: 1, name: "Get fit" },
    { id: "p1", type: "project", parentId: "g1", depth: 2, name: "Gym plan" },
    { id: "p1a", type: "project", parentId: "p1", depth: 3, name: "Week 1" },
    { id: "t1", type: "task", parentId: "p1", depth: 3, name: "Buy shoes" },
    { id: "ra2", type: "result_area", name: "Career", category: "Work" },
    { id: "p2", type: "project", parentId: "ra2", depth: 1, name: "Ship v1" },
  );

  it("keeps only rows that pass the predicate", () => {
    const rows = sliceTree(sample, {
      keep: projectsOnly,
      includeDeferred: true,
    });
    expect(nodeIds(rows)).toEqual(["p1", "p1a", "p2"]);
  });

  it("scopes to a result area and excludes siblings", () => {
    const rows = sliceTree(sample, {
      keep: projectsOnly,
      scopeId: "ra1",
      includeDeferred: true,
    });
    expect(nodeIds(rows)).toEqual(["p1", "p1a"]);
  });

  it("scopes to a project for the Tasks tab", () => {
    const rows = sliceTree(sample, {
      keep: tasksOnly,
      scopeId: "p1",
      includeDeferred: true,
    });
    expect(nodeIds(rows)).toEqual(["t1"]);
  });

  it("drops postponed nodes when Deferred is off", () => {
    const withDeferred = tree(
      { id: "ra", type: "result_area" },
      { id: "active", type: "project", parentId: "ra", depth: 1 },
      {
        id: "parked",
        type: "project",
        parentId: "ra",
        depth: 1,
        state: "postponed",
      },
    );

    expect(
      nodeIds(sliceTree(withDeferred, { keep: projectsOnly, includeDeferred: false })),
    ).toEqual(["active"]);

    expect(
      nodeIds(sliceTree(withDeferred, { keep: projectsOnly, includeDeferred: true })),
    ).toEqual(["active", "parked"]);
  });
});

describe("sliceTree — re-based depth", () => {
  it("re-bases a project under a filtered-out goal to depth 0", () => {
    const nodes = tree(
      { id: "ra", type: "result_area" },
      { id: "g", type: "goal", parentId: "ra", depth: 1 },
      { id: "p", type: "project", parentId: "g", depth: 2 },
    );

    const rows = sliceTree(nodes, {
      keep: projectsOnly,
      includeDeferred: true,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "node", id: "p", depth: 0 });
  });

  it("keeps a sub-project indented under its kept parent", () => {
    const nodes = tree(
      { id: "ra", type: "result_area" },
      { id: "g", type: "goal", parentId: "ra", depth: 1 },
      { id: "p", type: "project", parentId: "g", depth: 2 },
      { id: "sub", type: "project", parentId: "p", depth: 3 },
    );

    const rows = sliceTree(nodes, {
      keep: projectsOnly,
      includeDeferred: true,
    });

    expect(rows.map((r) => (r.kind === "node" ? [r.id, r.depth] : null))).toEqual([
      ["p", 0],
      ["sub", 1],
    ]);
  });

  it("counts only kept ancestors when Goals are included as parents", () => {
    const nodes = tree(
      { id: "ra", type: "result_area" },
      { id: "g", type: "goal", parentId: "ra", depth: 1 },
      { id: "p", type: "project", parentId: "g", depth: 2 },
      { id: "sub", type: "project", parentId: "p", depth: 3 },
    );

    const rows = sliceTree(nodes, {
      keep: projectsAndGoals,
      includeDeferred: true,
    });

    expect(rows.map((r) => (r.kind === "node" ? [r.id, r.depth] : null))).toEqual([
      ["g", 0],
      ["p", 1],
      ["sub", 2],
    ]);
  });
});

describe("sliceTree — inherited context", () => {
  it("attaches the nearest result area and its category", () => {
    const nodes = tree(
      {
        id: "ra",
        type: "result_area",
        name: "Health",
        category: "Personal",
        color: "#0f0",
      },
      { id: "g", type: "goal", parentId: "ra", depth: 1, name: "Get fit" },
      { id: "p", type: "project", parentId: "g", depth: 2 },
    );

    const [row] = sliceTree(nodes, {
      keep: projectsOnly,
      includeDeferred: true,
    });

    expect(row.kind).toBe("node");
    if (row.kind !== "node") return;
    expect(row.context).toEqual({
      resultAreaId: "ra",
      resultAreaName: "Health",
      resultAreaColor: "#0f0",
      category: "Personal",
      goalId: "g",
      goalName: "Get fit",
    });
  });

  it("uses the nearest goal, not an outer one", () => {
    const nodes = tree(
      { id: "ra", type: "result_area", name: "Work" },
      { id: "outer", type: "goal", parentId: "ra", depth: 1, name: "Outer" },
      { id: "inner", type: "goal", parentId: "outer", depth: 2, name: "Inner" },
      { id: "p", type: "project", parentId: "inner", depth: 3 },
    );

    const [row] = sliceTree(nodes, {
      keep: projectsOnly,
      includeDeferred: true,
    });
    if (row.kind !== "node") throw new Error("expected node");
    expect(row.context?.goalId).toBe("inner");
    expect(row.context?.goalName).toBe("Inner");
  });
});

describe("sliceTree — group headers", () => {
  const sample = tree(
    {
      id: "ra-health",
      type: "result_area",
      name: "Health",
      category: "Personal",
    },
    { id: "p-gym", type: "project", parentId: "ra-health", depth: 1 },
    { id: "p-run", type: "project", parentId: "ra-health", depth: 1 },
    {
      id: "ra-money",
      type: "result_area",
      name: "Money",
      category: "Personal",
    },
    { id: "p-budget", type: "project", parentId: "ra-money", depth: 1 },
    {
      id: "ra-job",
      type: "result_area",
      name: "Job",
      category: "Work",
    },
    { id: "p-ship", type: "project", parentId: "ra-job", depth: 1 },
  );

  it("emits Category → Result Area headers with correct counts", () => {
    const rows = sliceTree(sample, {
      keep: projectsOnly,
      groupBy: ["category", "resultArea"],
      includeDeferred: true,
    });

    expect(groups(rows).map((g) => [g.label, g.count, g.depth])).toEqual([
      ["Personal", 3, 0],
      ["Health", 2, 1],
      ["Money", 1, 1],
      ["Work", 1, 0],
      ["Job", 1, 1],
    ]);

    // Nodes stay in DFS order inside their groups, with re-based depths.
    expect(
      rows
        .filter((r) => r.kind === "node")
        .map((r) => (r.kind === "node" ? r.id : null)),
    ).toEqual(["p-gym", "p-run", "p-budget", "p-ship"]);
  });

  it("groups by result area alone for the Goals tab shape", () => {
    const nodes = tree(
      { id: "ra1", type: "result_area", name: "Health" },
      { id: "g1", type: "goal", parentId: "ra1", depth: 1 },
      { id: "g2", type: "goal", parentId: "ra1", depth: 1 },
      { id: "ra2", type: "result_area", name: "Career" },
      { id: "g3", type: "goal", parentId: "ra2", depth: 1 },
    );

    const rows = sliceTree(nodes, {
      keep: (n) => n.type === "goal",
      groupBy: ["resultArea"],
      includeDeferred: true,
    });

    expect(groups(rows).map((g) => [g.label, g.count])).toEqual([
      ["Health", 2],
      ["Career", 1],
    ]);
  });

  it("labels missing categories and goals rather than dropping the header", () => {
    const nodes = tree(
      { id: "ra", type: "result_area", name: "Misc", category: null },
      { id: "p", type: "project", parentId: "ra", depth: 1 },
    );

    const rows = sliceTree(nodes, {
      keep: projectsOnly,
      groupBy: ["category"],
      includeDeferred: true,
    });

    expect(groups(rows)[0].label).toBe("(No Category)");
    expect(groups(rows)[0].count).toBe(1);
  });

  it("leaves group headers expanded; collapse is a UI concern", () => {
    const rows = sliceTree(sample, {
      keep: projectsOnly,
      groupBy: ["category"],
      includeDeferred: true,
    });
    for (const g of groups(rows)) {
      expect(g.collapsed).toBe(false);
    }
  });
});
