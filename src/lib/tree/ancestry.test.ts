import { describe, expect, it } from "vitest";
import { isSelfOrDescendantIn, isSelfOrDescendantVia } from "./ancestry";

const tree = () =>
  new Map([
    ["area", { parentId: null }],
    ["goal", { parentId: "area" }],
    ["proj", { parentId: "goal" }],
    ["t1", { parentId: "proj" }],
    ["area2", { parentId: null }],
  ]);

const lookup =
  (byId: ReadonlyMap<string, { parentId: string | null }>) => (id: string) =>
    Promise.resolve(byId.get(id)?.parentId);

describe("isSelfOrDescendantIn", () => {
  it("counts a node as inside itself", () => {
    expect(isSelfOrDescendantIn(tree(), "proj", "proj")).toBe(true);
  });

  it("walks the whole chain, not just the immediate parent", () => {
    expect(isSelfOrDescendantIn(tree(), "area", "t1")).toBe(true);
    expect(isSelfOrDescendantIn(tree(), "area2", "t1")).toBe(false);
  });

  it("says no for the top level", () => {
    expect(isSelfOrDescendantIn(tree(), "area", null)).toBe(false);
  });

  it("says no for a node the map does not hold", () => {
    expect(isSelfOrDescendantIn(tree(), "area", "ghost")).toBe(false);
  });

  // A corrupt ACHXML import can write a `parent_id` ring. Without the visited set this
  // spins forever rather than answering, which is the whole reason this module exists.
  it("terminates on a parent cycle", () => {
    const cyclic = new Map([
      ["a", { parentId: "b" }],
      ["b", { parentId: "a" }],
    ]);
    expect(isSelfOrDescendantIn(cyclic, "x", "a")).toBe(false);
    expect(isSelfOrDescendantIn(cyclic, "a", "b")).toBe(true);
  });
});

describe("isSelfOrDescendantVia", () => {
  it("walks the whole chain", async () => {
    const parentOf = lookup(tree());
    expect(await isSelfOrDescendantVia("area", "t1", parentOf)).toBe(true);
    expect(await isSelfOrDescendantVia("area2", "t1", parentOf)).toBe(false);
    expect(await isSelfOrDescendantVia("proj", "proj", parentOf)).toBe(true);
  });

  it("says no for the top level and for a row that is gone", async () => {
    const parentOf = lookup(tree());
    expect(await isSelfOrDescendantVia("area", null, parentOf)).toBe(false);
    expect(await isSelfOrDescendantVia("area", "ghost", parentOf)).toBe(false);
  });

  it("stops asking once a row is missing", async () => {
    const asked: string[] = [];
    const answer = await isSelfOrDescendantVia("area", "ghost", (id) => {
      asked.push(id);
      return Promise.resolve(undefined);
    });
    expect(answer).toBe(false);
    expect(asked).toEqual(["ghost"]);
  });

  it("terminates on a parent cycle", async () => {
    const cyclic = new Map([
      ["a", { parentId: "b" }],
      ["b", { parentId: "a" }],
    ]);
    const parentOf = lookup(cyclic);
    expect(await isSelfOrDescendantVia("x", "a", parentOf)).toBe(false);
    expect(await isSelfOrDescendantVia("a", "b", parentOf)).toBe(true);
  });

  it("visits each node once on a cycle rather than unbounded times", async () => {
    const cyclic = new Map([
      ["a", { parentId: "b" }],
      ["b", { parentId: "c" }],
      ["c", { parentId: "a" }],
    ]);
    let calls = 0;
    await isSelfOrDescendantVia("x", "a", (id) => {
      calls += 1;
      return Promise.resolve(cyclic.get(id)?.parentId);
    });
    expect(calls).toBe(3);
  });
});
