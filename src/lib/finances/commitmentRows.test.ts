import { describe, expect, it } from "vitest";
import {
  activeBillTotals,
  amountRangeLabel,
  billHoldCaption,
  billRows,
  heldSetAsides,
  heldSpend,
  observedAmountRange,
  spendRows,
} from "./commitmentRows";
import type { BillCharge } from "./available";
import type { Payday } from "./classify/income";
import type { CommitmentCharge, StoredBillRow, StoredSpend } from "./commitments";

function payday(dateKey: string): Payday {
  return { dateKey, employer: "ACME", amountCents: 200_000, transactionIds: [] };
}

function bill(over: Partial<StoredBillRow> = {}): StoredBillRow {
  return {
    id: "bill-1",
    name: "1Password",
    matchers: ["1PASSWORDTORONTOON"],
    payees: [],
    status: "active",
    cancelledOn: null,
    url: "",
    category: "",
    cadenceMonths: 12,
    expectedCents: 7188,
    anchorDate: null,
    scheduled: true,
    dueDay: null,
    ...over,
  };
}

function spendEntry(over: Partial<StoredSpend> = {}): StoredSpend {
  return {
    id: "spend-1",
    name: "Pizza",
    matchers: ["PIZZA HUT", "DOMINOS"],
    payees: [],
    period: "week",
    amountSource: "pinned",
    expectedCents: 6000,
    active: true,
    category: "",
    ...over,
  };
}

const CHARGES: BillCharge[] = [{ name: "1Password", dateKey: "2026-03-30" }];
const PAYDAYS = [payday("2026-04-10"), payday("2026-04-24"), payday("2026-05-08")];

describe("billRows", () => {
  it("accrues a yearly bill over 26 paychecks, which is the whole envelope feature", () => {
    // $71.88 a year is $2.76 a paycheck. Three paydays since the last charge is $8.28, and it
    // reaches the full figure by the time the next charge lands. Nothing has to be topped up
    // by hand, which is the difference between this and a bucket you can raid.
    const [row] = billRows([bill()], CHARGES, PAYDAYS, "2026-05-10");

    expect(row.held).toMatchObject({
      perPaycheckCents: 276,
      heldCents: 828,
      expectedCents: 7188,
      periodStartKey: "2026-03-30",
      nextDueKey: "2027-03-30",
    });
    expect(row.annualCostCents).toBe(7188);
    expect(row.monthlyCents).toBe(Math.round(7188 / 12));
    expect(row.paycheckCents).toBe(Math.round(7188 / 26));
    expect(row.overdue).toBe(false);
  });

  it("puts a monthly bill's amount in Monthly, not its accrual slice", () => {
    // $2,100 a month is $2,100 a month. Dividing the cycle by two paychecks ($1,050)
    // is the set-aside arithmetic and must not leak into the comparable column — that is
    // what would make rent look half as expensive as it is next to a yearly bill.
    const [row] = billRows(
      [bill({ name: "Rent", cadenceMonths: 1, expectedCents: 210_000 })],
      [{ name: "Rent", dateKey: "2026-05-01" }],
      PAYDAYS,
      "2026-05-10",
    );
    expect(row.monthlyCents).toBe(210_000);
    expect(row.paycheckCents).toBe(Math.round((210_000 * 12) / 26));
    expect(row.held?.perPaycheckCents).toBe(105_000);
  });

  it("holds nothing for a paused, cancelled or dismissed bill, but keeps its cost on the books", () => {
    // Pause is the house-move case: still on the grid, not subtracted from available. If
    // this gate misses paused, propane keeps deducting after you said you might not pay it.
    for (const status of ["paused", "cancelled", "ignored"] as const) {
      const [row] = billRows([bill({ status })], CHARGES, PAYDAYS, "2026-05-10");

      expect(row.held).toBeNull();
      expect(row.annualCostCents).toBe(7188);
    }
  });

  it("does not count a paused bill in leftover-after-commitments", () => {
    const rows = billRows(
      [bill(), bill({ id: "bill-2", name: "Gas (Taylor)", status: "paused" })],
      CHARGES,
      PAYDAYS,
      "2026-05-10",
    );
    expect(heldSetAsides(rows).map((entry) => entry.name)).toEqual(["1Password"]);
    expect(activeBillTotals(rows).annualCents).toBe(7188);
  });

  it("holds nothing for a bill with no declared amount", () => {
    const [row] = billRows(
      [bill({ expectedCents: null })],
      CHARGES,
      PAYDAYS,
      "2026-05-10",
    );

    expect(row.held).toBeNull();
    expect(row.amountCents).toBe(0);
    expect(row.annualCostCents).toBe(0);
  });

  it("holds nothing before the browser has said what day it is", () => {
    const [row] = billRows([bill()], CHARGES, PAYDAYS, null);

    expect(row.held).toBeNull();
    expect(row.nextDueKey).toBeNull();
  });

  it("walks the next charge past a due date that has already gone by", () => {
    // The date column is the field the user corrects, so it looks forward. `held.nextDueKey`
    // stops at the missed date instead, which is what makes an unpaid bill visible.
    const [row] = billRows(
      [bill({ cadenceMonths: 1, expectedCents: 210_000, name: "Rent" })],
      [{ name: "Rent", dateKey: "2026-03-01" }],
      PAYDAYS,
      "2026-05-10",
    );

    expect(row.nextDueKey).toBe("2026-06-01");
    expect(row.held?.nextDueKey).toBe("2026-04-01");
    expect(row.overdue).toBe(true);
  });

  it("reports only the accruals in force", () => {
    const rows = billRows(
      [bill(), bill({ id: "bill-2", name: "Paramount+", status: "cancelled" })],
      CHARGES,
      PAYDAYS,
      "2026-05-10",
    );

    expect(heldSetAsides(rows).map((entry) => entry.name)).toEqual(["1Password"]);
    expect(activeBillTotals(rows).annualCents).toBe(7188);
  });
});

describe("spendRows", () => {
  const charges: Record<string, CommitmentCharge[]> = {
    Pizza: [{ dateKey: "2026-05-08", costCents: 4500 }],
  };

  it("holds the unspent remainder of the period's rate", () => {
    const [row] = spendRows([spendEntry()], charges, "2026-05-10", "2026-05-22");

    expect(row.held?.spentThisPeriodCents).toBe(4500);
    expect(row.rate.ratePerPeriodCents).toBe(6000);
    expect(row.monthlyCents).toBe(26_000);
    expect(row.paycheckCents).toBe(Math.round((26_000 * 12) / 26));
  });

  it("holds nothing for an inactive group", () => {
    const [row] = spendRows(
      [spendEntry({ active: false })],
      charges,
      "2026-05-10",
      "2026-05-22",
    );

    expect(row.held).toBeNull();
    // Still rated, so the grid can show what resuming it would cost.
    expect(row.rate.ratePerPeriodCents).toBe(6000);
    expect(heldSpend([row])).toEqual([]);
  });

  it("holds nothing before the browser has said what day it is", () => {
    const [row] = spendRows([spendEntry()], charges, null, null);

    expect(row.held).toBeNull();
  });
});

describe("observedAmountRange", () => {
  it("prints a range when fills swing more than 25%", () => {
    expect(observedAmountRange([15000, 37932, 53995, 33583])).toEqual({
      lowCents: 15000,
      highCents: 53995,
    });
    expect(amountRangeLabel({ lowCents: 15000, highCents: 53995 })).toBe("$150–$540");
  });

  it("stays quiet for a tight bill, or a single charge", () => {
    expect(observedAmountRange([10024, 10024, 10024])).toBeNull();
    expect(observedAmountRange([70004, 81204])).toBeNull();
    expect(observedAmountRange([33583])).toBeNull();
  });
});

describe("billHoldCaption", () => {
  const rentHeld = {
    name: "Rent",
    expectedCents: 210_000,
    perPaycheckCents: 105_000,
    heldCents: 210_000,
    fullyFunded: true,
    periodStartKey: "2026-07-31",
    nextDueKey: "2026-08-31",
  };

  it("names a due date only when the bill is scheduled", () => {
    expect(
      billHoldCaption(
        { scheduled: true, held: rentHeld, amountRange: null },
        "2026-08-21",
        (key) => key,
      ),
    ).toContain("due 2026-08-31");
    const unscheduled = billHoldCaption(
      { scheduled: false, held: rentHeld, amountRange: null },
      "2026-08-21",
      (key) => key,
    );
    expect(unscheduled).toMatch(/unscheduled/);
    expect(unscheduled).not.toMatch(/due /);
  });

  it("appends the observed range on a swingy unscheduled bill", () => {
    expect(
      billHoldCaption(
        {
          scheduled: false,
          held: rentHeld,
          amountRange: { lowCents: 15000, highCents: 53995 },
        },
        "2026-08-21",
        (key) => key,
      ),
    ).toContain("$150–$540");
  });
});
