import { describe, expect, it } from "vitest";
import { isRecord } from "./isRecord";

describe("isRecord", () => {
  it("accepts a plain object", () => {
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it.each([[null], [[]], ["text"], [3], [undefined]])("refuses %j", (value) => {
    expect(isRecord(value)).toBe(false);
  });
});
