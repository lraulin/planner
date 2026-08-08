import { describe, expect, it } from "vitest";
import { derive } from "./derive";
import { row } from "./fixtures";
import { fromDateKey } from "@/lib/schedule/geometry";
import {
  asGroupBy,
  categoryGroupId,
  categoryLabelFromGroupId,
  categoryOptions,
  categoryValueFromLabel,
  deadlineBandOf,
  DEFAULT_CATEGORIES,
  MAX_GROUP_LEVELS,
  setGroupLevel,
  groupByCategory,
  NO_CATEGORY,
  sliceTree,
  type GridRow,
  type GroupBy,
} from "./slice";
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
      today: null,
    });
    expect(nodeIds(rows)).toEqual(["p1", "p1a", "p2"]);
  });

  it("scopes to a result area and excludes siblings", () => {
    const rows = sliceTree(sample, {
      keep: projectsOnly,
      scopeId: "ra1",
      includeDeferred: true,
      today: null,
    });
    expect(nodeIds(rows)).toEqual(["p1", "p1a"]);
  });

  it("scopes to a project for the Tasks tab", () => {
    const rows = sliceTree(sample, {
      keep: tasksOnly,
      scopeId: "p1",
      includeDeferred: true,
      today: null,
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
      nodeIds(
        sliceTree(withDeferred, {
          keep: projectsOnly,
          includeDeferred: false,
          today: null,
        }),
      ),
    ).toEqual(["active"]);

    expect(
      nodeIds(
        sliceTree(withDeferred, {
          keep: projectsOnly,
          includeDeferred: true,
          today: null,
        }),
      ),
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
      today: null,
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
      today: null,
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
      today: null,
    });

    expect(rows.map((r) => (r.kind === "node" ? [r.id, r.depth] : null))).toEqual([
      ["g", 0],
      ["p", 1],
      ["sub", 2],
    ]);
  });
});

describe("sliceTree — collapse and branch counts", () => {
  /** Projects tab shape: a project with a sub-project and a task of its own. */
  const nodes = (collapsed: boolean) =>
    tree(
      { id: "ra", type: "result_area" },
      { id: "p", type: "project", parentId: "ra", depth: 1, collapsed },
      { id: "sub", type: "project", parentId: "p", depth: 2 },
      { id: "t", type: "task", parentId: "p", depth: 2 },
      { id: "other", type: "project", parentId: "ra", depth: 1 },
    );

  function branchOf(rows: GridRow[], id: string) {
    const found = rows.find((r) => r.kind === "node" && r.id === id);
    return found?.kind === "node" ? found.branch : undefined;
  }

  it("hides a collapsed row's kept children", () => {
    const rows = sliceTree(nodes(true), {
      keep: projectsOnly,
      includeDeferred: true,
      today: null,
    });

    expect(nodeIds(rows)).toEqual(["p", "other"]);
  });

  it("shows them again when the row is expanded", () => {
    const rows = sliceTree(nodes(false), {
      keep: projectsOnly,
      includeDeferred: true,
      today: null,
    });

    expect(nodeIds(rows)).toEqual(["p", "sub", "other"]);
  });

  it("counts children in the row set, not in the tree", () => {
    const rows = sliceTree(nodes(false), {
      keep: projectsOnly,
      includeDeferred: true,
      today: null,
    });

    // `p` has two children in the tree — a sub-project and a task — but only the
    // sub-project is a row here, so that is what its expander can hide.
    expect(branchOf(rows, "p")).toEqual({ hasChildren: true, childCount: 1 });
    // A project whose only children are tasks is a leaf on this tab.
    expect(branchOf(rows, "other")).toEqual({ hasChildren: false, childCount: 0 });
  });

  it("counts a collapsed row's hidden children", () => {
    const rows = sliceTree(nodes(true), {
      keep: projectsOnly,
      includeDeferred: true,
      today: null,
    });

    expect(branchOf(rows, "p")).toEqual({ hasChildren: true, childCount: 1 });
  });

  it("hides a whole collapsed subtree, not just its first level", () => {
    const deep = tree(
      { id: "ra", type: "result_area" },
      { id: "p", type: "project", parentId: "ra", depth: 1, collapsed: true },
      { id: "sub", type: "project", parentId: "p", depth: 2 },
      { id: "subsub", type: "project", parentId: "sub", depth: 3 },
    );

    const rows = sliceTree(deep, {
      keep: projectsOnly,
      includeDeferred: true,
      today: null,
    });

    expect(nodeIds(rows)).toEqual(["p"]);
  });

  it("ignores collapse on a row that was filtered out of the slice", () => {
    // The goal is collapsed but not kept, so it cannot hide the projects under it —
    // they are top-level rows on this tab.
    const underGoal = tree(
      { id: "ra", type: "result_area" },
      { id: "g", type: "goal", parentId: "ra", depth: 1, collapsed: true },
      { id: "p", type: "project", parentId: "g", depth: 2 },
    );

    const rows = sliceTree(underGoal, {
      keep: projectsOnly,
      includeDeferred: true,
      today: null,
    });

    expect(nodeIds(rows)).toEqual(["p"]);
  });

  it("leaves hidden rows out of group header counts", () => {
    const rows = sliceTree(nodes(true), {
      keep: projectsOnly,
      groupBy: ["category"],
      includeDeferred: true,
      today: null,
    });

    expect(groups(rows).map((g) => g.count)).toEqual([2]);
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
      { id: "p", type: "project", parentId: "g", depth: 2, name: "Gym plan" },
    );

    const [row] = sliceTree(nodes, {
      keep: projectsOnly,
      includeDeferred: true,
      today: null,
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
      // A project is its own nearest project, so grouping by project keeps a sub-project's
      // rows under that sub-project rather than folding them into its parent.
      projectId: "p",
      projectName: "Gym plan",
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
      today: null,
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
      today: null,
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

  it("gathers interleaved categories under one header each", () => {
    // Real outline order often puts Work in the middle of Personal areas. Grouping must
    // still produce a single Personal header, not Personal / Work / Personal again.
    const interleaved = tree(
      {
        id: "ra-fin",
        type: "result_area",
        name: "Financial",
        category: "Personal",
      },
      { id: "p-fin", type: "project", parentId: "ra-fin", depth: 1 },
      {
        id: "ra-job",
        type: "result_area",
        name: "Job",
        category: "Work",
      },
      { id: "p-job", type: "project", parentId: "ra-job", depth: 1 },
      {
        id: "ra-health",
        type: "result_area",
        name: "Health",
        category: "Personal",
      },
      { id: "p-health", type: "project", parentId: "ra-health", depth: 1 },
    );

    const rows = sliceTree(interleaved, {
      keep: projectsOnly,
      groupBy: ["category", "resultArea"],
      includeDeferred: true,
      today: null,
    });

    expect(groups(rows).map((g) => [g.label, g.count, g.depth])).toEqual([
      ["Personal", 2, 0],
      ["Financial", 1, 1],
      ["Health", 1, 1],
      ["Work", 1, 0],
      ["Job", 1, 1],
    ]);
    expect(
      rows
        .filter((r) => r.kind === "node")
        .map((r) => (r.kind === "node" ? r.id : null)),
    ).toEqual(["p-fin", "p-health", "p-job"]);
  });

  it("merges categories that differ only by surrounding whitespace", () => {
    const spaced = tree(
      {
        id: "ra-a",
        type: "result_area",
        name: "A",
        category: "Personal",
      },
      { id: "p-a", type: "project", parentId: "ra-a", depth: 1 },
      {
        id: "ra-b",
        type: "result_area",
        name: "B",
        category: " Personal ",
      },
      { id: "p-b", type: "project", parentId: "ra-b", depth: 1 },
    );

    const rows = sliceTree(spaced, {
      keep: projectsOnly,
      groupBy: ["category"],
      includeDeferred: true,
      today: null,
    });

    expect(groups(rows).map((g) => [g.label, g.count])).toEqual([["Personal", 2]]);
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
      today: null,
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
      today: null,
    });

    expect(groups(rows)[0].label).toBe("(No Category)");
    expect(groups(rows)[0].count).toBe(1);
  });

  it("leaves group headers expanded; collapse is a UI concern", () => {
    const rows = sliceTree(sample, {
      keep: projectsOnly,
      groupBy: ["category"],
      includeDeferred: true,
      today: null,
    });
    for (const g of groups(rows)) {
      expect(g.collapsed).toBe(false);
    }
  });
});

/**
 * The dimensions added when grouping became a user control rather than a per-tab constant.
 * These read the row's own fields rather than its ancestry, which is why `groupKey` takes
 * the whole prepared entry.
 */
describe("sliceTree — group by row fields", () => {
  const TODAY = "2026-08-04";
  const day = (key: string) => fromDateKey(key);

  const sample = tree(
    { id: "ra", type: "result_area", name: "Health", category: "Personal" },
    {
      id: "p-a",
      type: "project",
      parentId: "ra",
      depth: 1,
      name: "Alpha",
      priorityLetter: "A",
      priorityRank: 1,
      state: "in_progress",
      deadline: day("2026-08-04"),
    },
    {
      id: "p-b",
      type: "project",
      parentId: "ra",
      depth: 1,
      name: "Beta",
      priorityLetter: "C",
      state: "not_started",
      deadline: day("2026-08-01"),
    },
    {
      id: "p-c",
      type: "project",
      parentId: "ra",
      depth: 1,
      name: "Gamma",
      priorityLetter: null,
      state: "in_progress",
      deadline: null,
    },
    {
      id: "p-d",
      type: "project",
      parentId: "ra",
      depth: 1,
      name: "Delta",
      priorityLetter: "B",
      state: "not_started",
      deadline: day("2026-08-20"),
    },
  );

  const slice = (groupBy: GroupBy[], today: string | null = TODAY) =>
    sliceTree(sample, { keep: projectsOnly, groupBy, includeDeferred: true, today });

  it("groups by state in Achieve workflow order, not first-seen", () => {
    // Sample meets in_progress before not_started in DFS order; alphabetical would put
    // Cancelled / Completed first. Workflow order is Not started → In progress → …
    expect(groups(slice(["state"])).map((g) => [g.label, g.count])).toEqual([
      ["Not started", 2],
      ["In progress", 2],
    ]);
  });

  it("groups an expired shelf under Not started, not Postponed", () => {
    // Same rule as the State column: expiry is derived, so a routine whose shelf ran out
    // must not go on collecting under a Postponed header nothing ever writes it out of.
    const nodes = tree(
      { id: "ra", type: "result_area", name: "Health" },
      {
        id: "p-expired",
        type: "project",
        parentId: "ra",
        depth: 1,
        name: "Was shelved",
        state: "postponed",
        deferredDate: day("2026-03-01"),
      },
      {
        id: "p-shelved",
        type: "project",
        parentId: "ra",
        depth: 1,
        name: "Still shelved",
        state: "postponed",
        deferredDate: day("2026-09-01"),
      },
    );
    const rows = sliceTree(nodes, {
      keep: projectsOnly,
      groupBy: ["state"],
      includeDeferred: true,
      today: TODAY,
    });
    expect(groups(rows).map((g) => [g.label, g.count])).toEqual([
      ["Not started", 1],
      ["Postponed", 1],
    ]);
  });

  /**
   * Rank is ignored on purpose. Grouping by A1, A2, A3 would give one header per row, which
   * is not grouping at all.
   */
  it("groups by priority letter, ignoring rank, with unprioritized last", () => {
    expect(groups(slice(["priorityLetter"])).map((g) => [g.label, g.count])).toEqual([
      ["A", 1],
      ["B", 1],
      ["C", 1],
      ["(Unprioritized)", 1],
    ]);
  });

  it("groups by deadline band, soonest first and undated last", () => {
    expect(groups(slice(["deadlineBand"])).map((g) => [g.label, g.count])).toEqual([
      ["Overdue", 1],
      ["Due Today", 1],
      ["Next 30 Days", 1],
      ["(No Deadline)", 1],
    ]);
  });

  /**
   * Before hydration the client does not know the date. Bucketing dated rows by a guessed
   * "today" would make the server and the first paint disagree about what is overdue.
   */
  it("puts every dated row in one neutral band when today is unknown", () => {
    expect(
      groups(slice(["deadlineBand"], null)).map((g) => [g.label, g.count]),
    ).toEqual([
      ["Later", 3],
      ["(No Deadline)", 1],
    ]);
  });

  it("nests two field dimensions with correct counts", () => {
    const rows = slice(["state", "priorityLetter"]);
    // Outer State is workflow order; priority within each state is A→D→unprioritized.
    expect(groups(rows).map((g) => [g.label, g.count, g.depth])).toEqual([
      ["Not started", 2, 0],
      ["B", 1, 1],
      ["C", 1, 1],
      ["In progress", 2, 0],
      ["A", 1, 1],
      ["(Unprioritized)", 1, 1],
    ]);
  });

  it("groups tasks under their nearest project, including a sub-project", () => {
    const withTasks = tree(
      { id: "ra", type: "result_area", name: "Health" },
      { id: "p1", type: "project", parentId: "ra", depth: 1, name: "Gym plan" },
      { id: "t1", type: "task", parentId: "p1", depth: 2, name: "Buy shoes" },
      { id: "p1a", type: "project", parentId: "p1", depth: 2, name: "Week 1" },
      { id: "t2", type: "task", parentId: "p1a", depth: 3, name: "Run 5k" },
      { id: "t3", type: "task", parentId: "ra", depth: 1, name: "Loose task" },
    );

    const rows = sliceTree(withTasks, {
      keep: tasksOnly,
      groupBy: ["project"],
      includeDeferred: true,
      today: TODAY,
    });

    expect(groups(rows).map((g) => [g.label, g.count])).toEqual([
      ["Gym plan", 1],
      ["Week 1", 1],
      ["(No Project)", 1],
    ]);
  });

  it("mixes an ancestry dimension with a field one", () => {
    const rows = slice(["category", "state"]);
    expect(groups(rows).map((g) => [g.label, g.depth])).toEqual([
      ["Personal", 0],
      ["Not started", 1],
      ["In progress", 1],
    ]);
  });
});

describe("asGroupBy", () => {
  it("keeps known dimensions in order and drops retired ones", () => {
    // Stored settings are plain strings; a dimension removed in a later build must degrade
    // to "not grouped by that" rather than failing to parse the whole layout.
    expect(asGroupBy(["resultArea", "pivot", "state"])).toEqual([
      "resultArea",
      "state",
    ]);
    expect(asGroupBy([])).toEqual([]);
  });
});

describe("deadlineBandOf", () => {
  const TODAY = "2026-08-04";

  it("buckets by the deadline alone", () => {
    expect(deadlineBandOf(null, TODAY)).toBe("none");
    expect(deadlineBandOf(fromDateKey("2026-08-03"), TODAY)).toBe("overdue");
    expect(deadlineBandOf(fromDateKey("2026-08-04"), TODAY)).toBe("today");
    expect(deadlineBandOf(fromDateKey("2026-08-05"), TODAY)).toBe("tomorrow");
    expect(deadlineBandOf(fromDateKey("2026-08-11"), TODAY)).toBe("next7");
    expect(deadlineBandOf(fromDateKey("2026-08-12"), TODAY)).toBe("next30");
    expect(deadlineBandOf(fromDateKey("2026-09-03"), TODAY)).toBe("next30");
    expect(deadlineBandOf(fromDateKey("2026-09-04"), TODAY)).toBe("later");
  });

  it("treats an unknown today as one neutral band", () => {
    expect(deadlineBandOf(fromDateKey("2026-08-03"), null)).toBe("later");
    expect(deadlineBandOf(null, null)).toBe("none");
  });
});

describe("groupByCategory", () => {
  /** The outline hands this the rows it is already showing, plus a map of the whole tree. */
  function rows(nodes: OutlineNode[], visible = nodes) {
    return groupByCategory(visible, new Map(nodes.map((n) => [n.id, n])));
  }

  const sample = tree(
    { id: "ra-work", type: "result_area", name: "Job", category: "Work" },
    { id: "g-work", type: "goal", parentId: "ra-work", depth: 1, name: "Ship" },
    { id: "ra-health", type: "result_area", name: "Body", category: "Personal" },
    { id: "g-health", type: "goal", parentId: "ra-health", depth: 1, name: "Fit" },
    { id: "ra-misc", type: "result_area", name: "Loose", category: null },
    { id: "p-misc", type: "project", parentId: "ra-misc", depth: 1, name: "Chores" },
  );

  it("orders named categories alphabetically and leaves uncategorised last", () => {
    expect(groups(rows(sample)).map((g) => g.label)).toEqual([
      "Personal",
      "Work",
      "(No Category)",
    ]);
  });

  it("puts tilde-prefixed quarantine categories after ordinary named categories", () => {
    const withImported = tree(...sample, {
      id: "ra-imported",
      type: "result_area",
      name: "Old work",
      category: "~ Imported: Work",
    });

    expect(groups(rows(withImported)).map((g) => g.label)).toEqual([
      "Personal",
      "Work",
      "~ Imported: Work",
      "(No Category)",
    ]);
  });

  it("moves each top-level subtree whole, keeping tree order inside a category", () => {
    // Two Work areas appear in tree order under one header — not interleaved by node type.
    const withTwoWork = tree(
      { id: "ra-a", type: "result_area", name: "A", category: "Work" },
      { id: "g-a", type: "goal", parentId: "ra-a", depth: 1 },
      { id: "ra-b", type: "result_area", name: "B", category: "Personal" },
      { id: "g-b", type: "goal", parentId: "ra-b", depth: 1 },
      { id: "ra-c", type: "result_area", name: "C", category: "Work" },
      { id: "g-c", type: "goal", parentId: "ra-c", depth: 1 },
    );

    expect(nodeIds(rows(withTwoWork))).toEqual([
      "ra-b",
      "g-b",
      "ra-a",
      "g-a",
      "ra-c",
      "g-c",
    ]);
  });

  it("counts every node under a category header, not just the roots", () => {
    expect(groups(rows(sample)).map((g) => [g.label, g.count])).toEqual([
      ["Personal", 2],
      ["Work", 2],
      ["(No Category)", 2],
    ]);
  });

  // Nested result areas keep their parent's category for the block. Splitting on the nested
  // area's own category would hide a row under a header its parent has moved away from.
  it("does not split a block when a nested result area has another category", () => {
    const nested = tree(
      { id: "ra-outer", type: "result_area", name: "Outer", category: "Work" },
      {
        id: "ra-inner",
        type: "result_area",
        parentId: "ra-outer",
        depth: 1,
        name: "Inner",
        category: "Personal",
      },
      { id: "g-inner", type: "goal", parentId: "ra-inner", depth: 2 },
    );

    const out = rows(nested);
    expect(groups(out).map((g) => g.label)).toEqual(["Work"]);
    expect(nodeIds(out)).toEqual(["ra-outer", "ra-inner", "g-inner"]);
  });

  it("still reads category from an ancestor filtered out of the visible list", () => {
    const nodes = tree(
      { id: "ra", type: "result_area", name: "Health", category: "Personal" },
      { id: "g", type: "goal", parentId: "ra", depth: 1, name: "Fit" },
    );
    // Outline filters can hide the result area while still showing its goal.
    const visible = nodes.filter((n) => n.id === "g");
    const out = rows(nodes, visible);

    expect(groups(out).map((g) => g.label)).toEqual(["Personal"]);
    expect(nodeIds(out)).toEqual(["g"]);
  });

  it("preserves each node's tree depth rather than re-basing under the header", () => {
    const out = rows(sample);
    const goal = out.find((r) => r.kind === "node" && r.id === "g-work");
    expect(goal?.kind === "node" && goal.depth).toBe(1);
  });
});

describe("category group id helpers", () => {
  it("round-trips labels including the uncategorised sentinel", () => {
    expect(categoryLabelFromGroupId(categoryGroupId("Work"))).toBe("Work");
    expect(categoryLabelFromGroupId(categoryGroupId(NO_CATEGORY))).toBe(NO_CATEGORY);
    expect(categoryLabelFromGroupId("node-123")).toBeNull();
  });

  it("maps group labels to stored category values", () => {
    expect(categoryValueFromLabel("Work")).toBe("Work");
    expect(categoryValueFromLabel(NO_CATEGORY)).toBeNull();
    expect(categoryValueFromLabel("  ")).toBeNull();
  });
});

describe("categoryOptions", () => {
  it("always offers the Personal and Work defaults", () => {
    expect(categoryOptions([])).toEqual([...DEFAULT_CATEGORIES].sort());
  });

  it("includes custom categories already on result areas, trimmed and unique", () => {
    const nodes = tree(
      { id: "a", type: "result_area", name: "A", category: "Personal" },
      { id: "b", type: "result_area", name: "B", category: " Family " },
      { id: "c", type: "result_area", name: "C", category: "Family" },
      { id: "p", type: "project", parentId: "a", depth: 1 },
    );
    expect(categoryOptions(nodes)).toEqual(["Family", "Personal", "Work"]);
  });

  it("offers tilde-prefixed categories after ordinary names", () => {
    const nodes = tree({
      id: "old",
      type: "result_area",
      name: "Old work",
      category: "~ Imported: Work",
    });
    expect(categoryOptions(nodes)).toEqual(["Personal", "Work", "~ Imported: Work"]);
  });
});

/**
 * The picker's rules. Pure because getting them wrong produces a control that looks broken
 * — a level that will not clear, or a dimension nested inside itself — rather than an error.
 */
describe("setGroupLevel", () => {
  it("sets the first level from nothing", () => {
    expect(setGroupLevel([], 0, "resultArea")).toEqual(["resultArea"]);
  });

  it("appends a second and third level", () => {
    expect(setGroupLevel(["resultArea"], 1, "state")).toEqual(["resultArea", "state"]);
    expect(setGroupLevel(["resultArea", "state"], 2, "priorityLetter")).toEqual([
      "resultArea",
      "state",
      "priorityLetter",
    ]);
  });

  it("replaces a level in place, keeping the ones after it", () => {
    expect(setGroupLevel(["resultArea", "state"], 0, "category")).toEqual([
      "category",
      "state",
    ]);
  });

  /**
   * Clearing level one cannot leave level two behind — there would be nothing for it to sit
   * under, and the grid would silently regroup by a dimension the user had not asked for.
   */
  it("truncates the levels below the one being cleared", () => {
    expect(setGroupLevel(["category", "resultArea", "state"], 1, null)).toEqual([
      "category",
    ]);
    expect(setGroupLevel(["category", "resultArea"], 0, null)).toEqual([]);
  });

  it("moves a dimension rather than letting it appear twice", () => {
    // Grouping by State inside State is a no-op that reads as a broken control.
    expect(setGroupLevel(["resultArea", "state"], 0, "state")).toEqual(["state"]);
    expect(setGroupLevel(["category", "resultArea", "state"], 1, "state")).toEqual([
      "category",
      "state",
    ]);
  });

  it("appends when the index is past the end", () => {
    expect(setGroupLevel(["category"], 2, "state")).toEqual(["category", "state"]);
  });

  it("refuses to grow past the cap", () => {
    const full: GroupBy[] = ["category", "resultArea", "state"];
    expect(setGroupLevel(full, MAX_GROUP_LEVELS, "goal")).toEqual(full);
    expect(setGroupLevel(full, 1, "goal")).toHaveLength(MAX_GROUP_LEVELS);
  });

  it("ignores a negative index rather than corrupting the list", () => {
    expect(setGroupLevel(["category"], -1, "state")).toEqual(["category"]);
  });
});
