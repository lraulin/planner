import { describe, expect, it } from "vitest";

import {
  anchorStatement,
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

describe("anchorStatement", () => {
  const july = { periodStart: "2026-07-01", periodEnd: "2026-07-31", closingCents: 1 };
  const cardJuly = {
    periodStart: "2026-06-19",
    periodEnd: "2026-07-18",
    closingCents: 2,
  };
  const cardAug = {
    periodStart: "2026-07-19",
    periodEnd: "2026-08-18",
    closingCents: 3,
  };
  const cardSep = {
    periodStart: "2026-08-19",
    periodEnd: "2026-09-18",
    closingCents: 4,
  };

  it("takes a statement closing on the day itself", () => {
    expect(anchorStatement([july], "2026-07-31")).toBe(july);
  });

  it("takes the latest close before the day over the period containing it", () => {
    // The card case: Jul 18 closed before the day, Aug 18 contains it. Anchoring on Aug 18
    // would carry post-start rows into the opening. Order must not matter.
    const older = {
      periodStart: "2026-05-19",
      periodEnd: "2026-06-18",
      closingCents: 5,
    };
    expect(anchorStatement([cardSep, cardAug, older, cardJuly], "2026-07-31")).toBe(
      cardJuly,
    );
  });

  it("falls back to the earliest close after the day when none closes on or before", () => {
    expect(anchorStatement([cardSep, cardAug], "2026-07-31")).toBe(cardAug);
  });

  it("returns null with no statements", () => {
    expect(anchorStatement([], "2026-07-31")).toBeNull();
  });
});

describe("seedAccountOpening", () => {
  const DAY = "2026-07-31";

  it("is the closing balance when the statement closes on the day and nothing crosses", () => {
    const seed = seedAccountOpening(
      {
        statement: { periodStart: "2026-07-01", periodEnd: DAY, closingCents: 76_446 },
        rows: [
          {
            transactionDate: "2026-07-30",
            postedDate: "2026-07-30",
            amountCents: -999,
          },
        ],
      },
      DAY,
      0,
    );
    expect(seed).toEqual({
      openingCents: 76_446,
      source: "statement",
      statementDateKey: DAY,
      crossingCents: 0,
    });
  });

  it("walks a later close back to the day, keeping rows dated by the day that posted inside the period", () => {
    // Card statement Jul 19 – Aug 18, closing −$500.00 (module sign).
    const seed = seedAccountOpening(
      {
        statement: {
          periodStart: "2026-07-19",
          periodEnd: "2026-08-18",
          closingCents: -50_000,
        },
        rows: [
          // Dated Jul 30, posted Aug 1: in the closing balance and part of the Jul 31 position.
          {
            transactionDate: "2026-07-30",
            postedDate: "2026-08-01",
            amountCents: -2_000,
          },
          // Dated and posted after the day, by the close: in the closing, not in the position.
          {
            transactionDate: "2026-08-05",
            postedDate: "2026-08-06",
            amountCents: -7_000,
          },
          // A payment dated after the day, no posted date (taken as its transaction date).
          { transactionDate: "2026-08-10", postedDate: null, amountCents: 30_000 },
          // Dated Aug 18 but posted Aug 19: not in this closing at all, so nothing to take out.
          {
            transactionDate: "2026-08-18",
            postedDate: "2026-08-19",
            amountCents: -4_000,
          },
        ],
      },
      DAY,
      999_999,
    );
    // −500.00 − (−70.00) − (+300.00) = −730.00
    expect(seed).toMatchObject({ openingCents: -73_000, crossingCents: -23_000 });
  });

  it("adds charges dated before an earlier close that posted after it", () => {
    // The real 2026-10-08 failure: a Jul 18 close, two charges dated Jul 17–18 that posted
    // Jul 19–20. Dating by transaction date alone left $60.02 out of the opening.
    const seed = seedAccountOpening(
      {
        statement: {
          periodStart: "2026-06-19",
          periodEnd: "2026-07-18",
          closingCents: -40_000,
        },
        rows: [
          {
            transactionDate: "2026-07-17",
            postedDate: "2026-07-19",
            amountCents: -3_501,
          },
          {
            transactionDate: "2026-07-18",
            postedDate: "2026-07-20",
            amountCents: -2_501,
          },
          {
            transactionDate: "2026-07-25",
            postedDate: "2026-07-26",
            amountCents: -1_000,
          },
          // Posted by the close: already in it.
          {
            transactionDate: "2026-07-16",
            postedDate: "2026-07-18",
            amountCents: -8_888,
          },
        ],
      },
      DAY,
      0,
    );
    expect(seed.openingCents).toBe(-40_000 - 6_002 - 1_000);
  });

  it("falls back to the live headline position when no statement anchors the day", () => {
    expect(seedAccountOpening(null, DAY, 42_000)).toEqual({
      openingCents: 42_000,
      source: "bank-headline",
    });
  });

  it("refuses fractional cents anywhere they could enter", () => {
    const statement = { periodStart: "2026-07-01", periodEnd: DAY, closingCents: 100 };
    expect(() =>
      seedAccountOpening(
        { statement: { ...statement, closingCents: 100.5 }, rows: [] },
        DAY,
        0,
      ),
    ).toThrow(/integer cents/);
    expect(() =>
      seedAccountOpening(
        {
          statement,
          rows: [
            {
              transactionDate: "2026-07-31",
              postedDate: "2026-08-01",
              amountCents: 0.5,
            },
          ],
        },
        DAY,
        0,
      ),
    ).toThrow(/integer cents/);
    expect(() => seedAccountOpening(null, DAY, 10.25)).toThrow(/integer cents/);
  });
});

describe("openingSeedLabel", () => {
  it("names the statement's closing date", () => {
    const seed: OpeningSeed = {
      openingCents: 95_500,
      source: "statement",
      statementDateKey: "2026-07-28",
      crossingCents: 0,
    };
    expect(openingSeedLabel(seed)).toBe("seeded from the statement closing 2026-07-28");
  });

  it("names the bank headline", () => {
    const seed: OpeningSeed = { openingCents: 42_000, source: "bank-headline" };
    expect(openingSeedLabel(seed)).toBe("seeded from the bank headline");
  });
});
