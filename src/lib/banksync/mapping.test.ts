import { describe, expect, it } from "vitest";
import {
  accountKindFromName,
  availableCentsOf,
  balanceAsOf,
  balanceCentsOf,
  epochToDateKey,
  institutionOf,
  isPending,
  linkCandidates,
  toParsedTransaction,
  trailingDigits,
  type SimpleFinAccount,
  type SimpleFinTransaction,
} from "./mapping";

/** 2026-08-12T00:00:00Z and 2026-08-11T00:00:00Z. */
const POSTED = 1786492800;
const TRANSACTED = 1786406400;

function txn(over: Partial<SimpleFinTransaction> = {}): SimpleFinTransaction {
  return {
    id: "t1",
    posted: POSTED,
    amount: "-4.33",
    description: "STARBUCKS",
    ...over,
  };
}

const checking: SimpleFinAccount = {
  id: "acct-checking",
  name: "360 Checking ...2322",
  balance: "1104.77",
  "available-balance": "1004.77",
  "balance-date": POSTED,
  org: { name: "Capital One" },
};

const card: SimpleFinAccount = {
  id: "acct-card",
  name: "Chase Prime Visa ...9910",
  // A card you owe on reports negative under SimpleFIN's own convention.
  balance: "-410.00",
  "balance-date": POSTED,
  org: { name: "Chase" },
};

describe("amounts — the sign convention", () => {
  it("stores a purchase negative, exactly as reported", () => {
    // SimpleFIN: positive is a deposit. The register: positive is money in. Same rule, so
    // the amount passes through. The previous provider signed the other way and this line
    // negated; restoring that negation would invert the entire register.
    expect(toParsedTransaction(txn({ amount: "-4.33" }))?.amountCents).toBe(-433);
  });

  it("stores a deposit positive, exactly as reported", () => {
    expect(toParsedTransaction(txn({ amount: "500.00" }))?.amountCents).toBe(50000);
  });

  it("does not branch on account kind — a card purchase is negative like any other", () => {
    expect(toParsedTransaction(txn({ amount: "-78.50" }))?.amountCents).toBe(-7850);
  });

  it("reads exact cents from the decimal string", () => {
    // Strings, not floats, so there is no rounding question to get wrong.
    expect(toParsedTransaction(txn({ amount: "23631.98" }))?.amountCents).toBe(2363198);
    expect(toParsedTransaction(txn({ amount: "-0.01" }))?.amountCents).toBe(-1);
  });

  it("returns null for an unparseable amount instead of throwing", () => {
    expect(toParsedTransaction(txn({ amount: "not money" }))).toBeNull();
  });
});

describe("pending", () => {
  it("treats posted: 0 as pending, which is the protocol's required marker", () => {
    expect(isPending(txn({ posted: 0 }))).toBe(true);
  });

  it("treats an explicit pending flag as pending even with a posted timestamp", () => {
    expect(isPending(txn({ pending: true }))).toBe(true);
  });

  it("treats a posted row with no flag as posted", () => {
    expect(isPending(txn())).toBe(false);
  });

  it("leaves postedDate null while pending", () => {
    const row = toParsedTransaction(txn({ posted: 0, transacted_at: TRANSACTED }));
    expect(row?.pending).toBe(true);
    expect(row?.postedDate).toBeNull();
    expect(row?.transactionDate).toBe("2026-08-11");
  });

  it("sets postedDate once posted", () => {
    const row = toParsedTransaction(txn({ posted: POSTED, transacted_at: TRANSACTED }));
    expect(row?.pending).toBe(false);
    expect(row?.postedDate).toBe("2026-08-12");
    // The register sorts on when the money was spent, not when it landed.
    expect(row?.transactionDate).toBe("2026-08-11");
  });
});

describe("dates and identity", () => {
  it("falls back to the posted day when there is no transacted_at", () => {
    const row = toParsedTransaction(txn({ transacted_at: null }));
    expect(row?.transactionDate).toBe("2026-08-12");
  });

  it("drops a row that carries no usable date at all", () => {
    // Pending with no transacted_at cannot be placed in the register.
    expect(toParsedTransaction(txn({ posted: 0, transacted_at: null }))).toBeNull();
  });

  it("carries the provider's id as the external id", () => {
    // This is what lets the importer skip its own fingerprint for synced rows.
    expect(toParsedTransaction(txn({ id: "sfin-99" }))?.externalId).toBe("sfin-99");
  });

  it("leaves sourceCategory and memo empty — the provider supplies neither", () => {
    const row = toParsedTransaction(txn());
    expect(row?.sourceCategory).toBe("");
    expect(row?.memo).toBe("");
    expect(row?.balanceAfterCents).toBeNull();
  });

  it("converts epoch seconds, and treats 0 as absent", () => {
    expect(epochToDateKey(POSTED)).toBe("2026-08-12");
    expect(epochToDateKey(0)).toBeNull();
    expect(epochToDateKey(null)).toBeNull();
  });
});

describe("balances", () => {
  it("passes a depository balance through", () => {
    expect(balanceCentsOf(checking)).toBe(110477);
  });

  it("leaves a card balance negative without a branch", () => {
    // The previous provider reported a card's balance as the positive amount owed and
    // needed negating. Adding that branch back here would flip every card into an asset.
    expect(balanceCentsOf(card)).toBe(-41000);
  });

  it("reads available-balance where supplied and null where not", () => {
    expect(availableCentsOf(checking)).toBe(100477);
    expect(availableCentsOf(card)).toBeNull();
    expect(availableCentsOf({ ...checking, "available-balance": "" })).toBeNull();
  });

  it("stamps the balance with the provider's own date, not the read time", () => {
    const requestedAt = new Date("2026-08-16T09:00:00Z");
    // A day-old figure labelled "now" is the lie this feature exists to stop telling.
    expect(balanceAsOf(checking, requestedAt).toISOString()).toBe(
      "2026-08-12T00:00:00.000Z",
    );
  });

  it("falls back to the read time when the provider gives no balance date", () => {
    const requestedAt = new Date("2026-08-16T09:00:00Z");
    expect(
      balanceAsOf({ ...checking, "balance-date": null }, requestedAt).toISOString(),
    ).toBe(requestedAt.toISOString());
  });
});

describe("account naming", () => {
  it("infers a kind from the account name", () => {
    expect(accountKindFromName("Chase Prime Visa ...9910")).toBe("credit_card");
    expect(accountKindFromName("360 Checking ...2322")).toBe("checking");
    expect(accountKindFromName("360 Performance Savings")).toBe("savings");
    expect(accountKindFromName("PenFed Mortgage")).toBe("loan");
  });

  it("falls back to other rather than guessing checking", () => {
    // A wrong kind is quieter than a missing one: it changes how the account groups in
    // every report without ever looking wrong.
    expect(accountKindFromName("Acme Thing 12")).toBe("other");
  });

  it("reads the institution where the provider names one", () => {
    expect(institutionOf(card)).toBe("Chase");
    expect(institutionOf({ ...card, org: null })).toBe("");
  });
});

describe("linkCandidates", () => {
  const register = [
    { id: "acct-chase", externalKey: "9910", kind: "credit_card" },
    { id: "acct-360", externalKey: "2322", kind: "checking" },
    { id: "acct-old", externalKey: "9992322", kind: "savings" },
  ];

  it("matches on trailing digits in the account name", () => {
    expect(trailingDigits("Chase Prime Visa ...9910")).toBe("9910");
    expect(linkCandidates(card, register)).toEqual(["acct-chase"]);
  });

  it("prefers a same-kind match when two accounts end in the same digits", () => {
    expect(linkCandidates(checking, register)).toEqual(["acct-360", "acct-old"]);
  });

  it("proposes nothing when the name carries no digits", () => {
    // A blank key would otherwise match every register account with a blank externalKey.
    expect(trailingDigits("Savings")).toBeNull();
    expect(linkCandidates({ ...card, name: "Savings" }, register)).toEqual([]);
  });
});
