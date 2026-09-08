import { describe, expect, it } from "vitest";
import { isSelfOrDescendantIn, isSelfOrDescendantVia, subtreeIdsVia } from "./ancestry";

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

describe("subtreeIdsVia", () => {
  const children =
    (byParent: Record<string, string[]>) => (frontier: readonly string[]) =>
      Promise.resolve(
        frontier.flatMap((id) => (byParent[id] ?? []).map((c) => ({ id: c }))),
      );

  it("returns the root and every descendant", async () => {
    const ids = await subtreeIdsVia(
      "area",
      children({ area: ["goal"], goal: ["proj"], proj: ["t1", "t2"] }),
    );
    expect([...ids].sort()).toEqual(["area", "goal", "proj", "t1", "t2"]);
  });

  it("returns just the root when it has no children", async () => {
    expect(await subtreeIdsVia("solo", children({}))).toEqual(["solo"]);
  });

  // Unguarded this never terminates — the frontier keeps handing the ring back. The
  // database callers do it inside an open transaction, a query per turn.
  it("terminates on a parent cycle", async () => {
    const ids = await subtreeIdsVia("a", children({ a: ["b"], b: ["c"], c: ["a"] }));
    expect([...ids].sort()).toEqual(["a", "b", "c"]);
  });

  it("asks for each node's children at most once on a cycle", async () => {
    const asked: string[] = [];
    const byParent: Record<string, string[]> = { a: ["b"], b: ["c"], c: ["a", "b"] };
    await subtreeIdsVia("a", (frontier) => {
      asked.push(...frontier);
      return Promise.resolve(
        frontier.flatMap((id) => (byParent[id] ?? []).map((c) => ({ id: c }))),
      );
    });
    expect(asked.sort()).toEqual(["a", "b", "c"]);
  });

  it("does not revisit a node reachable by two paths", async () => {
    const ids = await subtreeIdsVia(
      "root",
      children({ root: ["l", "r"], l: ["shared"], r: ["shared"], shared: [] }),
    );
    expect([...ids].sort()).toEqual(["l", "r", "root", "shared"]);
  });
});
