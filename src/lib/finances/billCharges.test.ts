import { describe, expect, it } from "vitest";
import { billChargesOf, type BillChargeRow } from "./billCharges";

const BILLS = [
  { id: "internet", name: "Internet" },
  { id: "rent", name: "Rent" },
];

function row(overrides: Partial<BillChargeRow>): BillChargeRow {
  return {
    budgetCategoryId: "internet",
    transactionDate: "2026-09-01",
    amountCents: -5_000,
    derivedFlow: "spend",
    flowOverride: null,
    ...overrides,
  };
}

describe("billChargesOf", () => {
  it("keeps charges in the order given and groups them by bill id", () => {
    const { flat, byBill } = billChargesOf(
      [
        row({ transactionDate: "2026-08-01" }),
        row({
          budgetCategoryId: "rent",
          transactionDate: "2026-08-02",
          amountCents: -90_000,
        }),
        row({ transactionDate: "2026-09-01", amountCents: -5_100 }),
      ],
      BILLS,
    );
    expect(
      flat.map((charge) => [charge.billId, charge.name, charge.costCents]),
    ).toEqual([
      ["internet", "Internet", 5_000],
      ["rent", "Rent", 90_000],
      ["internet", "Internet", 5_100],
    ]);
    expect(byBill.get("internet")).toEqual([
      { dateKey: "2026-08-01", costCents: 5_000 },
      { dateKey: "2026-09-01", costCents: 5_100 },
    ]);
  });

  it("skips what is not a cost: a refund, a positive interest_fee, income by override", () => {
    const { flat } = billChargesOf(
      [
        // A refund arrives as money in; its cost is negative, so it is not a charge.
        row({ derivedFlow: "refund", amountCents: 2_000 }),
        // Interest earned shares the `interest_fee` kind and is not a cost.
        row({ derivedFlow: "interest_fee", amountCents: 150 }),
        // Decided only by override: the derived flow says spend.
        row({ derivedFlow: "spend", flowOverride: "income", amountCents: -700 }),
      ],
      BILLS,
    );
    expect(flat).toEqual([]);
  });

  it("counts a charge whose flow was never derived, as the full read always did", () => {
    const { flat } = billChargesOf(
      [row({ derivedFlow: null, flowOverride: null, amountCents: -1_234 })],
      BILLS,
    );
    expect(flat.map((charge) => charge.costCents)).toEqual([1_234]);
  });

  it("ignores rows filed to an envelope that is not one of the bills", () => {
    expect(billChargesOf([row({ budgetCategoryId: "groceries" })], BILLS).flat).toEqual(
      [],
    );
  });
});
