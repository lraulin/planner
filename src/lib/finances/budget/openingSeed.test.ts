import { describe, expect, it } from "vitest";

import {
  effectiveOpeningCents,
  openingSeedLabel,
  seedAccountOpening,
  type OpeningSeed,
} from "./openingSeed";

describe("effectiveOpeningCents", () => {
  it("sums every on-budget account's own opening once all are seeded", () => {
    expect(
      effectiveOpeningCents(
        [
          { offBudget: false, budgetOpeningCents: 100_00 },
          { offBudget: false, budgetOpeningCents: -25_00 },
          { offBudget: true, budgetOpeningCents: null },
        ],
        999_99,
      ),
    ).toBe(75_00);
  });

  it("falls back to the legacy total when any on-budget account is unseeded", () => {
    expect(
      effectiveOpeningCents(
        [
          { offBudget: false, budgetOpeningCents: 100_00 },
          { offBudget: false, budgetOpeningCents: null },
        ],
        50_00,
      ),
    ).toBe(50_00);
  });

  it("ignores an off-budget account's null opening", () => {
    // Off-budget accounts are never seeded and never should be — they are excluded from
    // the sum by their own offBudget flag, not by carrying a value.
    expect(
      effectiveOpeningCents(
        [
          { offBudget: false, budgetOpeningCents: 10_00 },
          { offBudget: true, budgetOpeningCents: null },
        ],
        999_99,
      ),
    ).toBe(10_00);
  });

  it("sums to 0 with no on-budget accounts, not the legacy total", () => {
    expect(
      effectiveOpeningCents([{ offBudget: true, budgetOpeningCents: null }], 999_99),
    ).toBe(0);
    expect(effectiveOpeningCents([], 999_99)).toBe(0);
  });
});

describe("seedAccountOpening", () => {
  it("prefers a statement's closing balance plus the rows since it", () => {
    const seed = seedAccountOpening(
      { closingCents: 100_000, closingDateKey: "2026-07-28" },
      -4_500,
      999_999,
    );
    expect(seed).toEqual({
      openingCents: 95_500,
      source: "statement",
      statementDateKey: "2026-07-28",
    });
  });

  it("falls back to the live headline position when no statement covers the day", () => {
    const seed = seedAccountOpening(null, 0, 42_000);
    expect(seed).toEqual({ openingCents: 42_000, source: "bank-headline" });
  });

  it("ignores rowsSinceCloseCents on the headline path — nothing to add it to", () => {
    // The headline figure is already today's live position; rows since a statement close
    // are only meaningful once there is a statement to add them onto.
    const seed = seedAccountOpening(null, -50_000, 42_000);
    expect(seed).toEqual({ openingCents: 42_000, source: "bank-headline" });
  });

  it("refuses fractional cents anywhere they could enter", () => {
    expect(() =>
      seedAccountOpening({ closingCents: 100.5, closingDateKey: "2026-07-28" }, 0, 0),
    ).toThrow(/integer cents/);
    expect(() =>
      seedAccountOpening({ closingCents: 100, closingDateKey: "2026-07-28" }, 0.5, 0),
    ).toThrow(/integer cents/);
    expect(() => seedAccountOpening(null, 0, 10.25)).toThrow(/integer cents/);
  });
});

describe("openingSeedLabel", () => {
  it("names the statement's closing date", () => {
    const seed: OpeningSeed = {
      openingCents: 95_500,
      source: "statement",
      statementDateKey: "2026-07-28",
    };
    expect(openingSeedLabel(seed)).toBe("seeded from the statement closing 2026-07-28");
  });

  it("names the bank headline", () => {
    const seed: OpeningSeed = { openingCents: 42_000, source: "bank-headline" };
    expect(openingSeedLabel(seed)).toBe("seeded from the bank headline");
  });
});
