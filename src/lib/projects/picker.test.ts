import { describe, expect, it } from "vitest";
import type { OutlineNode } from "@/lib/tree/types";
import {
  defaultExpandedPickerIds,
  projectPickerRows,
  visiblePickerRows,
} from "./picker";

function node(values: {
  id: string;
  parentId?: string | null;
  type: OutlineNode["type"];
  name: string;
  isInbox?: boolean;
  isDream?: boolean;
  state?: OutlineNode["state"];
  shelf?: OutlineNode["shelf"];
}): OutlineNode {
  return {
    ...values,
    parentId: values.parentId ?? null,
    isInbox: values.isInbox ?? false,
    isDream: values.isDream ?? false,
    state: values.state ?? (values.type === "result_area" ? null : "not_started"),
    shelf: values.shelf ?? null,
    sortKey: values.id,
    priorityLetter: null,
    priorityRank: null,
  } as OutlineNode;
}

const rows = [
  node({ id: "area", type: "result_area", name: "Work" }),
  node({ id: "empty", type: "result_area", name: "Health" }),
  node({ id: "goal", parentId: "area", type: "goal", name: "Grow" }),
  node({
    id: "dream",
    parentId: "area",
    type: "goal",
    name: "Learn Italian",
    isDream: true,
  }),
  node({ id: "alpha", parentId: "goal", type: "project", name: "Alpha" }),
  node({ id: "beta", parentId: "alpha", type: "project", name: "Beta" }),
  node({ id: "inbox", type: "project", name: "Inbox", isInbox: true }),
  node({ id: "task", parentId: "alpha", type: "task", name: "Call bank" }),
];

describe("projectPickerRows", () => {
  it("keeps hierarchy ancestors when filtering", () => {
    expect(
      projectPickerRows(rows, {
        query: "beta",
        groupByResultArea: true,
        includeDeferred: false,
        today: "2026-08-09",
      }).map((row) => [row.name, row.selectable, row.type]),
    ).toEqual([
      ["Work", true, "result_area"],
      ["Grow", true, "goal"],
      ["Alpha", true, "project"],
      ["Beta", true, "project"],
    ]);
  });

  it("includes empty result areas so work can be filed under them", () => {
    expect(
      projectPickerRows(rows, {
        query: "",
        groupByResultArea: true,
        includeDeferred: false,
        today: "2026-08-09",
      }).map((row) => [row.name, row.type, row.selectable, row.isDream]),
    ).toEqual([
      ["Work", "result_area", true, false],
      ["Health", "result_area", true, false],
      ["Grow", "goal", true, false],
      ["Learn Italian", "goal", true, true],
      ["Alpha", "project", true, false],
      ["Beta", "project", true, false],
    ]);
  });

  it("treats goals and dreams as project peers when result areas are ungrouped", () => {
    // Achieve's Tasks picker: goals/dreams are interchangeable with projects as scopes.
    expect(
      projectPickerRows(rows, {
        query: "",
        groupByResultArea: false,
        includeDeferred: false,
        today: "2026-08-09",
      }).map((row) => [row.name, row.depth, row.parentId, row.isDream]),
    ).toEqual([
      ["Grow", 0, null, false],
      ["Learn Italian", 0, null, true],
      ["Alpha", 1, "goal", false],
      ["Beta", 2, "alpha", false],
    ]);
  });

  it("marks parents that have visible children", () => {
    const tree = projectPickerRows(rows, {
      query: "",
      groupByResultArea: true,
      includeDeferred: false,
      today: "2026-08-09",
    });
    expect(tree.find((row) => row.id === "area")?.hasChildren).toBe(true);
    expect(tree.find((row) => row.id === "empty")?.hasChildren).toBe(false);
    expect(tree.find((row) => row.id === "beta")?.hasChildren).toBe(false);
  });
});

describe("visiblePickerRows", () => {
  it("hides descendants of collapsed parents", () => {
    const tree = projectPickerRows(rows, {
      query: "",
      groupByResultArea: true,
      includeDeferred: false,
      today: "2026-08-09",
    });
    // Expand Work but leave Grow collapsed — Alpha/Beta disappear with it.
    const expanded = new Set(["area"]);
    expect(visiblePickerRows(tree, expanded).map((row) => row.name)).toEqual([
      "Work",
      "Health",
      "Grow",
      "Learn Italian",
    ]);
  });

  it("does not hang when parent pointers form a cycle", () => {
    const cycled = [
      node({ id: "a", type: "project", name: "Alpha", parentId: "b" }),
      node({ id: "b", type: "project", name: "Beta", parentId: "a" }),
    ];
    expect(
      projectPickerRows(cycled, {
        query: "",
        groupByResultArea: false,
        includeDeferred: false,
        today: "2026-08-09",
      }).map((row) => row.name),
    ).toEqual(["Alpha", "Beta"]);
  });

  it("excludes settled projects so they cannot be a filing destination", () => {
    const withSettled = [
      ...rows,
      node({
        id: "done",
        parentId: "goal",
        type: "project",
        name: "Shipped",
        state: "completed",
      }),
      node({
        id: "killed",
        parentId: "goal",
        type: "project",
        name: "Scrapped",
        state: "cancelled",
      }),
    ];
    expect(
      projectPickerRows(withSettled, {
        query: "",
        groupByResultArea: true,
        includeDeferred: false,
        today: "2026-08-09",
      }).map((row) => row.name),
    ).toEqual(["Work", "Health", "Grow", "Learn Italian", "Alpha", "Beta"]);
  });

  it("omits tasks unless includeTasks is on", () => {
    expect(
      projectPickerRows(rows, {
        query: "",
        groupByResultArea: true,
        includeDeferred: false,
        today: "2026-08-09",
      }).map((row) => row.name),
    ).not.toContain("Call bank");
    expect(
      projectPickerRows(rows, {
        query: "",
        groupByResultArea: true,
        includeDeferred: false,
        today: "2026-08-09",
        includeTasks: true,
      }).map((row) => row.name),
    ).toContain("Call bank");
  });

  it("defaultExpandedPickerIds expands every parent", () => {
    const tree = projectPickerRows(rows, {
      query: "",
      groupByResultArea: true,
      includeDeferred: false,
      today: "2026-08-09",
    });
    const expanded = defaultExpandedPickerIds(tree);
    expect(visiblePickerRows(tree, expanded).map((row) => row.name)).toEqual(
      tree.map((row) => row.name),
    );
  });
});
