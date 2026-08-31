import { describe, expect, it } from "vitest";
import { isRepeatableTitle, normalisedTitle, titlesMatch } from "./titleMatch";

describe("titlesMatch", () => {
  it("trims and ignores case so Push and push are the same workout", () => {
    expect(titlesMatch(" Push ", "push")).toBe(true);
    expect(normalisedTitle(" Push ")).toBe("push");
  });

  it("does not treat empty as a repeatable title", () => {
    expect(isRepeatableTitle("")).toBe(false);
    expect(isRepeatableTitle("   ")).toBe(false);
    expect(isRepeatableTitle("Push")).toBe(true);
  });

  it("does not match Push to Pull", () => {
    expect(titlesMatch("Push", "Pull")).toBe(false);
  });
});
