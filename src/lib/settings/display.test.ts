import { describe, expect, it } from "vitest";
import { DEFAULT_DATE_FORMAT } from "@/lib/dateFormat";
import { SETTINGS_VERSION } from "./scopes";
import { parseDisplaySettings, serializeDisplaySettings } from "./display";

describe("display settings", () => {
  it("parses and serializes a supported date format", () => {
    const settings = parseDisplaySettings({ v: 1, dateFormat: "DDDD" });
    expect(settings).toEqual({ dateFormat: "DDDD" });
    expect(serializeDisplaySettings(settings)).toEqual({
      v: SETTINGS_VERSION,
      dateFormat: "DDDD",
    });
  });

  it("falls back defensively for missing, malformed, and retired formats", () => {
    for (const value of [null, [], "display", {}, { dateFormat: "YYYY.DD.MM" }]) {
      expect(parseDisplaySettings(value)).toEqual({
        dateFormat: DEFAULT_DATE_FORMAT,
      });
    }
  });
});
