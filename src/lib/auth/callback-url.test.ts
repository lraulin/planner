import { describe, expect, it } from "vitest";
import { safeCallbackPath } from "./callback-url";

describe("safeCallbackPath", () => {
  it("defaults to outline when missing", () => {
    expect(safeCallbackPath(undefined)).toBe("/outline");
    expect(safeCallbackPath(null)).toBe("/outline");
    expect(safeCallbackPath("")).toBe("/outline");
  });

  it("allows relative app paths", () => {
    expect(safeCallbackPath("/notes")).toBe("/notes");
    expect(safeCallbackPath("/schedule/plan?week=1")).toBe("/schedule/plan?week=1");
  });

  it("rejects open redirects", () => {
    expect(safeCallbackPath("https://evil.example")).toBe("/outline");
    expect(safeCallbackPath("//evil.example")).toBe("/outline");
    expect(safeCallbackPath("/\\evil")).toBe("/outline");
  });
});
