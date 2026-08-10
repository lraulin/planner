import { describe, expect, it } from "vitest";
import type { OutlineNode } from "@/lib/tree/types";
import { projectPickerRows } from "./picker";

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
      }).map((row) => [row.name, row.selectable]),
    ).toEqual([
      ["Work", false],
      ["Grow", false],
      ["Alpha", false],
      ["Beta", true],
    ]);
  });

  it("flattens result-area headings while retaining project nesting", () => {
    expect(
      projectPickerRows(rows, {
        query: "",
        groupByResultArea: false,
        includeDeferred: false,
        today: "2026-08-09",
      }).map((row) => [row.name, row.depth]),
    ).toEqual([
      ["Alpha", 0],
      ["Beta", 1],
    ]);
  });
});
