import { describe, expect, it } from "vitest";
import type { OutlineNode } from "./types";
import { nodeDeleteMessage, nodeDeleteTitle } from "./deleteMessage";

const node = (extra: Partial<OutlineNode>): OutlineNode =>
  ({
    id: "n",
    parentId: null,
    type: "project",
    name: "Website rebuild",
    hasChildren: false,
    childCount: 0,
    ...extra,
  }) as OutlineNode;

describe("nodeDeleteMessage", () => {
  it("warns that the branch goes too, with the count", () => {
    // The whole reason this is shared. A dialog that names only the project is how you lose
    // eleven tasks you did not know were attached.
    expect(nodeDeleteMessage(node({ hasChildren: true, childCount: 11 }))).toBe(
      "Website rebuild and all 11 items under it will be deleted. This cannot be undone.",
    );
  });

  it("says nothing about children when there are none", () => {
    expect(nodeDeleteMessage(node({}))).toBe(
      "Website rebuild will be deleted. This cannot be undone.",
    );
  });

  it("names the kind when the row has no name yet", () => {
    // Deleting the blank row you just inserted is common, and "will be deleted." with nothing
    // in front of it reads as a bug.
    expect(nodeDeleteMessage(node({ name: "", type: "task" }))).toBe(
      "This task will be deleted. This cannot be undone.",
    );
  });

  it("is empty with no row, so a closing dialog does not flash a half-sentence", () => {
    expect(nodeDeleteMessage(null)).toBe("");
  });
});

describe("nodeDeleteTitle", () => {
  it("names the kind", () => {
    expect(nodeDeleteTitle(node({ type: "task" }))).toBe("Delete this task?");
    expect(nodeDeleteTitle(node({ type: "result_area" }))).toBe(
      "Delete this result area?",
    );
  });

  it("falls back to a neutral noun with no row", () => {
    expect(nodeDeleteTitle(null)).toBe("Delete this row?");
  });
});
