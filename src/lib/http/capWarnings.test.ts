import { describe, expect, it } from "vitest";
import { capWarnings } from "./capWarnings";

describe("capWarnings", () => {
  it("returns a copy when the list fits", () => {
    const warnings = ["a", "b"];
    expect(capWarnings(warnings)).toEqual(["a", "b"]);
    expect(capWarnings(warnings)).not.toBe(warnings);
  });

  it("keeps the first cap entries and summarises the rest", () => {
    const warnings = Array.from({ length: 52 }, (_, i) => `w${i}`);
    expect(capWarnings(warnings, 50)).toEqual([
      ...warnings.slice(0, 50),
      "…and 2 more warnings",
    ]);
  });
});
