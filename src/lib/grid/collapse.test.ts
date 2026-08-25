import { describe, expect, it } from "vitest";
import type { GridRow } from "@/lib/tree/slice";
import { applyGroupCollapse, dropEmptyGroups } from "./collapse";

function node(id: string): GridRow<{ id: string }> {
  return { kind: "node", id, node: { id }, depth: 0 };
}

function group(id: string, depth = 0, count = 0): GridRow<{ id: string }> {
  return { kind: "group", id, label: id, count, depth, collapsed: false };
}

function ids(rows: GridRow<{ id: string }>[]): string[] {
  return rows.map((row) => row.id);
}

describe("dropEmptyGroups", () => {
  it("restates a header's count to the nodes that actually survived the filter", () => {
    const rows = [group("career", 0, 7), node("a"), node("b"), node("hidden")];
    const out = dropEmptyGroups(rows, new Set(["a", "b"]));
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ kind: "group", id: "career", count: 2 });
    expect(ids(out)).toEqual(["career", "a", "b"]);
  });

  it("drops a nested header whose members all failed, and keeps the parent", () => {
    const rows = [
      group("year", 0, 3),
      group("jan", 1, 2),
      node("a"),
      node("gone"),
      group("feb", 1, 1),
      node("b"),
    ];
    const out = dropEmptyGroups(rows, new Set(["a"]));
    expect(ids(out)).toEqual(["year", "jan", "a"]);
    expect(out[0]).toMatchObject({ kind: "group", count: 1 });
    expect(out[1]).toMatchObject({ kind: "group", count: 1 });
  });

  it("drops a group whose own members all failed, without taking a later sibling's rows", () => {
    const rows = [
      group("empty", 0, 2),
      node("a"),
      node("b"),
      group("other"),
      node("kept"),
    ];
    const out = dropEmptyGroups(rows, new Set(["kept"]));
    expect(ids(out)).toEqual(["other", "kept"]);
    expect(out[0]).toMatchObject({ kind: "group", id: "other", count: 1 });
  });
});

describe("applyGroupCollapse", () => {
  it("omits nested headers and nodes under a collapsed parent, then shows the sibling", () => {
    const rows = [
      group("outer"),
      group("inner", 1),
      node("a"),
      group("sibling"),
      node("b"),
    ];
    const out = applyGroupCollapse(rows, new Set(["outer"]));
    expect(ids(out)).toEqual(["outer", "sibling", "b"]);
  });

  it("hides only the nested group's members when the parent stays expanded", () => {
    const rows = [
      group("outer"),
      group("inner", 1),
      node("a"),
      group("sibling"),
      node("b"),
    ];
    const out = applyGroupCollapse(rows, new Set(["inner"]));
    expect(ids(out)).toEqual(["outer", "inner", "sibling", "b"]);
  });

  it("collapses two sibling groups independently", () => {
    const rows = [group("one"), node("a"), group("two"), node("b")];
    expect(ids(applyGroupCollapse(rows, new Set(["one"])))).toEqual([
      "one",
      "two",
      "b",
    ]);
    expect(ids(applyGroupCollapse(rows, new Set(["two"])))).toEqual([
      "one",
      "a",
      "two",
    ]);
    expect(ids(applyGroupCollapse(rows, new Set(["one", "two"])))).toEqual([
      "one",
      "two",
    ]);
  });
});
