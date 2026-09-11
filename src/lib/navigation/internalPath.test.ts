import { describe, expect, it } from "vitest";
import { internalPath } from "./internalPath";

describe("internalPath", () => {
  it("keeps a path in this app, query and all", () => {
    expect(internalPath("/schedule/time-charts")).toBe("/schedule/time-charts");
    expect(internalPath("/schedule/calendar?start=2026-09-10&chart=a")).toBe(
      "/schedule/calendar?start=2026-09-10&chart=a",
    );
  });

  it("refuses anything that would leave the app", () => {
    expect(internalPath("https://evil.example")).toBeUndefined();
    expect(internalPath("//evil.example")).toBeUndefined();
    expect(internalPath("/\\evil.example")).toBeUndefined();
    expect(internalPath("javascript:alert(1)")).toBeUndefined();
  });

  it("refuses what is not one string", () => {
    // Next hands a repeated parameter over as an array.
    expect(internalPath(["/a", "/b"])).toBeUndefined();
    expect(internalPath(undefined)).toBeUndefined();
  });
});
