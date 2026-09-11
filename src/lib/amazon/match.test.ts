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
    // AMZN mid-descriptor, as Prime Video and Kindle bill.
    expect(isAmazonMerchant("KINDLE SVCS AMZN.COM/BILL")).toBe(true);
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

describe("exactMatchCharge — what it must never pair", () => {
  it("does not match a charge or a bank row that is already matched", () => {
    expect(
      exactMatchCharge(charge, [account], [txn], {
        chargeIds: new Set(["pay-1"]),
        transactionIds: new Set(),
      }).kind,
    ).toBe("review");
    expect(
      exactMatchCharge(charge, [account], [txn], {
        chargeIds: new Set(),
        transactionIds: new Set(["txn-1"]),
      }).kind,
    ).toBe("review");
  });

  it("will not guess between two open accounts ending in the same four digits", () => {
    const twin = { id: "acc-2", externalKey: "993448", closedAt: null };
    expect(exactMatchCharge(charge, [account, twin], [txn], settled).kind).toBe(
      "review",
    );
  });

  it("ignores a closed account that shares the card's suffix", () => {
    // A replaced card keeps its last four; the old account must not steal the match.
    const replaced = { id: "old", externalKey: "003448", closedAt: "2025-01-01" };
    expect(exactMatchCharge(charge, [replaced, account], [txn], settled)).toMatchObject(
      {
        kind: "auto",
        accountId: "acc",
      },
    );
  });

  it("reads the card suffix from the digits of a key that carries other text", () => {
    const labelled = { ...account, externalKey: "3448-cc" };
    expect(exactMatchCharge(charge, [labelled], [txn], settled).kind).toBe("auto");
  });

  it("does not pair an Amazon charge with a same-day, same-amount row from another merchant", () => {
    expect(
      exactMatchCharge(
        charge,
        [account],
        [{ ...txn, description: "SHEETZ 123" }],
        settled,
      ).kind,
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
