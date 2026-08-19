import { describe, expect, it } from "vitest";
import {
  balancesAt,
  periodResults,
  periodScorecard,
  positionAt,
  type PeriodAccount,
  type PeriodLedgerRow,
} from "./periodResult";
import type { PayPeriod } from "./classify/payPeriods";

const CHECKING: PeriodAccount = { id: "chk", kind: "checking", balanceCents: 100_00 };
const SAVINGS: PeriodAccount = { id: "sav", kind: "savings", balanceCents: 500_00 };
const CARD: PeriodAccount = { id: "card", kind: "credit_card", balanceCents: -200_00 };
const ACCOUNTS = [CHECKING, SAVINGS, CARD];

function row(over: Partial<PeriodLedgerRow> & { accountId: string }): PeriodLedgerRow {
  return {
    transactionDate: "2026-03-10",
    description: "row",
    amountCents: 0,
    transferGroupId: null,
    plannedWithdrawal: false,
    eventLabel: "",
    ...over,
  };
}

function period(startKey: string, endKey: string, withPayday = true): PayPeriod {
  return {
    startKey,
    endKey,
    paydays: withPayday
      ? [
          {
            dateKey: startKey,
            employer: "Employer",
            amountCents: 2_000_00,
            transactionIds: [],
          },
        ]
      : [],
  };
}

describe("balancesAt", () => {
  it("undoes only the rows posted after the date", () => {
    const rows = [
      row({ accountId: "chk", transactionDate: "2026-03-20", amountCents: -30_00 }),
      row({ accountId: "chk", transactionDate: "2026-03-05", amountCents: -70_00 }),
    ];
    // Today's balance is 100. The later −30 is undone; the earlier −70 is already inside it.
    expect(balancesAt(ACCOUNTS, rows, "2026-03-10").get("chk")).toBe(130_00);
  });

  it("treats a row dated exactly on the boundary as already counted", () => {
    const rows = [
      row({ accountId: "chk", transactionDate: "2026-03-10", amountCents: -40_00 }),
    ];
    expect(balancesAt(ACCOUNTS, rows, "2026-03-10").get("chk")).toBe(100_00);
  });

  it("ignores rows for accounts it was not given", () => {
    const rows = [
      row({ accountId: "ghost", transactionDate: "2026-03-20", amountCents: -50_00 }),
    ];
    expect(balancesAt(ACCOUNTS, rows, "2026-03-10").get("chk")).toBe(100_00);
  });
});

describe("positionAt", () => {
  it("adds the card balance rather than subtracting it, since debt is already negative", () => {
    // A unary minus here would report 300 instead of −100 — the exact bug the module
    // header warns about, and it flatters in the dangerous direction.
    expect(positionAt(ACCOUNTS, [], "2026-03-10")).toBe(-100_00);
  });

  it("leaves savings out of the figure entirely", () => {
    const withoutSavings = [CHECKING, CARD];
    expect(positionAt(ACCOUNTS, [], "2026-03-10")).toBe(
      positionAt(withoutSavings, [], "2026-03-10"),
    );
  });
});

describe("periodResults", () => {
  const periods = [period("2026-03-01", "2026-03-14")];

  it("scores a period that closed positive on its own as self-funded", () => {
    const accounts = [CHECKING, SAVINGS, { ...CARD, balanceCents: -20_00 }];
    const results = periodResults(accounts, [], periods, "2026-04-01");
    expect(results).toHaveLength(1);
    expect(results[0].resultCents).toBe(80_00);
    expect(results[0].selfFundedCents).toBe(80_00);
    expect(results[0].selfFunded).toBe(true);
  });

  it("does not credit a period that only closed positive on reserve money", () => {
    const accounts = [
      { ...CHECKING, balanceCents: 200_00 },
      SAVINGS,
      { ...CARD, balanceCents: 0 },
    ];
    const rows = [
      row({
        accountId: "sav",
        transactionDate: "2026-03-08",
        amountCents: -500_00,
        description: "Withdrawal to 360 Checking",
        transferGroupId: "t1",
      }),
      row({
        accountId: "chk",
        transactionDate: "2026-03-08",
        amountCents: 500_00,
        transferGroupId: "t1",
      }),
    ];
    const [result] = periodResults(accounts, rows, periods, "2026-04-01");
    expect(result.resultCents).toBe(200_00);
    expect(result.unplannedSavingsCents).toBe(500_00);
    // +200 on paper is −300 once the reserve money is taken back out.
    expect(result.selfFundedCents).toBe(-300_00);
    expect(result.selfFunded).toBe(false);
    expect(result.draws[0].description).toBe("Withdrawal to 360 Checking");
  });

  it("still credits a period that drew on savings but did not need it", () => {
    const accounts = [
      { ...CHECKING, balanceCents: 600_00 },
      SAVINGS,
      { ...CARD, balanceCents: 0 },
    ];
    const rows = [
      row({ accountId: "sav", transactionDate: "2026-03-08", amountCents: -500_00 }),
    ];
    const [result] = periodResults(accounts, rows, periods, "2026-04-01");
    expect(result.selfFundedCents).toBe(100_00);
    expect(result.selfFunded).toBe(true);
  });

  it("exempts a withdrawal declared planned", () => {
    const accounts = [
      { ...CHECKING, balanceCents: 200_00 },
      SAVINGS,
      { ...CARD, balanceCents: 0 },
    ];
    const rows = [
      row({
        accountId: "sav",
        transactionDate: "2026-03-08",
        amountCents: -500_00,
        plannedWithdrawal: true,
        eventLabel: "Handgun",
      }),
    ];
    const [result] = periodResults(accounts, rows, periods, "2026-04-01");
    expect(result.plannedSavingsCents).toBe(500_00);
    expect(result.unplannedSavingsCents).toBe(0);
    expect(result.selfFunded).toBe(true);
    expect(result.draws).toHaveLength(0);
  });

  it("ignores a reserve withdrawal that left the household", () => {
    const accounts = [
      { ...CHECKING, balanceCents: 200_00 },
      SAVINGS,
      { ...CARD, balanceCents: 0 },
      { id: "brk", kind: "investment", balanceCents: 0 } satisfies PeriodAccount,
    ];
    const rows = [
      row({
        accountId: "sav",
        transactionDate: "2026-03-08",
        amountCents: -500_00,
        transferGroupId: "t9",
      }),
      row({
        accountId: "brk",
        transactionDate: "2026-03-08",
        amountCents: 500_00,
        transferGroupId: "t9",
      }),
    ];
    const [result] = periodResults(accounts, rows, periods, "2026-04-01");
    expect(result.unplannedSavingsCents).toBe(0);
    expect(result.selfFunded).toBe(true);
  });

  it("counts a withdrawal the classifier never paired", () => {
    const accounts = [
      { ...CHECKING, balanceCents: 200_00 },
      SAVINGS,
      { ...CARD, balanceCents: 0 },
    ];
    const rows = [
      row({ accountId: "sav", transactionDate: "2026-03-08", amountCents: -500_00 }),
    ];
    const [result] = periodResults(accounts, rows, periods, "2026-04-01");
    expect(result.unplannedSavingsCents).toBe(500_00);
  });

  it("counts a savings draw that paid a card, not only one that reached checking", () => {
    const accounts = [
      { ...CHECKING, balanceCents: 200_00 },
      SAVINGS,
      { ...CARD, balanceCents: 0 },
    ];
    const rows = [
      row({
        accountId: "sav",
        transactionDate: "2026-03-08",
        amountCents: -500_00,
        transferGroupId: "t2",
      }),
      row({
        accountId: "card",
        transactionDate: "2026-03-08",
        amountCents: 500_00,
        transferGroupId: "t2",
      }),
    ];
    const [result] = periodResults(accounts, rows, periods, "2026-04-01");
    expect(result.unplannedSavingsCents).toBe(500_00);
  });

  it("ignores savings draws outside the period", () => {
    const accounts = [{ ...CHECKING, balanceCents: 200_00 }, SAVINGS];
    const rows = [
      row({ accountId: "sav", transactionDate: "2026-02-20", amountCents: -500_00 }),
      row({ accountId: "sav", transactionDate: "2026-03-15", amountCents: -500_00 }),
    ];
    const [result] = periodResults(accounts, rows, periods, "2026-04-01");
    expect(result.unplannedSavingsCents).toBe(0);
  });

  it("never scores the period in progress", () => {
    const results = periodResults(
      ACCOUNTS,
      [],
      [period("2026-03-01", "2026-03-14"), period("2026-03-15", "2026-03-28")],
      "2026-03-20",
    );
    expect(results.map((result) => result.endKey)).toEqual(["2026-03-14"]);
  });

  it("skips a window that never saw a payday", () => {
    const results = periodResults(
      ACCOUNTS,
      [],
      [period("2026-03-01", "2026-03-14", false)],
      "2026-04-01",
    );
    expect(results).toEqual([]);
  });

  it("returns closed periods oldest first", () => {
    const results = periodResults(
      ACCOUNTS,
      [],
      [period("2026-03-15", "2026-03-28"), period("2026-03-01", "2026-03-14")],
      "2026-04-01",
    );
    expect(results.map((result) => result.startKey)).toEqual([
      "2026-03-01",
      "2026-03-15",
    ]);
  });
});

describe("periodScorecard", () => {
  const results = periodResults(
    [{ ...CHECKING, balanceCents: 50_00 }],
    [],
    [
      period("2026-01-01", "2026-01-14"),
      period("2026-01-15", "2026-01-28"),
      period("2026-02-01", "2026-02-14"),
    ],
    "2026-04-01",
  );

  it("takes the most recent window and names the latest closed period", () => {
    const card = periodScorecard(results, 2);
    expect(card.history).toHaveLength(2);
    expect(card.latest?.endKey).toBe("2026-02-14");
    expect(card.selfFundedCount).toBe(2);
  });

  it("reports no latest period rather than a zero one when nothing has closed", () => {
    const card = periodScorecard([], 6);
    expect(card.latest).toBeNull();
    expect(card.history).toEqual([]);
    expect(card.selfFundedCount).toBe(0);
  });
});
