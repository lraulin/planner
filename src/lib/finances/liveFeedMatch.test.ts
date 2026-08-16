import { describe, expect, it } from "vitest";
import {
  descriptionsOverlap,
  selectNewAgainstMixed,
  selectUnmatched,
} from "./liveFeedMatch";
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

describe("selectNewAgainstMixed — a statement imported after a sync", () => {
  /**
   * The rows below are the real ones a live sync wrote for a Chase card, paired with what
   * the bank's own CSV calls the same transactions. This is the direction that bites weeks
   * later: the sync runs daily, and a statement covering those days arrives afterwards.
   */
  const syncedRows = [
    {
      transactionDate: "2026-08-13",
      amountCents: -5299,
      description: "Amazon.com*5H6FP28L2",
      fromLiveFeed: true,
    },
    {
      transactionDate: "2026-08-13",
      amountCents: -3659,
      description: "AMAZON MKTPL*5H2B12SR0",
      fromLiveFeed: true,
    },
    {
      transactionDate: "2026-08-14",
      amountCents: 20427,
      description: "Payment Thank You-Mobile",
      fromLiveFeed: true,
    },
  ];

  it("skips statement rows the sync already wrote, despite the one-day offset", () => {
    // Chase dates these a day later than the aggregator does. Under the strict matcher all
    // three imported a second time.
    const { keep, skipCount } = selectNewAgainstMixed(syncedRows, [
      {
        transactionDate: "2026-08-14",
        amountCents: -5299,
        description: "Amazon.com*5H6FP28L2",
      },
      {
        transactionDate: "2026-08-14",
        amountCents: -3659,
        description: "AMAZON MKTPL*5H2B12SR0",
      },
      {
        transactionDate: "2026-08-15",
        amountCents: 20427,
        description: "Payment Thank You-Mobile",
      },
    ]);
    expect(keep).toHaveLength(0);
    expect(skipCount).toBe(3);
  });

  it("still imports a statement row the sync never saw", () => {
    const { keep } = selectNewAgainstMixed(syncedRows, [
      {
        transactionDate: "2026-08-14",
        amountCents: -5299,
        description: "Amazon.com*5H6FP28L2",
      },
      {
        transactionDate: "2026-08-16",
        amountCents: -1234,
        description: "SOMETHING NEW ENTIRELY",
      },
    ]);
    expect(keep.map((r) => r.description)).toEqual(["SOMETHING NEW ENTIRELY"]);
  });

  it("keeps exact matching between two file imports", () => {
    // A statement row and a CSV row for the same transaction agree on the date, so the
    // looser rule must not apply to them — that is what would start dropping real rows.
    const fromCsv = [
      {
        transactionDate: "2026-08-10",
        amountCents: -1059,
        description: "WL *Steam Purchase",
        fromLiveFeed: false,
      },
    ];
    const sameDay = selectNewAgainstMixed(fromCsv, [
      {
        transactionDate: "2026-08-10",
        amountCents: -1059,
        description: "WL *STEAM PURCHASE",
      },
    ]);
    expect(sameDay.keep).toHaveLength(0);

    const nextDay = selectNewAgainstMixed(fromCsv, [
      {
        transactionDate: "2026-08-11",
        amountCents: -1059,
        description: "WL *Steam Purchase",
      },
    ]);
    // A genuinely separate purchase of the same thing the next day still imports.
    expect(nextDay.keep).toHaveLength(1);
  });

  it("does not let one synced row absorb two statement rows", () => {
    // Two identical charges, one already synced: the second must still import.
    const { keep } = selectNewAgainstMixed(
      [
        {
          transactionDate: "2026-08-14",
          amountCents: -1059,
          description: "AMAZON MKTPL*5H1YV8C82",
          fromLiveFeed: true,
        },
      ],
      [
        {
          transactionDate: "2026-08-14",
          amountCents: -1059,
          description: "AMAZON MKTPL*5H1YV8C82",
        },
        {
          transactionDate: "2026-08-14",
          amountCents: -1059,
          description: "AMAZON MKTPL*5H1YV8C82",
        },
      ],
    );
    expect(keep).toHaveLength(1);
  });
});
