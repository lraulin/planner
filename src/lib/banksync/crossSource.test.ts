import { describe, expect, it } from "vitest";
import {
  DATE_TOLERANCE_DAYS,
  descriptionsOverlap,
  selectUnmatched,
  syncWindow,
} from "./crossSource";

/**
 * Every case below is a real pair observed while syncing two live accounts against a
 * register built from statement imports. The invented ones are the negatives — what must
 * *not* match — because that is the direction where a mistake is silent.
 */

describe("descriptionsOverlap", () => {
  it("matches identical text", () => {
    expect(
      descriptionsOverlap("AMAZON MKTPL*5H1YV8C82", "AMAZON MKTPL*5H1YV8C82"),
    ).toBe(true);
  });

  it("sees through a statement's wrapper around the feed's text", () => {
    // The Capital One 360 export pads the counterparty; the feed reports it bare. The
    // shared matcher wants a prefix, and here the feed's text sits in the middle.
    expect(
      descriptionsOverlap("RENT:RAULIN", "Withdrawal from RENT:RAULIN RENT:RAULI"),
    ).toBe(true);
    expect(
      descriptionsOverlap("GA8248 TRUSTEDQA", "Deposit from GA8248 TRUSTEDQA PAYROLL"),
    ).toBe(true);
    expect(
      descriptionsOverlap("VACP TREAS 310", "Deposit from VACP TREAS 310 XXVA BENEF"),
    ).toBe(true);
  });

  it("works with the wrapper on either side", () => {
    expect(
      descriptionsOverlap("Deposit from VACP TREAS 310 XX", "VACP TREAS 310"),
    ).toBe(true);
  });

  it("ignores case and interior spacing", () => {
    expect(descriptionsOverlap("rent:raulin  rent", "RENT:RAULIN RENT")).toBe(true);
  });

  it("refuses a short fragment, which would match half the register", () => {
    // Without a length floor a bare processor stamp matches every row it appears in.
    expect(descriptionsOverlap("PAYPAL", "PAYPAL *PADDLE.NET")).toBe(false);
    expect(descriptionsOverlap("SQ *", "SQ *COFFEE SHOP")).toBe(false);
  });

  it("refuses unrelated text", () => {
    expect(descriptionsOverlap("AMAZON MKTPL*5H1YV8C82", "STEAMGAMES.COM")).toBe(false);
  });

  it("refuses an empty description rather than matching everything", () => {
    expect(descriptionsOverlap("", "Withdrawal from RENT:RAULIN")).toBe(false);
  });
});

describe("selectUnmatched", () => {
  const existing = [
    {
      transactionDate: "2026-08-10",
      amountCents: -1059,
      description: "AMAZON MKTPL*5H1YV8C82",
    },
  ];

  it("matches a row dated one day apart, which is the common case", () => {
    // The feed reports the authorisation day; the statement records the bank's own.
    const { keep, matchedCount } = selectUnmatched(existing, [
      {
        transactionDate: "2026-08-09",
        amountCents: -1059,
        description: "AMAZON MKTPL*5H1YV8C82",
      },
    ]);
    expect(keep).toHaveLength(0);
    expect(matchedCount).toBe(1);
  });

  it("matches two days apart but not three", () => {
    const within = selectUnmatched(existing, [
      {
        transactionDate: "2026-08-12",
        amountCents: -1059,
        description: "AMAZON MKTPL*5H1YV8C82",
      },
    ]);
    expect(within.keep).toHaveLength(0);

    const beyond = selectUnmatched(existing, [
      {
        transactionDate: "2026-08-13",
        amountCents: -1059,
        description: "AMAZON MKTPL*5H1YV8C82",
      },
    ]);
    expect(beyond.keep).toHaveLength(1);
  });

  it("never matches on a different amount, however close the date", () => {
    // The amount is the one field both sources always agree on, so it stays exact.
    const { keep } = selectUnmatched(existing, [
      {
        transactionDate: "2026-08-10",
        amountCents: -1060,
        description: "AMAZON MKTPL*5H1YV8C82",
      },
    ]);
    expect(keep).toHaveLength(1);
  });

  it("keeps the second of two identical charges when only one is on file", () => {
    // The occurrence-counting case: two people, one lunch. Dropping the second would be a
    // silently missing transaction.
    const { keep, matchedCount } = selectUnmatched(
      [
        {
          transactionDate: "2026-07-01",
          amountCents: -659,
          description: "SBARRO PIZZA CO",
        },
      ],
      [
        {
          transactionDate: "2026-07-01",
          amountCents: -659,
          description: "SBARRO PIZZA CO",
        },
        {
          transactionDate: "2026-07-01",
          amountCents: -659,
          description: "SBARRO PIZZA CO",
        },
      ],
    );
    expect(keep).toHaveLength(1);
    expect(matchedCount).toBe(1);
  });

  it("pairs a recurring charge with its nearest occurrence, not the first scanned", () => {
    const monthly = [
      {
        transactionDate: "2026-06-29",
        amountCents: -210000,
        description: "RENT:RAULIN MONTHLY",
      },
      {
        transactionDate: "2026-07-31",
        amountCents: -210000,
        description: "RENT:RAULIN MONTHLY",
      },
    ];
    // Only the July one is incoming; it must consume the July row, leaving June free.
    const { keep, matchedCount } = selectUnmatched(monthly, [
      {
        transactionDate: "2026-07-30",
        amountCents: -210000,
        description: "RENT:RAULIN MONTHLY",
      },
    ]);
    expect(keep).toHaveLength(0);
    expect(matchedCount).toBe(1);

    // And a second incoming row now pairs with June rather than being dropped.
    const both = selectUnmatched(monthly, [
      {
        transactionDate: "2026-07-30",
        amountCents: -210000,
        description: "RENT:RAULIN MONTHLY",
      },
      {
        transactionDate: "2026-06-28",
        amountCents: -210000,
        description: "RENT:RAULIN MONTHLY",
      },
    ]);
    expect(both.keep).toHaveLength(0);
    expect(both.matchedCount).toBe(2);
  });

  it("returns everything when there is nothing to compare against", () => {
    const { keep } = selectUnmatched(
      [],
      [
        {
          transactionDate: "2026-08-10",
          amountCents: -100,
          description: "ANYTHING AT ALL",
        },
      ],
    );
    expect(keep).toHaveLength(1);
  });
});

describe("syncWindow", () => {
  it("compares further back than it fetches, by at least the matcher's tolerance", () => {
    // The bug this exists for: loading existing rows from the fetch start hides statement
    // rows dated a day or two earlier, so every transaction on the boundary duplicates.
    // Three did on the first real run.
    const window = syncWindow("2026-08-10", "2026-08-16", 7, 45);
    expect(window.fetchFrom).toBe("2026-08-03");
    expect(window.compareFrom).toBe("2026-08-01");

    const gap =
      (Date.parse(`${window.fetchFrom}T00:00:00Z`) -
        Date.parse(`${window.compareFrom}T00:00:00Z`)) /
      86_400_000;
    expect(gap).toBeGreaterThanOrEqual(DATE_TOLERANCE_DAYS);
  });

  it("resumes from the anchor minus the overlap", () => {
    // The overlap is what catches a transaction that posts later than it happened.
    expect(syncWindow("2026-08-10", "2026-08-16", 7, 45).fetchFrom).toBe("2026-08-03");
  });

  it("falls back to the cap when there is nothing on file", () => {
    // A register with no history has nothing to anchor to, so reach as far as allowed.
    expect(syncWindow(null, "2026-08-16", 7, 45).fetchFrom).toBe("2026-07-02");
  });

  it("never reaches further back than the cap, however old the anchor", () => {
    // A connection left unsynced for a year must not request a year of history — the
    // provider warns past 45 days and may start refusing.
    expect(syncWindow("2025-01-01", "2026-08-16", 7, 45).fetchFrom).toBe("2026-07-02");
  });

  it("looks slightly past today, since a pending row can be dated ahead", () => {
    expect(syncWindow("2026-08-10", "2026-08-16", 7, 45).compareTo).toBe("2026-08-18");
  });
});
