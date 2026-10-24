import { describe, expect, it } from "vitest";
import { neighbourhood, type NeighbourLink } from "./neighbourhood";

const child = (id: string, fromId: string, toId: string): NeighbourLink => ({
  id,
  fromId,
  toId,
  kind: "child",
});
const jump = (id: string, fromId: string, toId: string): NeighbourLink => ({
  id,
  fromId,
  toId,
  kind: "jump",
});

describe("neighbourhood", () => {
  it("splits links into parents, children and jumps", () => {
    const h = neighbourhood("X", [
      child("l1", "P", "X"),
      child("l2", "X", "C"),
      jump("l3", "J", "X"),
      jump("l4", "X", "K"),
    ]);
    expect(h.parents).toEqual([{ thoughtId: "P", linkId: "l1" }]);
    expect(h.children).toEqual([{ thoughtId: "C", linkId: "l2" }]);
    expect(h.jumps.map((j) => j.thoughtId)).toEqual(["J", "K"]);
    expect(h.siblings).toEqual([]);
  });

  it("derives siblings from the parents' other children", () => {
    const h = neighbourhood("X", [
      child("l1", "P", "X"),
      child("l2", "P", "S1"),
      child("l3", "P", "S2"),
    ]);
    expect(h.siblings).toEqual([
      { thoughtId: "S1", viaParentId: "P" },
      { thoughtId: "S2", viaParentId: "P" },
    ]);
  });

  it("lists a sibling once when two parents share it", () => {
    const h = neighbourhood("X", [
      child("l1", "P1", "X"),
      child("l2", "P2", "X"),
      child("l3", "P1", "S"),
      child("l4", "P2", "S"),
    ]);
    // First parent wins, so the sibling has one line, not two.
    expect(h.siblings).toEqual([{ thoughtId: "S", viaParentId: "P1" }]);
  });

  it("never lists the active thought, or a neighbour, as a sibling", () => {
    const h = neighbourhood("X", [
      child("l1", "P", "X"),
      child("l2", "P", "C"),
      child("l3", "X", "C"),
      child("l4", "P", "J"),
      jump("l5", "J", "X"),
    ]);
    expect(h.siblings).toEqual([]);
    expect(h.children.map((c) => c.thoughtId)).toEqual(["C"]);
    expect(h.jumps.map((c) => c.thoughtId)).toEqual(["J"]);
  });

  it("handles a loop through the active thought", () => {
    // X → C → P → X: P is X's parent and C its child; the closing link is not a sibling.
    const h = neighbourhood("X", [
      child("l1", "P", "X"),
      child("l2", "X", "C"),
      child("l3", "C", "P"),
    ]);
    expect(h.parents).toEqual([{ thoughtId: "P", linkId: "l1" }]);
    expect(h.children).toEqual([{ thoughtId: "C", linkId: "l2" }]);
    expect(h.siblings).toEqual([]);
  });

  it("ignores links that do not touch the active thought or a parent", () => {
    const h = neighbourhood("X", [child("l1", "A", "B"), jump("l2", "C", "D")]);
    expect(h).toEqual({ parents: [], children: [], jumps: [], siblings: [] });
  });
});
