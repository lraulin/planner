import { describe, expect, it } from "vitest";
import { toggledIn } from "./toggledIn";

describe("toggledIn", () => {
  it("adds a missing value and removes a present one, leaving the input alone", () => {
    const start = new Set(["a"]);
    expect([...toggledIn(start, "b")]).toEqual(["a", "b"]);
    expect([...toggledIn(start, "a")]).toEqual([]);
    expect([...start]).toEqual(["a"]);
  });
});
