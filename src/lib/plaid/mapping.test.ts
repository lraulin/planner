import { describe, expect, it } from "vitest";
import {
  accountKindOf,
  accountNameOf,
  availableCentsOf,
  balanceCentsOf,
  linkCandidates,
  plaidAmountToCents,
  toParsedTransaction,
  type PlaidAccount,
  type PlaidTransaction,
} from "./mapping";

/**
 * Fixtures are real payloads captured from the Plaid Sandbox during the spike
 * (`agent-os/specs/2026-08-15-1315-live-bank-sync/plan.md`, Task 2a), trimmed to the fields
 * this module reads. Invented numbers would not have caught the credit-balance inversion.
 */

const checking: PlaidAccount = {
  account_id: "No1XwRq3A1s9yydDbqZGiGyV96z7baFEgNvxxg",
  name: "Plaid Checking",
  official_name: "Plaid Gold Standard 0% Interest Checking",
  type: "depository",
  subtype: "checking",
  mask: "0000",
  balances: { available: 100, current: 110, limit: null, iso_currency_code: "USD" },
};

/** Available is null on this one — the case that rules out an `available` fallback. */
const card: PlaidAccount = {
  account_id: "76AkQpPW8AIKDDJk4rmzcG73DvL9dAFRmVWjjn",
  name: "Plaid Credit Card",
  official_name: "Plaid Diamond 12.5% APR Interest Credit Card",
  type: "credit",
  subtype: "credit card",
  mask: "3333",
  balances: { available: null, current: 410, limit: 2000, iso_currency_code: "USD" },
};

/** Available IS present here, and means remaining credit — not money you have. */
const businessCard: PlaidAccount = {
  account_id: "oMVaX5bkxVhpggNq8WKyiyBg3J7bwXSgzwarrd",
  name: "Plaid Business Credit Card",
  type: "credit",
  subtype: "credit card",
  mask: "9999",
  balances: { available: 4980, current: 5020, limit: 10000 },
};

const purchase: PlaidTransaction = {
  transaction_id: "JMeXaEkK1eh7KKJoyGqjcJq7vqXbqDf75EX5o",
  account_id: checking.account_id,
  date: "2026-08-12",
  authorized_date: "2026-08-11",
  name: "Uber 063015 SF**POOL**",
  merchant_name: "Uber",
  amount: 5.4,
  pending: false,
  pending_transaction_id: null,
  personal_finance_category: { primary: "TRANSPORTATION" },
};

/** A negative Plaid amount — money arriving. */
const refund: PlaidTransaction = {
  transaction_id: "refund-1",
  account_id: checking.account_id,
  date: "2026-08-10",
  authorized_date: null,
  name: "United Airlines",
  amount: -500,
  pending: false,
  personal_finance_category: { primary: "TRAVEL" },
};

const cardPurchase: PlaidTransaction = {
  transaction_id: "card-1",
  account_id: card.account_id,
  date: "2026-08-10",
  authorized_date: null,
  name: "Touchstone Climbing",
  amount: 78.5,
  pending: false,
};

const pendingCharge: PlaidTransaction = {
  transaction_id: "na4vKEvn36hBj7rq5pvRHoQDaMxRQ4FmAGN4x",
  account_id: checking.account_id,
  date: "2026-08-14",
  authorized_date: "2026-08-14",
  name: "PENDING RESTAURANT CHARGE",
  amount: 63.75,
  pending: true,
  pending_transaction_id: null,
};

describe("plaidAmountToCents", () => {
  it("converts a decimal float exactly", () => {
    expect(plaidAmountToCents(5.4)).toBe(540);
    expect(plaidAmountToCents(78.5)).toBe(7850);
    expect(plaidAmountToCents(-500)).toBe(-50000);
  });

  it("does not lose a cent to float multiplication", () => {
    // 23631.9805 * 100 is 2363198.0499999998 in IEEE 754. Going via the decimal string
    // avoids the question entirely. This is a real Sandbox 401k balance.
    expect(plaidAmountToCents(23631.9805)).toBe(2363198);
    expect(plaidAmountToCents(0.1 + 0.2)).toBe(30);
  });

  it("returns null for a non-finite amount rather than NaN cents", () => {
    expect(plaidAmountToCents(Number.NaN)).toBeNull();
    expect(plaidAmountToCents(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("toParsedTransaction — sign", () => {
  it("negates a purchase: Plaid positive is money out, the register's positive is money in", () => {
    expect(toParsedTransaction(purchase)?.amountCents).toBe(-540);
  });

  it("negates a refund into a positive register amount", () => {
    expect(toParsedTransaction(refund)?.amountCents).toBe(50000);
  });

  it("negates a credit-card purchase the same way — the sign rule does not branch", () => {
    // The balance mapping branches on account type; this one must not. A card purchase
    // makes the account more negative, exactly as a checking debit does.
    expect(toParsedTransaction(cardPurchase)?.amountCents).toBe(-7850);
  });
});

describe("toParsedTransaction — dates and identity", () => {
  it("uses the authorized date as the transaction date and Plaid's date as posted", () => {
    const row = toParsedTransaction(purchase);
    expect(row?.transactionDate).toBe("2026-08-11");
    expect(row?.postedDate).toBe("2026-08-12");
  });

  it("falls back to Plaid's date when there is no authorized date", () => {
    const row = toParsedTransaction(refund);
    expect(row?.transactionDate).toBe("2026-08-10");
    expect(row?.postedDate).toBe("2026-08-10");
  });

  it("leaves postedDate null while pending", () => {
    const row = toParsedTransaction(pendingCharge);
    expect(row?.pending).toBe(true);
    expect(row?.postedDate).toBeNull();
    expect(row?.transactionDate).toBe("2026-08-14");
  });

  it("carries Plaid's transaction id as the external id", () => {
    // This is what lets the importer skip its own fingerprint for synced rows.
    expect(toParsedTransaction(purchase)?.externalId).toBe(purchase.transaction_id);
  });

  it("records the pending link when a posted row replaces a pending one", () => {
    const posted: PlaidTransaction = {
      ...purchase,
      transaction_id: "posted-2",
      pending_transaction_id: "pending-1",
    };
    expect(toParsedTransaction(posted)?.pendingTransactionId).toBe("pending-1");
    expect(toParsedTransaction(purchase)?.pendingTransactionId).toBeNull();
  });

  it("keeps Plaid's category as the bank label and leaves memo empty", () => {
    const row = toParsedTransaction(purchase);
    expect(row?.sourceCategory).toBe("TRANSPORTATION");
    expect(row?.memo).toBe("");
    expect(row?.balanceAfterCents).toBeNull();
  });

  it("returns null for an unparseable amount instead of throwing", () => {
    expect(toParsedTransaction({ ...purchase, amount: Number.NaN })).toBeNull();
  });
});

describe("balanceCentsOf", () => {
  it("keeps a depository balance positive", () => {
    expect(balanceCentsOf(checking)).toBe(11000);
  });

  it("negates a credit balance — Plaid's `current` is the amount owed", () => {
    // Without this branch a $410 card debt reads as a $410 asset.
    expect(balanceCentsOf(card)).toBe(-41000);
    expect(balanceCentsOf(businessCard)).toBe(-502000);
  });

  it("returns null when there is no current balance rather than reaching for available", () => {
    const noCurrent: PlaidAccount = {
      ...card,
      balances: { available: 4980, current: null, limit: 10000 },
    };
    // available here is remaining credit; substituting it would invent a positive asset.
    expect(balanceCentsOf(noCurrent)).toBeNull();
  });
});

describe("availableCentsOf", () => {
  it("returns the available balance for a depository account", () => {
    expect(availableCentsOf(checking)).toBe(10000);
  });

  it("is null for credit accounts even when Plaid supplies a number", () => {
    // 4980 is remaining credit, not money available to spend from an asset.
    expect(availableCentsOf(businessCard)).toBeNull();
    expect(availableCentsOf(card)).toBeNull();
  });
});

describe("accountKindOf", () => {
  it("maps the types seen in Sandbox", () => {
    expect(accountKindOf(checking)).toBe("checking");
    expect(accountKindOf(card)).toBe("credit_card");
    expect(accountKindOf({ ...checking, subtype: "savings" })).toBe("savings");
    expect(accountKindOf({ ...checking, subtype: "hsa" })).toBe("savings");
    expect(accountKindOf({ ...checking, subtype: "cash management" })).toBe("checking");
    expect(accountKindOf({ ...checking, type: "loan", subtype: "mortgage" })).toBe(
      "loan",
    );
    expect(accountKindOf({ ...checking, type: "investment", subtype: "ira" })).toBe(
      "investment",
    );
  });

  it("falls back to other for a type we have never seen", () => {
    // A new Plaid subtype must not abort a sync.
    expect(accountKindOf({ ...checking, type: "payroll", subtype: "wat" })).toBe(
      "other",
    );
  });
});

describe("linkCandidates", () => {
  const register = [
    { id: "acct-chase", externalKey: "0000", kind: "checking" },
    { id: "acct-card", externalKey: "3333", kind: "credit_card" },
    { id: "acct-other", externalKey: "9990000", kind: "savings" },
  ];

  it("matches on the mask against externalKey", () => {
    expect(linkCandidates(card, register)).toEqual(["acct-card"]);
  });

  it("prefers a same-kind match when two accounts end in the same four digits", () => {
    // "9990000" also ends in 0000; the checking account is the better guess.
    expect(linkCandidates(checking, register)).toEqual(["acct-chase", "acct-other"]);
  });

  it("proposes nothing when Plaid supplies no mask", () => {
    // A blank key would otherwise match every register account with a blank externalKey.
    expect(linkCandidates({ ...card, mask: null }, register)).toEqual([]);
    expect(linkCandidates({ ...card, mask: "  " }, register)).toEqual([]);
  });
});

describe("accountNameOf", () => {
  it("names an account by institution and mask", () => {
    expect(accountNameOf(card, "Capital One")).toBe(
      "Capital One Plaid Credit Card •••3333",
    );
  });

  it("omits the mask when there is none", () => {
    expect(accountNameOf({ ...card, mask: null }, "Chase")).toBe(
      "Chase Plaid Credit Card",
    );
  });
});
