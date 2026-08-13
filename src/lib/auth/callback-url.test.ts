import { describe, expect, it } from "vitest";
import { safeCallbackPath } from "./callback-url";

describe("safeCallbackPath", () => {
  it("defaults to the Plan entry point when missing", () => {
    expect(safeCallbackPath(undefined)).toBe("/plan");
    expect(safeCallbackPath(null)).toBe("/plan");
    expect(safeCallbackPath("")).toBe("/plan");
  });

  it("allows relative app paths", () => {
    expect(safeCallbackPath("/notes")).toBe("/notes");
    expect(safeCallbackPath("/schedule/plan?week=1")).toBe("/schedule/plan?week=1");
  });

  it("rejects open redirects", () => {
    expect(safeCallbackPath("https://evil.example")).toBe("/plan");
    expect(safeCallbackPath("//evil.example")).toBe("/plan");
    expect(safeCallbackPath("/\\evil")).toBe("/plan");
  });
});
