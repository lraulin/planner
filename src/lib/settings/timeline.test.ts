import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMELINE_SETTINGS,
  parseTimelineSettings,
  serializeTimelineSettings,
} from "./timeline";

describe("parseTimelineSettings", () => {
  it("defaults to the grid, so an existing reader's page does not change under them", () => {
    expect(parseTimelineSettings(undefined)).toEqual(DEFAULT_TIMELINE_SETTINGS);
    expect(parseTimelineSettings(null)).toEqual(DEFAULT_TIMELINE_SETTINGS);
    expect(parseTimelineSettings("ribbon")).toEqual(DEFAULT_TIMELINE_SETTINGS);
  });

  it("round-trips a stored choice", () => {
    const stored = serializeTimelineSettings({ presentation: "ribbon", zoom: "years" });
    expect(parseTimelineSettings(stored)).toEqual({
      presentation: "ribbon",
      zoom: "years",
    });
  });

  it("keeps the key it recognises when the other one is junk", () => {
    // The per-key fallback `data-grid.md` asks for: a blob written before a key existed, or by a
    // build that spelled it differently, must not reset everything beside it.
    expect(parseTimelineSettings({ presentation: "ribbon", zoom: "century" })).toEqual({
      presentation: "ribbon",
      zoom: "fit",
    });
    expect(parseTimelineSettings({ zoom: "decades" })).toEqual({
      presentation: "grid",
      zoom: "decades",
    });
  });
});
