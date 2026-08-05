import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHELL_SETTINGS,
  parseShellSettings,
  serializeShellSettings,
} from "./shell";
import { isValidScope, SHELL_SCOPE } from "./scopes";

describe("parseShellSettings", () => {
  it("round-trips through serialize", () => {
    const settings = { sidebarCollapsed: true };
    expect(parseShellSettings(serializeShellSettings(settings))).toEqual(settings);
  });

  /**
   * This runs before the first paint, on whatever the row happens to contain. Throwing here
   * does not fail one grid, it fails the shell — so every unusable shape has to land on the
   * default rather than on an exception.
   */
  it("falls back to expanded for anything unusable", () => {
    for (const junk of [undefined, null, "collapsed", 42, [], true]) {
      expect(parseShellSettings(junk)).toEqual(DEFAULT_SHELL_SETTINGS);
    }
  });

  it("ignores a non-boolean sidebarCollapsed rather than treating it as truthy", () => {
    expect(parseShellSettings({ sidebarCollapsed: "true" })).toEqual({
      sidebarCollapsed: false,
    });
    expect(parseShellSettings({ sidebarCollapsed: 1 })).toEqual({
      sidebarCollapsed: false,
    });
  });

  it("keeps the stored value when the blob carries unrelated keys", () => {
    expect(parseShellSettings({ v: 2, sidebarCollapsed: true, width: 240 })).toEqual({
      sidebarCollapsed: true,
    });
  });
});

describe("SHELL_SCOPE", () => {
  it("is a scope the settings table will accept", () => {
    expect(isValidScope(SHELL_SCOPE)).toBe(true);
  });
});
