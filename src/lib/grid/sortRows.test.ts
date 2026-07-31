import { describe, expect, it } from "vitest";
import type { GridRow } from "@/lib/tree/slice";
import { compareSortValues, sortRowsWithinGroups } from "./sortRows";

/** Rows carrying just enough shape to sort; the payload is the sort value itself. */
type Row = GridRow<{ value: string | number | null }>;

function node(id: string, value: string | number | null): Row {
  return { kind: "node", id, node: { value }, depth: 0 };
}

function group(id: string, depth = 0): Row {
  return { kind: "group", id, label: id, count: 0, depth, collapsed: false };
}

const valueOf = (row: Extract<Row, { kind: "node" }>) => row.node.value;

function ids(rows: Row[]): string[] {
  return rows.map((row) => (row.kind === "group" ? `[${row.id}]` : row.id));
}

describe("compareSortValues", () => {
  it("sorts blanks last", () => {
    expect(compareSortValues(null, "a")).toBeGreaterThan(0);
    expect(compareSortValues("a", null)).toBeLessThan(0);
    expect(compareSortValues(null, undefined)).toBe(0);
  });

  it("compares numbers numerically, not as text", () => {
    // 10 vs 9 as strings would put 10 first.
    expect(compareSortValues(10, 9)).toBeGreaterThan(0);
  });

  it("compares ranked priorities in human order", () => {
    // "A10" must follow "A2", which plain lexical comparison gets backwards.
    expect(compareSortValues("A2", "A10")).toBeLessThan(0);
  });
});

describe("sortRowsWithinGroups", () => {
  it("sorts a flat list", () => {
    const rows = [node("c", "c"), node("a", "a"), node("b", "b")];
    expect(ids(sortRowsWithinGroups(rows, valueOf, "asc"))).toEqual(["a", "b", "c"]);
    expect(ids(sortRowsWithinGroups(rows, valueOf, "desc"))).toEqual(["c", "b", "a"]);
  });

  it("sorts inside each group instead of skipping the sort", () => {
    // The bug this replaces: any group header at all meant no reordering happened, while
    // the header still showed a sort arrow.
    const rows = [
      group("work"),
      node("w2", "b"),
      node("w1", "a"),
      group("home"),
      node("h2", "z"),
      node("h1", "y"),
    ];

    expect(ids(sortRowsWithinGroups(rows, valueOf, "asc"))).toEqual([
      "[work]",
      "w1",
      "w2",
      "[home]",
      "h1",
      "h2",
    ]);
  });

  it("never moves a row across a group boundary", () => {
    // "a" in the second group must not lead the first group, whatever the direction.
    const rows = [group("g1"), node("n1", "m"), group("g2"), node("n2", "a")];

    expect(ids(sortRowsWithinGroups(rows, valueOf, "asc"))).toEqual([
      "[g1]",
      "n1",
      "[g2]",
      "n2",
    ]);
  });

  it("handles nested group headers", () => {
    const rows = [group("outer", 0), group("inner", 1), node("b", "b"), node("a", "a")];

    expect(ids(sortRowsWithinGroups(rows, valueOf, "asc"))).toEqual([
      "[outer]",
      "[inner]",
      "a",
      "b",
    ]);
  });

  it("leaves a header with no rows, and a single-row group, alone", () => {
    const rows = [group("empty"), group("one"), node("only", "x")];
    expect(ids(sortRowsWithinGroups(rows, valueOf, "asc"))).toEqual([
      "[empty]",
      "[one]",
      "only",
    ]);
  });

  it("keeps ties in their original order", () => {
    // Stability is the only sensible tiebreak: for the tree tabs the incoming order is the
    // outline's own.
    const rows = [node("first", "same"), node("second", "same"), node("third", "same")];
    expect(ids(sortRowsWithinGroups(rows, valueOf, "desc"))).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("keeps blanks last in both directions", () => {
    // Descending should not bury thirty rows with no deadline above the ones that have one.
    const rows = [node("blank", null), node("a", "a"), node("b", "b")];

    expect(ids(sortRowsWithinGroups(rows, valueOf, "asc"))).toEqual([
      "a",
      "b",
      "blank",
    ]);
    expect(ids(sortRowsWithinGroups(rows, valueOf, "desc"))).toEqual([
      "b",
      "a",
      "blank",
    ]);
  });

  it("returns an empty list untouched", () => {
    expect(sortRowsWithinGroups([], valueOf, "asc")).toEqual([]);
  });
});
