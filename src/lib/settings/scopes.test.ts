import { describe, expect, it } from "vitest";
import {
  chooserScope,
  describeScope,
  DISPLAY_SCOPE,
  DRAWER_SCOPE,
  gridScope,
  isValidScope,
  NOTES_DEFAULT_VIEW_ID,
  NOTES_FILTER_SCOPE,
  notesViewScope,
  parseScope,
  WORKING_VIEW_ID,
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
    expect(parseScope(DISPLAY_SCOPE)).toEqual({ kind: "display", key: null });
  });

  it("accepts the constants this app actually writes", () => {
    for (const scope of [NOTES_FILTER_SCOPE, DRAWER_SCOPE, DISPLAY_SCOPE]) {
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

describe("notesViewScope", () => {
  it("keeps the default view on the legacy key", () => {
    // Every existing mode and saved filter lives at `notes:filter`. Notes gaining a view
    // picker must not move them, or the first load after the upgrade silently resets them.
    expect(notesViewScope(NOTES_DEFAULT_VIEW_ID)).toBe(NOTES_FILTER_SCOPE);
    expect(notesViewScope(WORKING_VIEW_ID)).toBe(NOTES_FILTER_SCOPE);
  });

  it("gives a saved view its own scope, addressable by the settings store", () => {
    const scope = notesViewScope("saved-1a2b3c4d");
    expect(scope).toBe("notes:saved-1a2b3c4d");
    // It is also the fork target when a view is saved, so an unwritable key would lose the
    // module's settings rather than fail loudly.
    expect(isValidScope(scope)).toBe(true);
  });
});
