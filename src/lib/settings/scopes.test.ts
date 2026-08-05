import { describe, expect, it } from "vitest";
import {
  chooserScope,
  describeScope,
  DRAWER_SCOPE,
  gridScope,
  isValidScope,
  NOTES_FILTER_SCOPE,
  parseScope,
} from "./scopes";

describe("parseScope", () => {
  it("splits a keyed scope into kind and key", () => {
    expect(parseScope(gridScope("tasks"))).toEqual({ kind: "grid", key: "tasks" });
    expect(parseScope(chooserScope("tc-priority"))).toEqual({
      kind: "chooser",
      key: "tc-priority",
    });
  });

  it("accepts the singleton scopes with no key", () => {
    expect(parseScope(DRAWER_SCOPE)).toEqual({ kind: "drawer", key: null });
  });

  it("accepts the constants this app actually writes", () => {
    for (const scope of [NOTES_FILTER_SCOPE, DRAWER_SCOPE]) {
      expect(isValidScope(scope)).toBe(true);
    }
  });

  it("rejects an unknown kind", () => {
    expect(parseScope("wishes:list")).toBeNull();
    expect(parseScope("")).toBeNull();
  });

  it("rejects a keyed kind with no key, and a singleton kind with one", () => {
    expect(parseScope("grid")).toBeNull();
    expect(parseScope("grid:")).toBeNull();
    expect(parseScope("drawer:tasks")).toBeNull();
  });

  it("accepts a tab.view key, which is how per-view layouts are scoped", () => {
    expect(parseScope(gridScope("projects.active-status"))).toEqual({
      kind: "grid",
      key: "projects.active-status",
    });
  });

  it("rejects keys that would make the id ambiguous or unbounded", () => {
    // A second `:`, whitespace, or uppercase means someone is constructing scopes by hand
    // rather than from the builders — reject rather than store a lookalike.
    expect(parseScope("grid:tasks:extra")).toBeNull();
    expect(parseScope("grid:my tasks")).toBeNull();
    expect(parseScope("grid:Tasks")).toBeNull();
    expect(parseScope(`grid:${"a".repeat(65)}`)).toBeNull();
    expect(parseScope(`grid:${"a".repeat(64)}`)).not.toBeNull();
  });

  it("rejects a key starting with a hyphen", () => {
    expect(parseScope("grid:-tasks")).toBeNull();
  });
});

describe("describeScope", () => {
  it("names a scope for the reset page", () => {
    expect(describeScope(gridScope("tasks"))).toBe("Grid — Tasks");
    expect(describeScope(chooserScope("tc-priority"))).toBe(
      "Task Chooser — Tc priority",
    );
    expect(describeScope(DRAWER_SCOPE)).toBe("Detail drawer");
  });

  it("reads a tab.view key as two parts", () => {
    expect(describeScope(gridScope("projects.active-status"))).toBe(
      "Grid — Projects / Active status",
    );
  });

  it("falls back to the raw scope rather than hiding a row it cannot name", () => {
    // A row written by an older build must still be visible and resettable.
    expect(describeScope("retired:thing")).toBe("retired:thing");
  });
});
