import { describe, expect, it } from "vitest";

import { monthsUntilBy, runBy } from "./by";
import type { ByTemplate } from "./types";

const car: ByTemplate = {
  id: "car",
  directive: "template",
  type: "by",
  priority: 0,
  amountCents: 1_000_000,
  month: "2026-12",
};

describe("runBy", () => {
  it("divides remaining need by remaining months, reduced by carry-in", () => {
    // $10,000 by Dec 2026, applying in January, $1,500 already in.
    // 11 months remaining → 12 slices. (1000000 - 150000) / 12 = 70833.33 → 70833.
    const { toBudget } = runBy([car], "2026-01-01", 150_000);
    expect(toBudget).toBe(Math.round((1_000_000 - 150_000) / 12));
  });

  it("is not the naive target/12 when carry-in is non-zero", () => {
    const naive = Math.round(1_000_000 / 12);
    const { toBudget } = runBy([car], "2026-01-01", 150_000);
    expect(toBudget).not.toBe(naive);
  });

  it("requests 0 for a one-shot whose month has passed, not a negative assign", () => {
    expect(monthsUntilBy(car, "2027-01-01")).toBeNull();
    expect(runBy([car], "2027-01-01", 0).toBudget).toBe(0);
  });

  it("walks a repeating target forward by its period", () => {
    const yearly: ByTemplate = {
      id: "ins",
      directive: "template",
      type: "by",
      priority: 0,
      amountCents: 50_000,
      month: "2025-03",
      annual: true,
      repeat: 1,
    };
    // From Jan 2026 the next March is 2026-03 (2 months away).
    expect(monthsUntilBy(yearly, "2026-01-01")).toBe(2);
    const { toBudget } = runBy([yearly], "2026-01-01", 0);
    expect(toBudget).toBe(Math.round(50_000 / 3));
  });

  it("uses the shortest window when two by templates share an envelope", () => {
    const later: ByTemplate = {
      id: "later",
      directive: "template",
      type: "by",
      priority: 0,
      amountCents: 1_200_000,
      month: "2027-12",
    };
    const { toBudget, perTemplate } = runBy([car, later], "2026-01-01", 0);
    // Short window is 11 months (car). later is interpolated onto that window.
    expect(perTemplate.get("car")).toBe(1_000_000);
    expect(toBudget).toBeGreaterThan(0);
    expect(toBudget).toBe(
      Math.round((1_000_000 + (perTemplate.get("later") ?? 0)) / 12),
    );
  });
});
