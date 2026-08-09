import { describe, expect, it } from "vitest";
import { pageBounds, paginate } from "./pagination";

describe("agent pagination", () => {
  it("discloses truncation and the exact continuation offset", () => {
    const result = paginate(["a", "b", "c", "d"], { offset: 1, limit: 2 });
    expect(result).toEqual({
      items: ["b", "c"],
      pageInfo: {
        offset: 1,
        limit: 2,
        returned: 2,
        total: 4,
        hasMore: true,
        nextOffset: 3,
      },
    });
  });

  it("normalizes bounds without ever returning an unbounded page", () => {
    expect(pageBounds(-4, 999)).toEqual({ offset: 0, limit: 200 });
  });
});
