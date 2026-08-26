import { describe, expect, it } from "vitest";
import { canonicalPayeeName } from "./canonicalNames";

describe("canonicalPayeeName", () => {
  it("names Apple Inc. descriptors Apple", () => {
    expect(canonicalPayeeName("APPLE/BILL")).toBe("Apple");
    expect(canonicalPayeeName("APPLE/US")).toBe("Apple");
    expect(canonicalPayeeName("APPLE SERVICES")).toBe("Apple");
    expect(canonicalPayeeName("APPLE")).toBe("Apple");
  });

  it("does not name a different APPLE* merchant Apple Inc.", () => {
    expect(canonicalPayeeName("APPLE GREENE WINE AND SPIDUNKIRKMD")).toBeNull();
  });
});
