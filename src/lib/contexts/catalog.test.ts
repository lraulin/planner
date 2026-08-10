import { describe, expect, it } from "vitest";
import { contextSuggestions, normaliseContextName } from "./catalog";

describe("normaliseContextName", () => {
  it("trims display text and compares case-insensitively", () => {
    expect(normaliseContextName("  @Home ")).toEqual({
      name: "@Home",
      normalizedName: "@home",
    });
  });

  it("rejects an empty catalog entry", () => {
    expect(() => normaliseContextName("   ")).toThrow("cannot be empty");
  });
});

describe("contextSuggestions", () => {
  const catalog = ["@Anywhere", "@Computer", "@Home", "Routine"];

  it("matches the current comma-delimited token", () => {
    expect(contextSuggestions(catalog, "@Home, comp")).toEqual(["@Computer"]);
  });

  it("returns the whole catalog for an empty token", () => {
    expect(contextSuggestions(catalog, "@Home, ")).toEqual(catalog);
  });
});
