import { describe, expect, it } from "vitest";
import {
  DEFAULT_DRAWER_SETTINGS,
  parseDrawerSettings,
  serializeDrawerSettings,
} from "./drawer";

describe("parseDrawerSettings", () => {
  it("falls back entirely for a non-object", () => {
    for (const value of [null, undefined, 42, "drawer", [], true]) {
      expect(parseDrawerSettings(value)).toEqual(DEFAULT_DRAWER_SETTINGS);
    }
  });

  it("round-trips what it serializes", () => {
    const settings = {
      tabByType: {
        goal: "progress",
        task: "notes",
      },
    };
    expect(parseDrawerSettings(serializeDrawerSettings(settings))).toEqual(settings);
  });

  it("drops unknown node types and empty tab ids", () => {
    const parsed = parseDrawerSettings({
      tabByType: {
        goal: "progress",
        fantasy: "general",
        project: "",
        task: 12,
      },
    });
    expect(parsed.tabByType).toEqual({ goal: "progress" });
  });
});
