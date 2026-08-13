import { describe, expect, it } from "vitest";
import { applyPending, coalesceWrites, readPending, readScopeValue } from "./queue";

describe("readScopeValue", () => {
  it("prefers the newest pending write over the server row", () => {
    const value = readScopeValue(
      { "grid:outline": { v: 3, order: ["a"] } },
      [
        { scope: "grid:outline", value: { v: 3, order: ["b"] } },
        { scope: "grid:tasks", value: { v: 3 } },
        { scope: "grid:outline", value: { v: 3, order: ["c"] } },
      ],
      "grid:outline",
    );
    expect(value).toEqual({ v: 3, order: ["c"] });
  });

  it("falls back to the server row when nothing is pending for the scope", () => {
    expect(
      readScopeValue(
        { "grid:outline": 1 },
        [{ scope: "grid:tasks", value: 2 }],
        "grid:outline",
      ),
    ).toBe(1);
  });

  it("returns the tombstone for a reset scope rather than the row it masks", () => {
    // A reset queues `undefined`. Reading past it would resurrect the server row, and a
    // patch built on that would write the cleared settings straight back.
    expect(
      readScopeValue(
        { "grid:outline": 1 },
        [{ scope: "grid:outline", value: undefined }],
        "grid:outline",
      ),
    ).toBeUndefined();
  });
});

describe("coalesceWrites", () => {
  it("keeps only the last write per scope", () => {
    expect(
      coalesceWrites([
        { scope: "grid:tasks", value: 1 },
        { scope: "grid:tasks", value: 2 },
        { scope: "grid:tasks", value: 3 },
      ]),
    ).toEqual([{ scope: "grid:tasks", value: 3 }]);
  });

  it("holds each scope's original position", () => {
    // A later write to an earlier scope must not reshuffle the drain order.
    expect(
      coalesceWrites([
        { scope: "grid:tasks", value: 1 },
        { scope: "grid:goals", value: 1 },
        { scope: "grid:tasks", value: 2 },
      ]),
    ).toEqual([
      { scope: "grid:tasks", value: 2 },
      { scope: "grid:goals", value: 1 },
    ]);
  });

  it("is empty for an empty queue", () => {
    expect(coalesceWrites([])).toEqual([]);
  });
});

describe("applyPending", () => {
  it("layers unflushed writes over the server snapshot", () => {
    // Pending is newer than what the server returned, so a reload after a failed save
    // still shows the user their own change.
    expect(
      applyPending({ "grid:tasks": "server", "grid:goals": "server" }, [
        { scope: "grid:tasks", value: "local" },
      ]),
    ).toEqual({ "grid:tasks": "local", "grid:goals": "server" });
  });

  it("adds a scope the server has never stored", () => {
    expect(applyPending({}, [{ scope: "drawer", value: "local" }])).toEqual({
      drawer: "local",
    });
  });

  it("returns the snapshot untouched when nothing is pending", () => {
    const snapshot = { "grid:tasks": "server" };
    expect(applyPending(snapshot, [])).toBe(snapshot);
  });
});

describe("readPending", () => {
  it("round-trips a queue", () => {
    const pending = [{ scope: "grid:tasks", value: { v: 1 } }];
    expect(readPending(JSON.stringify(pending))).toEqual(pending);
  });

  it("is empty for absent or unparseable storage", () => {
    expect(readPending(null)).toEqual([]);
    expect(readPending("")).toEqual([]);
    expect(readPending("{oops")).toEqual([]);
    expect(readPending('{"scope":"grid:tasks"}')).toEqual([]);
  });

  it("drops entries a write would reject rather than replaying them", () => {
    // A bad scope fails the whole batch it rides in, taking good writes down with it.
    const raw = JSON.stringify([
      { scope: "wishes:list", value: 1 },
      { scope: "grid:tasks", value: 1 },
      { scope: 7, value: 1 },
      "not an entry",
      { scope: "grid:goals" },
    ]);

    expect(readPending(raw)).toEqual([{ scope: "grid:tasks", value: 1 }]);
  });

  it("coalesces a queue that was written without one", () => {
    const raw = JSON.stringify([
      { scope: "grid:tasks", value: 1 },
      { scope: "grid:tasks", value: 2 },
    ]);

    expect(readPending(raw)).toEqual([{ scope: "grid:tasks", value: 2 }]);
  });

  it("keeps a null value, which is a legitimate stored setting", () => {
    expect(readPending(JSON.stringify([{ scope: "drawer", value: null }]))).toEqual([
      { scope: "drawer", value: null },
    ]);
  });
});
