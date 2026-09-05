import { describe, expect, it } from "vitest";

import { backupFreshness } from "./freshness";

describe("backupFreshness", () => {
  const now = new Date("2026-09-05T12:00:00Z");

  it("is fresh just below 20 hours and due at the 20-hour boundary", () => {
    expect(
      backupFreshness(new Date(now.getTime() - 19.99 * 60 * 60 * 1_000), now),
    ).toBe("fresh");
    expect(backupFreshness(new Date(now.getTime() - 20 * 60 * 60 * 1_000), now)).toBe(
      "due",
    );
  });

  it("is stale at 30 hours or when no verified generation exists", () => {
    expect(backupFreshness(new Date(now.getTime() - 30 * 60 * 60 * 1_000), now)).toBe(
      "stale",
    );
    expect(backupFreshness(null, now)).toBe("stale");
  });
});
