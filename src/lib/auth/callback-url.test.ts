import { describe, expect, it } from "vitest";
import { loginPathFor, safeCallbackPath } from "./callback-url";

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

describe("loginPathFor", () => {
  it("sends a lapsed session to /login with the page it was on", () => {
    expect(loginPathFor("/plan/outline")).toBe("/login?callbackUrl=%2Fplan%2Foutline");
    expect(loginPathFor("/schedule/plan?week=1")).toBe(
      "/login?callbackUrl=%2Fschedule%2Fplan%3Fweek%3D1",
    );
  });

  it("drops a callback that would only lead back to a form or the root", () => {
    expect(loginPathFor("/login")).toBe("/login");
    expect(loginPathFor("/login?callbackUrl=%2Fplan")).toBe("/login");
    expect(loginPathFor("/signup")).toBe("/login");
    expect(loginPathFor("/")).toBe("/login");
    expect(loginPathFor(null)).toBe("/login");
  });

  it("does not carry an off-site callback", () => {
    expect(loginPathFor("//evil.example")).toBe("/login");
    expect(loginPathFor("https://evil.example")).toBe("/login");
  });
});
