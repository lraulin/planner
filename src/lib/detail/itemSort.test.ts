import { describe, expect, it } from "vitest";
import type { NodeItem } from "@/db/schema";
import { cycleItemSort, defaultItemSort, itemSortValue, sortItems } from "./itemSort";

/** Minimal row for sort tests — only the fields sortItems actually reads. */
function item(overrides: Partial<NodeItem> & Pick<NodeItem, "id">): NodeItem {
  return {
    userId: "u",
    nodeId: "n",
    kind: "benefit",
    sortKey: overrides.id,
    priorityLetter: null,
    priorityRank: null,
    title: "",
    description: "",
    criteria: "",
    stakeholders: "",
    itemType: null,
    stake: "",
    severity: null,
    probability: null,
    detection: "",
    prevention: "",
    mitigation: "",
    advantages: "",
    disadvantages: "",
    decision: "",
    idealCandidate: "",
    candidates: "",
    filled: false,
    filledBy: "",
    association: "",
    contact: "",
    source: "",
    resolution: "",
    resolved: false,
    url: "",
    purpose: "",
    strategy: "",
    people: "",
    completed: false,
    received: false,
    conditions: "",
    awarded: false,
    reason: "",
    active: true,
    category: "",
    question: "",
    target: "",
    assignedTo: "",
    entryDate: null,
    score: null,
    comments: "",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

describe("defaultItemSort", () => {
  it("defaults to priority ascending when Pri is a column", () => {
    expect(defaultItemSort(["priority", "title", "received"])).toEqual({
      column: "priority",
      direction: "asc",
    });
  });

  it("stays unsorted when the list has no priority column", () => {
    expect(defaultItemSort(["entryDate", "score", "comments"])).toBeNull();
    expect(defaultItemSort(["title", "association"])).toBeNull();
  });
});

describe("cycleItemSort", () => {
  it("starts ascending on a new column, then desc, then clears", () => {
    expect(cycleItemSort(null, "title")).toEqual({
      column: "title",
      direction: "asc",
    });
    expect(cycleItemSort({ column: "title", direction: "asc" }, "title")).toEqual({
      column: "title",
      direction: "desc",
    });
    expect(cycleItemSort({ column: "title", direction: "desc" }, "title")).toBeNull();
  });

  it("switches to ascending when clicking a different column", () => {
    expect(cycleItemSort({ column: "priority", direction: "desc" }, "title")).toEqual({
      column: "title",
      direction: "asc",
    });
  });
});

describe("itemSortValue / sortItems", () => {
  it("orders A before B before blank, with ranks inside a letter", () => {
    const rows = [
      item({ id: "1", priorityLetter: "B", priorityRank: null }),
      item({ id: "2", priorityLetter: null, priorityRank: null }),
      item({ id: "3", priorityLetter: "A", priorityRank: 2 }),
      item({ id: "4", priorityLetter: "A", priorityRank: 1 }),
    ];

    expect(
      sortItems(rows, { column: "priority", direction: "asc" }).map((r) => r.id),
    ).toEqual(["4", "3", "1", "2"]);
  });

  it("keeps blanks last when sorting priority descending", () => {
    const rows = [
      item({ id: "blank" }),
      item({ id: "b", priorityLetter: "B", priorityRank: 1 }),
      item({ id: "a", priorityLetter: "A", priorityRank: 1 }),
    ];

    expect(
      sortItems(rows, { column: "priority", direction: "desc" }).map((r) => r.id),
    ).toEqual(["b", "a", "blank"]);
  });

  it("sorts title text case-insensitively and keeps stored order on ties", () => {
    const rows = [
      item({ id: "1", title: "beta", sortKey: "a" }),
      item({ id: "2", title: "Alpha", sortKey: "b" }),
      item({ id: "3", title: "alpha", sortKey: "c" }),
    ];

    expect(
      sortItems(rows, { column: "title", direction: "asc" }).map((r) => r.id),
    ).toEqual(["2", "3", "1"]);
  });

  it("sorts numeric columns numerically", () => {
    const rows = [
      item({ id: "1", score: 10 }),
      item({ id: "2", score: 2 }),
      item({ id: "3", score: null }),
    ];

    expect(
      sortItems(rows, { column: "score", direction: "asc" }).map((r) => r.id),
    ).toEqual(["2", "1", "3"]);
  });

  it("returns the input order when sort is cleared", () => {
    const rows = [item({ id: "z", sortKey: "1" }), item({ id: "a", sortKey: "2" })];
    expect(sortItems(rows, null).map((r) => r.id)).toEqual(["z", "a"]);
  });

  it("encodes priority so A10 is after A2", () => {
    const a2 = item({
      id: "a2",
      priorityLetter: "A",
      priorityRank: 2,
    });
    const a10 = item({
      id: "a10",
      priorityLetter: "A",
      priorityRank: 10,
    });
    const left = itemSortValue(a2, "priority");
    const right = itemSortValue(a10, "priority");
    expect(left).toEqual(expect.any(Number));
    expect(right).toEqual(expect.any(Number));
    expect(Number(left)).toBeLessThan(Number(right));
  });
});
