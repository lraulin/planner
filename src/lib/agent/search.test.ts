import { describe, expect, it } from "vitest";
import { row } from "@/lib/tree/fixtures";
import type { OutlineNode } from "@/lib/tree/types";
import { filterOutline, filterOutlinePage } from "./search";

/** The shared row builder plus the derived fields, so widening `OutlineRow` stays a
 * one-file change. `filterOutline` reads none of the derived values. */
function node(
  partial: Partial<OutlineNode> & Pick<OutlineNode, "id" | "type" | "name">,
): OutlineNode {
  return {
    ...row(partial),
    lapLetter: null,
    lapRank: null,
    resultAreaName: null,
    projectPriorityLetter: null,
    projectPriorityRank: null,
    effectiveCategory: null,
    effortRollupMinutes: null,
    effortLeftRollupMinutes: null,
    actualEffortRollupMinutes: 0,
    percentCompleteRollup: 0,
    childCount: 0,
    hasChildren: false,
    hasActiveChildren: false,
    hidden: false,
    shelf: null,
    ...partial,
  };
}

describe("filterOutline", () => {
  const outline: OutlineNode[] = [
    node({ id: "ra", type: "result_area", name: "Work", depth: 0 }),
    node({
      id: "p1",
      type: "project",
      name: "Ship API",
      parentId: "ra",
      depth: 1,
      focus: true,
      priorityLetter: "A",
      priorityRank: 1,
    }),
    node({
      id: "t1",
      type: "task",
      name: "Write tools",
      parentId: "p1",
      depth: 2,
      state: "in_progress",
      priorityLetter: "A",
    }),
    node({
      id: "t2",
      type: "task",
      name: "Old work",
      parentId: "p1",
      depth: 2,
      state: "completed",
    }),
  ];

  it("excludes completed by default", () => {
    const rows = filterOutline(outline, { type: "task" });
    expect(rows.map((r) => r.id)).toEqual(["t1"]);
  });

  it("matches name query case-insensitively", () => {
    const rows = filterOutline(outline, { query: "ship" });
    expect(rows.map((r) => r.id)).toEqual(["p1"]);
  });

  it("filters focus and builds path labels", () => {
    const rows = filterOutline(outline, { focus: true });
    expect(rows).toHaveLength(1);
    expect(rows[0].path).toBe("Work / Ship API");
  });

  it("respects parentId", () => {
    const rows = filterOutline(outline, { parentId: "p1", includeCompleted: true });
    expect(rows.map((r) => r.id).sort()).toEqual(["t1", "t2"]);
  });
});

describe("filterOutlinePage due filters", () => {
  // Deadlines are calendar days stored at UTC noon; the suite runs in America/New_York.
  const day = (key: string) => new Date(`${key}T12:00:00.000Z`);
  const outline: OutlineNode[] = [
    node({ id: "ra", type: "result_area", name: "Home", depth: 0 }),
    node({
      id: "late",
      type: "task",
      name: "Late",
      parentId: "ra",
      deadline: day("2026-10-20"),
    }),
    node({ id: "none", type: "task", name: "Undated", parentId: "ra" }),
    node({
      id: "fri",
      type: "task",
      name: "Friday",
      parentId: "ra",
      deadline: day("2026-10-30"),
    }),
    node({
      id: "today",
      type: "task",
      name: "Today",
      parentId: "ra",
      deadline: day("2026-10-23"),
    }),
    node({
      id: "late2",
      type: "task",
      name: "Late too",
      parentId: "ra",
      deadline: day("2026-10-20"),
    }),
    node({
      id: "doneLate",
      type: "task",
      name: "Done late",
      parentId: "ra",
      state: "completed",
      deadline: day("2026-10-01"),
    }),
  ];
  const ids = (filter: Parameters<typeof filterOutlinePage>[1]) =>
    filterOutlinePage(outline, filter).nodes.map((n) => n.id);

  it("treats dueBefore and dueAfter as inclusive day keys and drops undated rows", () => {
    expect(ids({ dueBefore: "2026-10-23" })).toEqual(["late", "late2", "today"]);
    expect(ids({ dueAfter: "2026-10-23" })).toEqual(["today", "fri"]);
    expect(ids({ dueAfter: "2026-10-23", dueBefore: "2026-10-23" })).toEqual(["today"]);
  });

  it("splits overdue at today: strictly earlier days only", () => {
    expect(ids({ overdue: true, today: "2026-10-23" })).toEqual(["late", "late2"]);
    expect(ids({ overdue: false, today: "2026-10-23", type: "task" })).toEqual([
      "today",
      "fri",
      "none",
    ]);
  });

  it("still hides completed rows unless asked", () => {
    expect(ids({ overdue: true, today: "2026-10-23", includeCompleted: true })).toEqual(
      ["doneLate", "late", "late2"],
    );
  });

  it("refuses overdue without a caller-supplied today", () => {
    expect(() => filterOutlinePage(outline, { overdue: true })).toThrow(/today/);
  });

  it("sorts by deadline by default when a due filter is set, else keeps outline order", () => {
    expect(ids({ type: "task" })).toEqual(["late", "none", "fri", "today", "late2"]);
    expect(ids({ type: "task", sort: "deadline" })).toEqual([
      "late",
      "late2",
      "today",
      "fri",
      "none",
    ]);
    expect(ids({ dueBefore: "2026-12-31", sort: "outline" })).toEqual([
      "late",
      "fri",
      "today",
      "late2",
    ]);
  });

  it("paginates after sorting", () => {
    const page = filterOutlinePage(outline, {
      sort: "deadline",
      type: "task",
      limit: 2,
      offset: 2,
    });
    expect(page.nodes.map((n) => n.id)).toEqual(["today", "fri"]);
    expect(page.pageInfo).toMatchObject({ total: 5, hasMore: true, nextOffset: 4 });
  });

  it("returns slim rows with the deadline as a day when fields is compact", () => {
    const page = filterOutlinePage(outline, {
      dueBefore: "2026-10-20",
      fields: "compact",
    });
    expect(page.nodes[0]).toEqual({
      id: "late",
      parentId: "ra",
      type: "task",
      name: "Late",
      state: "not_started",
      priorityLetter: null,
      priorityRank: null,
      dueOn: "2026-10-20",
      focus: false,
    });
  });
});
