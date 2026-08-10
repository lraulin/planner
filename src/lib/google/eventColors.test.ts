import { describe, expect, it } from "vitest";
import {
  eventColorEntry,
  eventColorHex,
  GOOGLE_EVENT_COLORS,
  isGoogleEventColorId,
  normalizeColorId,
} from "./eventColors";

describe("GOOGLE_EVENT_COLORS", () => {
  it("has the eleven Google palette entries, ids 1–11", () => {
    expect(GOOGLE_EVENT_COLORS).toHaveLength(11);
    expect(GOOGLE_EVENT_COLORS.map((c) => c.id)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
    ]);
  });

  it("every entry has a hex background", () => {
    for (const c of GOOGLE_EVENT_COLORS) {
      expect(c.background).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("eventColorHex", () => {
  it("resolves a known id", () => {
    expect(eventColorHex("11")).toBe("#dc2127");
    expect(eventColorHex("1")).toBe("#a4bdfc");
  });

  it("returns null for default / missing / unknown", () => {
    expect(eventColorHex(null)).toBeNull();
    expect(eventColorHex(undefined)).toBeNull();
    expect(eventColorHex("")).toBeNull();
    expect(eventColorHex("99")).toBeNull();
  });
});

describe("normalizeColorId", () => {
  it("keeps known ids and nulls everything else", () => {
    expect(normalizeColorId("5")).toBe("5");
    expect(normalizeColorId(null)).toBeNull();
    expect(normalizeColorId("")).toBeNull();
    expect(normalizeColorId("not-a-colour")).toBeNull();
  });
});

describe("isGoogleEventColorId / eventColorEntry", () => {
  it("recognises palette members by name", () => {
    expect(isGoogleEventColorId("9")).toBe(true);
    expect(isGoogleEventColorId("0")).toBe(false);
    expect(eventColorEntry("9")?.name).toBe("Blueberry");
    expect(eventColorEntry(null)).toBeNull();
  });
});
