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
  state?: OutlineNode["state"];
  shelf?: OutlineNode["shelf"];
}): OutlineNode {
  return {
    ...values,
    parentId: values.parentId ?? null,
    isInbox: values.isInbox ?? false,
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
  node({ id: "alpha", parentId: "goal", type: "project", name: "Alpha" }),
  node({ id: "beta", parentId: "alpha", type: "project", name: "Beta" }),
  node({ id: "inbox", type: "project", name: "Inbox", isInbox: true }),
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
      }).map((row) => [row.name, row.type, row.selectable]),
    ).toEqual([
      ["Work", "result_area", true],
      ["Health", "result_area", true],
      ["Grow", "goal", true],
      ["Alpha", "project", true],
      ["Beta", "project", true],
    ]);
  });

  it("flattens result-area headings while retaining project nesting", () => {
    expect(
      projectPickerRows(rows, {
        query: "",
        groupByResultArea: false,
        includeDeferred: false,
        today: "2026-08-09",
      }).map((row) => [row.name, row.depth, row.parentId]),
    ).toEqual([
      ["Alpha", 0, null],
      ["Beta", 1, "alpha"],
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
    ]);
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
