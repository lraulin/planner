import { describe, expect, it } from "vitest";
import { nodeItem } from "@/lib/testing/nodeItem";
import { cycleItemSort, defaultItemSort, itemSortValue, sortItems } from "./itemSort";

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
      nodeItem({ id: "1", priorityLetter: "B", priorityRank: null }),
      nodeItem({ id: "2", priorityLetter: null, priorityRank: null }),
      nodeItem({ id: "3", priorityLetter: "A", priorityRank: 2 }),
      nodeItem({ id: "4", priorityLetter: "A", priorityRank: 1 }),
    ];

    expect(
      sortItems(rows, { column: "priority", direction: "asc" }).map((r) => r.id),
    ).toEqual(["4", "3", "1", "2"]);
  });

  it("puts a ranked item above the bare letter it shares", () => {
    const rows = [
      nodeItem({ id: "bare", priorityLetter: "B", priorityRank: null }),
      nodeItem({ id: "b2", priorityLetter: "B", priorityRank: 2 }),
      nodeItem({ id: "b1", priorityLetter: "B", priorityRank: 1 }),
    ];

    expect(
      sortItems(rows, { column: "priority", direction: "asc" }).map((r) => r.id),
    ).toEqual(["b1", "b2", "bare"]);
  });

  it("keeps blanks last when sorting priority descending", () => {
    const rows = [
      nodeItem({ id: "blank" }),
      nodeItem({ id: "b", priorityLetter: "B", priorityRank: 1 }),
      nodeItem({ id: "a", priorityLetter: "A", priorityRank: 1 }),
    ];

    expect(
      sortItems(rows, { column: "priority", direction: "desc" }).map((r) => r.id),
    ).toEqual(["b", "a", "blank"]);
  });

  it("sorts title text case-insensitively and keeps stored order on ties", () => {
    const rows = [
      nodeItem({ id: "1", title: "beta", sortKey: "a" }),
      nodeItem({ id: "2", title: "Alpha", sortKey: "b" }),
      nodeItem({ id: "3", title: "alpha", sortKey: "c" }),
    ];

    expect(
      sortItems(rows, { column: "title", direction: "asc" }).map((r) => r.id),
    ).toEqual(["2", "3", "1"]);
  });

  it("sorts numeric columns numerically", () => {
    const rows = [
      nodeItem({ id: "1", score: 10 }),
      nodeItem({ id: "2", score: 2 }),
      nodeItem({ id: "3", score: null }),
    ];

    expect(
      sortItems(rows, { column: "score", direction: "asc" }).map((r) => r.id),
    ).toEqual(["2", "1", "3"]);
  });

  it("sorts a contact column by display name, not id", () => {
    const names = new Map([
      ["id-z", "Ada"],
      ["id-a", "Zoe"],
    ]);
    const rows = [
      nodeItem({ id: "1", contactId: "id-a" }),
      nodeItem({ id: "2", contactId: "id-z" }),
      nodeItem({ id: "3", contactId: null }),
    ];

    expect(
      sortItems(rows, { column: "contactId", direction: "asc" }, names).map(
        (r) => r.id,
      ),
    ).toEqual(["2", "1", "3"]);
  });

  it("returns the input order when sort is cleared", () => {
    const rows = [
      nodeItem({ id: "z", sortKey: "1" }),
      nodeItem({ id: "a", sortKey: "2" }),
    ];
    expect(sortItems(rows, null).map((r) => r.id)).toEqual(["z", "a"]);
  });

  it("encodes priority so A10 is after A2", () => {
    const a2 = nodeItem({
      id: "a2",
      priorityLetter: "A",
      priorityRank: 2,
    });
    const a10 = nodeItem({
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
