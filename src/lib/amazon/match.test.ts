import { describe, expect, it } from "vitest";
import { canManuallyMatch, exactMatchCharge, isAmazonMerchant } from "./match";

const account = { id: "acc", externalKey: "3448", closedAt: null };
const txn = {
  id: "txn-1",
  accountId: "acc",
  transactionDate: "2026-08-01",
  amountCents: -2114,
  pending: false,
  isParent: false,
  description: "AMAZON MKTPL*5H1YV8C82",
  budgetCategoryId: "shop",
};

const charge = {
  paymentId: "pay-1",
  date: "2026-08-01",
  amountCents: -2114,
  status: "completed",
  cardLast4: "3448",
  instrumentKind: "card",
};

const settled = { chargeIds: new Set<string>(), transactionIds: new Set<string>() };

describe("isAmazonMerchant", () => {
  it("recognises the marketplace stamp and AMZN", () => {
    expect(isAmazonMerchant("AMAZON MKTPL*5H1YV8C82")).toBe(true);
    expect(isAmazonMerchant("AMZN MKTP US*T04OM6PZ3")).toBe(true);
    expect(isAmazonMerchant("WALMART")).toBe(false);
  });
});

describe("exactMatchCharge", () => {
  it("matches a unique posted card charge", () => {
    expect(exactMatchCharge(charge, [account], [txn], settled)).toEqual({
      kind: "auto",
      transactionId: "txn-1",
      accountId: "acc",
    });
  });

  it("refuses pending, rewards, splits, date drift and duplicate candidates", () => {
    expect(
      exactMatchCharge({ ...charge, status: "pending" }, [account], [txn], settled)
        .kind,
    ).toBe("review");
    expect(
      exactMatchCharge(
        { ...charge, instrumentKind: "rewards" },
        [account],
        [txn],
        settled,
      ).kind,
    ).toBe("review");
    expect(
      exactMatchCharge(charge, [account], [{ ...txn, pending: true }], settled).kind,
    ).toBe("review");
    expect(
      exactMatchCharge(charge, [account], [{ ...txn, isParent: true }], settled).kind,
    ).toBe("review");
    expect(
      exactMatchCharge(
        charge,
        [account],
        [{ ...txn, transactionDate: "2026-08-02" }],
        settled,
      ).kind,
    ).toBe("review");
    expect(
      exactMatchCharge(charge, [account], [txn, { ...txn, id: "txn-2" }], settled).kind,
    ).toBe("review");
  });
});

describe("canManuallyMatch", () => {
  it("allows an equal-amount Amazon row with the mismatch flagged", () => {
    const result = canManuallyMatch(charge, { ...txn, transactionDate: "2026-08-03" });
    expect(result).toEqual({ ok: true, dateMismatch: true, cardMismatch: false });
  });

  it("refuses unequal totals", () => {
    const result = canManuallyMatch(charge, { ...txn, amountCents: -2000 });
    expect(result.ok).toBe(false);
  });
});
