import { describe, expect, it } from "vitest";
import type { StoredBillRow } from "./commitments";
import {
  claimedPayeeMap,
  claimedPayeesOf,
  trackAsBillDraft,
  trackAsBillRefusal,
} from "./registerBillDraft";
import type { TransactionListRow } from "./types";

const PAYEE_A = "11111111-1111-4111-8111-111111111111";

function row(
  id: string,
  date: string,
  extras: Partial<TransactionListRow> = {},
): TransactionListRow {
  return {
    id,
    accountId: "acct",
    accountName: "Checking",
    accountKind: "checking",
    transactionDate: date,
    postedDate: null,
    pending: extras.pending ?? false,
    description: extras.description ?? id,
    amountCents: extras.amountCents ?? -10000,
    sourceCategory: "",
    externalSource: null,
    derivedCategory: null,
    derivedFlow: extras.derivedFlow ?? "spend",
    flowOverride: extras.flowOverride ?? null,

    notes: "",
    balanceAfterCents: null,
    budgetCategoryId: null,
    budgetCategoryName: null,
    payeeId: "payeeId" in extras ? (extras.payeeId ?? null) : PAYEE_A,
    payeeName: "payeeName" in extras ? (extras.payeeName ?? null) : "Geico",
    parentId: null,
    splitChildCount: 0,
    splitImbalanceCents: 0,
  };
}

function bill(over: Partial<StoredBillRow> = {}): StoredBillRow {
  return {
    id: "bill-1",
    name: "Geico",
    payees: [{ id: PAYEE_A, name: "Geico" }],
    payeeIds: [PAYEE_A],
    status: "active",
    cancelledOn: null,
    url: "",
    cadenceMonths: 6,
    expectedCents: 59498,
    anchorDate: null,
    scheduled: true,
    dueDay: null,
    leadDays: 0,
    ...over,
  };
}

const EMPTY = new Map();

describe("trackAsBillRefusal", () => {
  it("asks for a transaction when the row is missing", () => {
    // Group headers and blank-area clicks land here. The catalog's "Select a row first"
    // covers a null selection; this is the unknown-id case.
    expect(trackAsBillRefusal(undefined, EMPTY)).toBe("Select a transaction");
  });

  it("names the flow when the row is not spend", () => {
    expect(
      trackAsBillRefusal(
        row("pay", "2026-08-01", {
          derivedFlow: "income",
          amountCents: 200_000,
        }),
        EMPTY,
      ),
    ).toBe("Income cannot be a bill");
    expect(
      trackAsBillRefusal(
        row("xfer", "2026-08-01", { derivedFlow: "internal_transfer" }),
        EMPTY,
      ),
    ).toBe("Transfer (own accounts) cannot be a bill");
    expect(
      trackAsBillRefusal(
        row("out", "2026-08-01", { derivedFlow: "external_transfer" }),
        EMPTY,
      ),
    ).toBe("Transfer (outside) cannot be a bill");
    expect(
      trackAsBillRefusal(
        row("back", "2026-08-01", {
          derivedFlow: "refund",
          amountCents: 1200,
        }),
        EMPTY,
      ),
    ).toBe("Refund cannot be a bill");
    expect(
      trackAsBillRefusal(
        row("fee", "2026-08-01", { derivedFlow: "interest_fee" }),
        EMPTY,
      ),
    ).toBe("Interest & fees cannot be a bill");
  });

  it("allows pending spend — the merchant is already known", () => {
    expect(
      trackAsBillRefusal(
        row("p", "2026-08-21", { description: "GEICO", pending: true }),
        EMPTY,
      ),
    ).toBeNull();
  });

  it("allows spend with no payee when the merchant is present", () => {
    expect(
      trackAsBillRefusal(
        row("p", "2026-08-21", { description: "GEICO", payeeId: null }),
        EMPTY,
      ),
    ).toBeNull();
  });

  it("refuses a row whose description has no merchant", () => {
    expect(
      trackAsBillRefusal(
        row("p", "2026-08-21", { description: "", payeeId: null }),
        EMPTY,
      ),
    ).toBe("This row has no merchant to match");
  });

  it("names the bill that already claims this merchant", () => {
    const claimed = claimedPayeeMap(claimedPayeesOf([bill()]));
    expect(
      trackAsBillRefusal(row("g", "2026-03-04", { description: "GEICO" }), claimed),
    ).toBe("Already tracked as Geico");
  });

  it("still refuses a paused bill while its payee claim remains", () => {
    const claimed = claimedPayeeMap(claimedPayeesOf([bill({ status: "paused" })]));
    expect(
      trackAsBillRefusal(row("g", "2026-03-04", { description: "GEICO" }), claimed),
    ).toBe("Already tracked as Geico");
  });
});

describe("trackAsBillDraft", () => {
  it("opens a single charge monthly at this amount", () => {
    // The Taylor Gas case Review still misses: one delivery, you know it is a bill.
    const draft = trackAsBillDraft(
      [row("g", "2025-10-24", { description: "GEICO", amountCents: -59_498 })],
      "g",
      "2026-08-21",
    );
    expect(draft).toMatchObject({
      merchant: "Geico",
      name: "Geico",
      cadence: { unit: "month", n: 1 },
      expectedCents: 59_498,
      matchAmountCents: 59_498,
      lastChargeOn: "2025-10-24",
      chargeCount: 1,
      merchantChargeCount: 1,
    });
    // Last charged Oct 24; monthly walks to the first date still ahead of today.
    expect(draft.nextDueKey).toBe("2026-08-24");
  });

  it("groups same-merchant spend when the row has no payee yet", () => {
    const rows = [
      row("a", "2025-03-04", {
        description: "CVSExtraCare 8007467287RI",
        amountCents: -500,
        payeeId: null,
        parentId: null,
        splitChildCount: 0,
        splitImbalanceCents: 0,
        payeeName: null,
      }),
      row("b", "2025-04-04", {
        description: "CVSExtraCare 8007467287RI",
        amountCents: -500,
        payeeId: null,
        payeeName: null,
      }),
    ];
    const draft = trackAsBillDraft(rows, "b", "2026-08-21");
    expect(draft.payeeId).toBeNull();
    expect(draft.chargeCount).toBe(2);
    expect(draft.expectedCents).toBe(500);
  });

  it("detects a semi-annual Geico from two charges six months apart", () => {
    const rows = [
      row("a", "2025-03-04", { description: "GEICO", amountCents: -59_498 }),
      row("b", "2025-09-04", { description: "GEICO", amountCents: -59_498 }),
    ];
    const draft = trackAsBillDraft(rows, "b", "2026-08-21");
    expect(draft.cadence).toEqual({ unit: "month", n: 6 });
    expect(draft.expectedCents).toBe(59_498);
    expect(draft.chargeCount).toBe(2);
    expect(draft.nextDueKey).toBe("2026-09-04");
  });

  it("calls Vetsource a 28-day cycle from its real dates", () => {
    // Same eleven dates `detectCadence` is pinned on. The rule folds the description to
    // VetSource; the cadence still has to be days, not monthly.
    const dates = [
      "2025-10-30",
      "2025-11-29",
      "2025-12-27",
      "2026-01-24",
      "2026-02-24",
      "2026-03-26",
      "2026-04-23",
      "2026-05-21",
      "2026-06-18",
      "2026-07-16",
      "2026-08-14",
    ];
    const rows = dates.map((date, index) =>
      row(`v${index}`, date, {
        description: "VETSOURCE",
        payeeName: "VetSource",
        amountCents: -2979,
      }),
    );
    const draft = trackAsBillDraft(rows, "v10", "2026-08-21");
    expect(draft.cadence).toEqual({ unit: "day", n: 28 });
    expect(draft.name).toBe("VetSource");
    expect(draft.nextDueKey).toBe("2026-09-11");
  });

  it("uses the cleaned merchant name, not the bank's string", () => {
    const draft = trackAsBillDraft(
      [
        row("p", "2026-08-01", {
          description: "PIZZA HUT #4471",
          payeeName: "Pizza Hut",
        }),
      ],
      "p",
      "2026-08-21",
    );
    expect(draft.merchant).toBe("Pizza Hut");
    expect(draft.name).toBe("Pizza Hut");
  });

  it("takes the median of this merchant's spend, ignoring a refund", () => {
    const rows = [
      row("a", "2026-01-01", {
        description: "NETFLIX.COM",
        payeeName: "Netflix",
        amountCents: -1599,
      }),
      row("b", "2026-02-01", {
        description: "NETFLIX.COM",
        payeeName: "Netflix",
        amountCents: -1599,
      }),
      row("c", "2026-03-01", {
        description: "NETFLIX.COM",
        payeeName: "Netflix",
        amountCents: 1599,
        derivedFlow: "refund",
      }),
    ];
    const draft = trackAsBillDraft(rows, "b", "2026-08-21");
    expect(draft.chargeCount).toBe(2);
    expect(draft.expectedCents).toBe(1599);
    expect(draft.cadence).toEqual({ unit: "month", n: 1 });
  });

  it("counts only similar amounts when the merchant is many products", () => {
    // PP*APPLE.COM/BILL is App Store, Music, iCloud, one-offs — one descriptor.
    const rows = [
      row("song", "2026-06-01", {
        description: "PP*APPLE.COM/BILL",
        payeeName: "Apple",
        amountCents: -999,
      }),
      row("app", "2026-06-15", {
        description: "PP*APPLE.COM/BILL",
        payeeName: "Apple",
        amountCents: -1499,
      }),
      row("music", "2026-07-01", {
        description: "PP*APPLE.COM/BILL",
        payeeName: "Apple",
        amountCents: -999,
      }),
    ];
    const draft = trackAsBillDraft(rows, "music", "2026-08-21");
    expect(draft.matchAmountCents).toBe(999);
    expect(draft.expectedCents).toBe(999);
    expect(draft.chargeCount).toBe(2);
    expect(draft.merchantChargeCount).toBe(3);
    expect(draft.cadence).toEqual({ unit: "month", n: 1 });
  });

  it("throws when the selected row is gone", () => {
    expect(() => trackAsBillDraft([], "missing", "2026-08-21")).toThrow(
      "Select a transaction",
    );
  });
});
