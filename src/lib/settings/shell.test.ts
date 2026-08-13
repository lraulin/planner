import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHELL_SETTINGS,
  parseShellSettings,
  serializeShellSettings,
} from "./shell";
import { isValidScope, SHELL_SCOPE } from "./scopes";

describe("parseShellSettings", () => {
  it("round-trips through serialize", () => {
    const settings = {
      sidebarCollapsed: true,
      commandsPanelOpen: true,
      commandsPanelCollapsed: { Zoom: true, Move: false },
      lastPage: { schedule: "agenda", notes: "journal" },
    };
    expect(parseShellSettings(serializeShellSettings(settings))).toEqual(settings);
  });

  /**
   * This runs before the first paint, on whatever the row happens to contain. Throwing here
   * does not fail one grid, it fails the shell — so every unusable shape has to land on the
   * default rather than on an exception.
   */
  it("falls back to the defaults for anything unusable", () => {
    for (const junk of [undefined, null, "collapsed", 42, [], true]) {
      expect(parseShellSettings(junk)).toEqual(DEFAULT_SHELL_SETTINGS);
    }
  });

  it("ignores a non-boolean flag rather than treating it as truthy", () => {
    expect(parseShellSettings({ sidebarCollapsed: "true" })).toMatchObject({
      sidebarCollapsed: false,
    });
    expect(parseShellSettings({ sidebarCollapsed: 1 })).toMatchObject({
      sidebarCollapsed: false,
    });
    expect(parseShellSettings({ commandsPanelOpen: "yes" })).toMatchObject({
      commandsPanelOpen: false,
    });
  });

  it("keeps the stored value when the blob carries unrelated keys", () => {
    expect(parseShellSettings({ v: 2, sidebarCollapsed: true, width: 240 })).toEqual({
      ...DEFAULT_SHELL_SETTINGS,
      sidebarCollapsed: true,
    });
  });

  it("drops non-boolean entries from the collapsed-sections map", () => {
    // The map is keyed by a section *label*, so its keys are strings this build may not know.
    // A junk value has to fall out without taking the usable neighbours with it.
    expect(
      parseShellSettings({
        commandsPanelCollapsed: { Zoom: true, Move: "nope", Expand: null },
      }).commandsPanelCollapsed,
    ).toEqual({ Zoom: true });
  });

  it("survives a collapsed-sections map that is not a map", () => {
    expect(
      parseShellSettings({ commandsPanelCollapsed: ["Zoom"] }).commandsPanelCollapsed,
    ).toEqual({});
  });

  /**
   * `lastPage` is keyed by module id and valued with a page id, both of which are strings this
   * build may no longer recognise. The parser's job is only to get strings out; whether the page
   * still exists is `builtPageById`'s question, at the point of use.
   */
  it("keeps last-page entries as strings and drops the rest", () => {
    expect(
      parseShellSettings({
        lastPage: { schedule: "agenda", notes: 3, fitness: "", metrics: null },
      }).lastPage,
    ).toEqual({ schedule: "agenda" });
  });

  it("survives a last-page map that is not a map", () => {
    expect(parseShellSettings({ lastPage: "agenda" }).lastPage).toEqual({});
  });
});

describe("SHELL_SCOPE", () => {
  it("is a scope the settings table will accept", () => {
    expect(isValidScope(SHELL_SCOPE)).toBe(true);
  });
});
