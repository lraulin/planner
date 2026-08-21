import { describe, expect, it } from "vitest";
import type { GridRow } from "@/lib/tree/slice";
import { groupMembers } from "./groupMembers";

function node(id: string): GridRow<{ id: string }> {
  return { kind: "node", id, node: { id }, depth: 0 };
}

function group(id: string, depth = 0): GridRow<{ id: string }> {
  return { kind: "group", id, label: id, count: 0, depth, collapsed: false };
}

function idsUnder(map: Map<string, { id: string }[]>, groupId: string): string[] {
  return (map.get(groupId) ?? []).map((row) => row.id);
}

describe("groupMembers", () => {
  it("returns an empty map when there are no group headers", () => {
    expect(groupMembers([node("a"), node("b")]).size).toBe(0);
  });

  it("lists every node under a header, including those sitting under nested headers", () => {
    const map = groupMembers([
      group("outer"),
      group("inner", 1),
      node("a"),
      node("b"),
      group("sibling"),
      node("c"),
    ]);
    expect(idsUnder(map, "outer")).toEqual(["a", "b"]);
    expect(idsUnder(map, "inner")).toEqual(["a", "b"]);
    expect(idsUnder(map, "sibling")).toEqual(["c"]);
  });

  it("does not let a later group inherit an earlier group's rows", () => {
    const map = groupMembers([group("one"), node("a"), group("two"), node("b")]);
    expect(idsUnder(map, "one")).toEqual(["a"]);
    expect(idsUnder(map, "two")).toEqual(["b"]);
  });

  it("records an empty list for a header with nothing under it", () => {
    const map = groupMembers([group("empty"), group("next"), node("a")]);
    expect(idsUnder(map, "empty")).toEqual([]);
    expect(idsUnder(map, "next")).toEqual(["a"]);
  });
});
