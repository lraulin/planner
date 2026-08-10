import { describe, expect, it } from "vitest";
import { fromDateKey } from "@/lib/schedule/geometry";
import { organizerQueue, type OrganizerQueueNode } from "./queue";

function node(
  values: Partial<OrganizerQueueNode> & Pick<OrganizerQueueNode, "id">,
): OrganizerQueueNode {
  return {
    id: values.id,
    parentId: values.parentId ?? null,
    type: values.type ?? "task",
    sortKey: values.sortKey ?? values.id,
    state: values.state ?? "not_started",
    isInbox: values.isInbox ?? false,
    shelf: values.shelf ?? null,
  };
}

describe("organizerQueue", () => {
  it("returns direct roots in Inbox order rather than counting descendants", () => {
    const rows = [
      node({ id: "inbox", type: "project", isInbox: true }),
      node({ id: "second", parentId: "inbox", sortKey: "b" }),
      node({ id: "child", parentId: "second", sortKey: "a" }),
      node({ id: "first", parentId: "inbox", sortKey: "a" }),
      node({ id: "elsewhere", parentId: null }),
    ];

    expect(organizerQueue(rows, "2026-08-09").map((row) => row.id)).toEqual([
      "first",
      "second",
    ]);
  });

  it("hides settled and active-shelf roots but restores an expired shelf", () => {
    const rows = [
      node({ id: "inbox", type: "project", isInbox: true }),
      node({ id: "done", parentId: "inbox", state: "completed" }),
      node({
        id: "later",
        parentId: "inbox",
        state: "postponed",
        shelf: { sourceId: "later", until: fromDateKey("2026-08-10") },
      }),
      node({
        id: "today",
        parentId: "inbox",
        state: "postponed",
        shelf: { sourceId: "today", until: fromDateKey("2026-08-09") },
      }),
    ];

    expect(organizerQueue(rows, "2026-08-09").map((row) => row.id)).toEqual(["today"]);
  });
});
