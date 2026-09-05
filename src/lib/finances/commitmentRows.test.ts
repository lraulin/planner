import { describe, expect, it } from "vitest";
import {
  activeBillTotals,
  amountRangeLabel,
  billRows,
  observedAmountRange,
} from "./commitmentRows";
import type { BillCharge } from "./available";
import type { StoredBillRow } from "./commitments";

function bill(over: Partial<StoredBillRow> = {}): StoredBillRow {
  return {
    id: "bill-1",
    name: "1Password",
    payees: [],
    payeeIds: [],
    status: "active",
    cancelledOn: null,
    url: "",
    cadenceMonths: 12,
    expectedCents: 7188,
    anchorDate: null,
    scheduled: true,
    dueDay: null,
    leadDays: 0,
    ...over,
  };
}

const CHARGES: BillCharge[] = [{ name: "1Password", dateKey: "2026-03-30" }];

describe("billRows", () => {
  it("annualizes a yearly bill's amount into Monthly", () => {
    const [row] = billRows([bill()], CHARGES, "2026-08-16");
    expect(row.annualCostCents).toBe(7188);
    expect(row.monthlyCents).toBe(Math.round(7188 / 12));
    expect(row.nextDueKey).toBe("2027-03-30");
  });

  it("puts a monthly bill's amount in Monthly directly", () => {
    const [row] = billRows(
      [bill({ cadenceMonths: 1, expectedCents: 2_000 })],
      [],
      "2026-08-16",
    );
    expect(row.annualCostCents).toBe(24_000);
    expect(row.monthlyCents).toBe(2_000);
  });

  it("keeps a paused or cancelled bill's cost on the books but out of active totals", () => {
    const paused = billRows([bill({ status: "paused" })], CHARGES, "2026-08-16")[0];
    expect(paused.annualCostCents).toBe(7188);
    expect(activeBillTotals([paused]).annualCents).toBe(0);
  });

  it("gives no due date for a bill with no declared amount", () => {
    const [row] = billRows([bill({ expectedCents: null })], CHARGES, "2026-08-16");
    expect(row.annualCostCents).toBe(0);
    expect(row.monthlyCents).toBe(0);
  });

  it("gives no due date before the browser has said what day it is", () => {
    const [row] = billRows([bill()], CHARGES, null);
    expect(row.nextDueKey).toBeNull();
    expect(row.overdue).toBe(false);
  });

  it("marks overdue when a charge was expected and nothing has posted since", () => {
    // Anchored to 2026-07-01 with no charges on file: the expected charge (2026-08-01, one
    // cadence after the anchor) is in the past relative to today, so it reads as overdue —
    // while the editable Next charge column still walks forward to the next real date.
    const [row] = billRows(
      [bill({ cadenceMonths: 1, expectedCents: 1000, anchorDate: "2026-07-01" })],
      [],
      "2026-08-16",
    );
    expect(row.nextDueKey).toBe("2026-09-01");
    expect(row.overdue).toBe(true);
  });

  it("never marks an unscheduled bill overdue — a projected date would read as knowledge", () => {
    const [row] = billRows(
      [bill({ scheduled: false, expectedCents: 50_000 })],
      [],
      "2026-08-16",
    );
    expect(row.nextDueKey).toBeNull();
    expect(row.overdue).toBe(false);
  });
});

describe("observedAmountRange", () => {
  it("prints a range when fills swing more than 25%", () => {
    const range = observedAmountRange([33_600, 54_000]);
    expect(range).not.toBeNull();
    if (range) expect(amountRangeLabel(range)).toBe("$336–$540");
  });

  it("stays quiet for a tight bill, or a single charge", () => {
    expect(observedAmountRange([100, 116])).toBeNull();
    expect(observedAmountRange([100])).toBeNull();
    expect(observedAmountRange([])).toBeNull();
  });
});
