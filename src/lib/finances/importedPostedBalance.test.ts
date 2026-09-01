import { describe, expect, it } from "vitest";
import {
  importedPostedHeadline,
  latestRunningBalance,
  postedActivityDate,
  type RunningBalanceRow,
} from "./importedPostedBalance";

function row(
  over: Partial<RunningBalanceRow> &
    Pick<RunningBalanceRow, "transactionDate" | "amountCents">,
): RunningBalanceRow {
  return {
    postedDate: null,
    balanceAfterCents: null,
    ...over,
  };
}

describe("postedActivityDate", () => {
  it("prefers the posting day when the feed has one", () => {
    expect(
      postedActivityDate({ transactionDate: "2026-08-28", postedDate: "2026-08-31" }),
    ).toBe("2026-08-31");
    expect(
      postedActivityDate({ transactionDate: "2026-08-31", postedDate: null }),
    ).toBe("2026-08-31");
  });
});

describe("latestRunningBalance", () => {
  it("takes the unique newest day's running balance", () => {
    expect(
      latestRunningBalance([
        row({
          transactionDate: "2026-08-31",
          amountCents: 500_000,
          balanceAfterCents: 1_625_746,
        }),
        row({
          transactionDate: "2026-08-24",
          amountCents: 1_000_000,
          balanceAfterCents: 1_125_746,
        }),
      ]),
    ).toEqual({ asOfDate: "2026-08-31", cents: 1_625_746 });
  });

  it("walks a same-day chain to the current figure, newest-first or oldest-first", () => {
    const newestFirst = [
      row({
        transactionDate: "2026-08-10",
        amountCents: -48_120,
        balanceAfterCents: 47_145,
      }),
      row({
        transactionDate: "2026-08-10",
        amountCents: 231_121,
        balanceAfterCents: 95_265,
      }),
    ];
    expect(latestRunningBalance(newestFirst)).toEqual({
      asOfDate: "2026-08-10",
      cents: 47_145,
    });
    expect(latestRunningBalance([...newestFirst].reverse())).toEqual({
      asOfDate: "2026-08-10",
      cents: 47_145,
    });
  });

  it("uses a later day even when its running balance equals an earlier one", () => {
    expect(
      latestRunningBalance([
        row({
          transactionDate: "2026-08-31",
          amountCents: 50_000,
          balanceAfterCents: 100_000,
        }),
        row({
          transactionDate: "2026-08-10",
          amountCents: 100_000,
          balanceAfterCents: 100_000,
        }),
      ]),
    ).toEqual({ asOfDate: "2026-08-31", cents: 100_000 });
  });

  it("refuses two unchained running balances on the newest day", () => {
    expect(
      latestRunningBalance([
        row({
          transactionDate: "2026-08-31",
          amountCents: 500_000,
          balanceAfterCents: 1_625_746,
        }),
        row({
          transactionDate: "2026-08-31",
          amountCents: -1_200,
          balanceAfterCents: 99_000,
        }),
      ]),
    ).toBeNull();
  });

  it("returns null when the file has no running-balance column", () => {
    expect(
      latestRunningBalance([
        row({ transactionDate: "2026-08-31", amountCents: -1_059 }),
      ]),
    ).toBeNull();
  });
});

describe("importedPostedHeadline", () => {
  const synced = { balanceCents: 1_125_746, asOfDate: "2026-08-25" };

  it("reports the file's running balance as of the file's newest data day", () => {
    expect(
      importedPostedHeadline({
        linked: synced,
        running: { asOfDate: "2026-08-31", cents: 1_625_746 },
        inserted: [],
      }),
    ).toEqual({
      cents: 1_625_746,
      asOfDay: "2026-08-31",
      source: "running-balance",
    });
  });

  it("reports a running balance older than the live snapshot rather than refusing", () => {
    // The refusal used to live here as a second, weaker copy of the freshness comparison.
    // The file genuinely reported this figure for 2026-07-31; `sourceAuthority.ts` is what
    // decides it does not outrank a newer source, and it decides that for all three paths.
    expect(
      importedPostedHeadline({
        linked: synced,
        running: { asOfDate: "2026-07-31", cents: 47_145 },
        inserted: [],
      }),
    ).toEqual({ cents: 47_145, asOfDay: "2026-07-31", source: "running-balance" });
  });

  it("adds newly imported posted amounts when the file has no running balance", () => {
    expect(
      importedPostedHeadline({
        linked: { balanceCents: -5_978, asOfDate: "2026-08-16" },
        running: null,
        inserted: [
          { transactionDate: "2026-08-17", postedDate: null, amountCents: -37_968 },
        ],
      }),
    ).toEqual({ cents: -43_946, asOfDay: "2026-08-17", source: "inserted-delta" });
  });

  it("dates the delta by the newest posting day it added, not by purchase day", () => {
    expect(
      importedPostedHeadline({
        linked: { balanceCents: -5_978, asOfDate: "2026-08-16" },
        running: null,
        inserted: [
          {
            transactionDate: "2026-08-17",
            postedDate: "2026-08-20",
            amountCents: -1_000,
          },
          {
            transactionDate: "2026-08-18",
            postedDate: "2026-08-19",
            amountCents: -2_000,
          },
        ],
      }),
    ).toEqual({ cents: -8_978, asOfDay: "2026-08-20", source: "inserted-delta" });
  });

  it("ignores rows the feed's own snapshot already covers", () => {
    expect(
      importedPostedHeadline({
        linked: synced,
        running: null,
        inserted: [
          { transactionDate: "2026-08-20", postedDate: null, amountCents: -500 },
        ],
      }),
    ).toBeNull();
  });

  it("cannot derive a delta for an account SimpleFIN has never synced", () => {
    // Without the feed's figure there is nothing to add the new rows to.
    expect(
      importedPostedHeadline({
        linked: { balanceCents: null, asOfDate: null },
        running: null,
        inserted: [
          { transactionDate: "2026-08-31", postedDate: null, amountCents: -500 },
        ],
      }),
    ).toBeNull();
  });

  it("still reports a running balance for an account with no bank link", () => {
    // Source rows are keyed on the account, so a file records what it saw with or without
    // a link; whether there is a headline to move is the writer's problem, not this rule's.
    expect(
      importedPostedHeadline({
        linked: null,
        running: { asOfDate: "2026-08-31", cents: 1_625_746 },
        inserted: [],
      }),
    ).toEqual({
      cents: 1_625_746,
      asOfDay: "2026-08-31",
      source: "running-balance",
    });
  });

  it("reports nothing when a file with no running balance adds nothing new", () => {
    expect(
      importedPostedHeadline({ linked: synced, running: null, inserted: [] }),
    ).toBeNull();
  });

  it("reports nothing when the new rows cancel out", () => {
    expect(
      importedPostedHeadline({
        linked: synced,
        running: null,
        inserted: [
          { transactionDate: "2026-08-31", postedDate: null, amountCents: 500 },
          { transactionDate: "2026-08-31", postedDate: null, amountCents: -500 },
        ],
      }),
    ).toBeNull();
  });
});
