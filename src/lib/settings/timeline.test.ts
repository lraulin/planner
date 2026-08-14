import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMELINE_SETTINGS,
  parseTimelineSettings,
  serializeTimelineSettings,
} from "./timeline";

describe("parseTimelineSettings", () => {
  it("defaults to the whole life on the grid", () => {
    expect(parseTimelineSettings(undefined)).toEqual(DEFAULT_TIMELINE_SETTINGS);
    expect(parseTimelineSettings(null)).toEqual(DEFAULT_TIMELINE_SETTINGS);
    expect(parseTimelineSettings("ribbon")).toEqual(DEFAULT_TIMELINE_SETTINGS);
  });

  it("round-trips a stored choice", () => {
    const stored = serializeTimelineSettings({
      presentation: "ribbon",
      window: { startKey: "2014-03-01", endKey: "2020-09-30" },
    });
    expect(parseTimelineSettings(stored)).toEqual({
      presentation: "ribbon",
      window: { startKey: "2014-03-01", endKey: "2020-09-30" },
    });
  });

  it("keeps the presentation written by a build that stored a zoom instead", () => {
    // The per-key fallback `data-grid.md` asks for. `zoom` was this scope's other key until the
    // range control replaced it; a blob still carrying one must not lose the presentation beside it.
    expect(parseTimelineSettings({ presentation: "ribbon", zoom: "years" })).toEqual({
      presentation: "ribbon",
      window: null,
    });
  });

  it("drops a window it cannot trust rather than drawing a nonsense axis", () => {
    // Every one of these would reach `daysBetweenKeys` and come back NaN, which is a blank ribbon
    // with no explanation.
    for (const window of [
      { startKey: "2014-03-01" },
      { endKey: "2020-09-30" },
      { startKey: "March", endKey: "2020-09-30" },
      { startKey: "2014-3-1", endKey: "2020-09-30" },
      { startKey: "2020-09-30", endKey: "2014-03-01" },
      "2014-03-01/2020-09-30",
    ]) {
      expect(parseTimelineSettings({ presentation: "ribbon", window })).toEqual({
        presentation: "ribbon",
        window: null,
      });
    }
  });
});
