import { describe, expect, it } from "vitest";
import { parseImportMode } from "./importMode";

describe("parseImportMode", () => {
  it("accepts exactly the two modes", () => {
    expect(parseImportMode("merge")).toBe("merge");
    expect(parseImportMode("replace")).toBe("replace");
  });

  it("never turns a missing or mistyped mode into the destructive one", () => {
    for (const raw of [
      null,
      undefined,
      "",
      "Merge",
      "merge ",
      "REPLACE",
      "overwrite",
    ]) {
      expect(parseImportMode(raw)).toBeNull();
    }
  });
});
