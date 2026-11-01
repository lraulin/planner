import { describe, expect, it } from "vitest";
import { groupBy } from "./groupBy";

describe("groupBy", () => {
  it("keeps input order within a bucket and first-seen order across buckets", () => {
    const groups = groupBy(
      [
        { id: 1, k: "b" },
        { id: 2, k: "a" },
        { id: 3, k: "b" },
      ],
      (row) => row.k,
    );
    expect([...groups.keys()]).toEqual(["b", "a"]);
    expect(groups.get("b")?.map((row) => row.id)).toEqual([1, 3]);
  });

  it("buckets a null key like any other", () => {
    const groups = groupBy([{ p: null }, { p: "x" }, { p: null }], (row) => row.p);
    expect(groups.get(null)).toHaveLength(2);
  });
});
