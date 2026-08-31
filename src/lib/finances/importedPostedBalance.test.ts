import { describe, expect, it } from "vitest";
import {
  importedPostedHeadline,
  insertedCentsOnOrAfter,
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

describe("insertedCentsOnOrAfter", () => {
  it("counts a Chase purchase by posting day, not purchase day", () => {
    expect(
      insertedCentsOnOrAfter(
        [
          {
            transactionDate: "2026-08-28",
            postedDate: "2026-08-31",
            amountCents: -1_059,
          },
          {
            transactionDate: "2026-08-20",
            postedDate: "2026-08-21",
            amountCents: -500,
          },
        ],
        "2026-08-30",
      ),
    ).toBe(-1_059);
  });
});

describe("importedPostedHeadline", () => {
  const synced = { balanceCents: 1_125_746, asOfDate: "2026-08-25" };

  it("writes the file's running balance when it is as new as the live snapshot", () => {
    expect(
      importedPostedHeadline({
        linked: synced,
        running: { asOfDate: "2026-08-31", cents: 1_625_746 },
        insertedCentsOnOrAfterAsOf: 500_000,
      }),
    ).toEqual({ cents: 1_625_746, source: "running-balance" });
  });

  it("still writes the running balance when every row was already in the register", () => {
    expect(
      importedPostedHeadline({
        linked: synced,
        running: { asOfDate: "2026-08-31", cents: 1_625_746 },
        insertedCentsOnOrAfterAsOf: 0,
      }),
    ).toEqual({ cents: 1_625_746, source: "running-balance" });
  });

  it("does not rewind the live snapshot from an older statement running balance", () => {
    expect(
      importedPostedHeadline({
        linked: synced,
        running: { asOfDate: "2026-07-31", cents: 47_145 },
        insertedCentsOnOrAfterAsOf: 0,
      }),
    ).toBeNull();
  });

  it("adds newly imported posted amounts when the file has no running balance", () => {
    expect(
      importedPostedHeadline({
        linked: { balanceCents: -5_978, asOfDate: "2026-08-16" },
        running: null,
        insertedCentsOnOrAfterAsOf: -37_968,
      }),
    ).toEqual({ cents: -43_946, source: "inserted-delta" });
  });

  it("does not invent a headline for an account SimpleFIN has never synced", () => {
    expect(
      importedPostedHeadline({
        linked: { balanceCents: null, asOfDate: null },
        running: { asOfDate: "2026-08-31", cents: 1_625_746 },
        insertedCentsOnOrAfterAsOf: 500_000,
      }),
    ).toBeNull();
  });

  it("leaves an unlinked account on its statement or ledger headline", () => {
    expect(
      importedPostedHeadline({
        linked: null,
        running: { asOfDate: "2026-08-31", cents: 1_625_746 },
        insertedCentsOnOrAfterAsOf: 500_000,
      }),
    ).toBeNull();
  });

  it("does not write when the file already agrees with SimpleFIN", () => {
    expect(
      importedPostedHeadline({
        linked: synced,
        running: { asOfDate: "2026-08-31", cents: 1_125_746 },
        insertedCentsOnOrAfterAsOf: 500_000,
      }),
    ).toBeNull();
  });
});
