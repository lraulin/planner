import { describe, expect, it } from "vitest";
import { PLANNER_BANK_SNAPSHOT_HEADER } from "./bankSnapshot";
import { restorableHold } from "./auditRestore";

const deleted = (before: Record<string, unknown> | null) => ({
  entityType: "transaction",
  before,
  after: null,
});

const wholeRow = {
  accountId: "acct",
  transactionDate: "2026-09-18",
  postedDate: null,
  pending: true,
  description: "Chewy.com",
  notes: "dog food",
  amountCents: -5129,
  sourceCategory: "",
  budgetCategoryId: "pets",
  payeeId: null,
  derivedFlow: "spend",
  flowOverride: null,
  isParent: false,
  parentId: null,
  externalSource: "scrape:capitalone",
  externalId: "x|0",
};

describe("restorableHold", () => {
  it("rebuilds the hold, envelope and notes included, from a whole audit row", () => {
    const verdict = restorableHold(deleted(wholeRow), {});
    expect(verdict).toMatchObject({
      ok: true,
      hold: {
        description: "Chewy.com",
        amountCents: -5129,
        budgetCategoryId: "pets",
        notes: "dog food",
        derivedFlow: "spend",
      },
    });
  });

  it("refuses a posted row: history belongs to its feed, and a copy would double-count", () => {
    expect(restorableHold(deleted({ ...wholeRow, pending: false }), {}).ok).toBe(false);
  });

  it("refuses a change that did not delete anything", () => {
    expect(
      restorableHold(
        { entityType: "transaction", before: wholeRow, after: wholeRow },
        {},
      ).ok,
    ).toBe(false);
    expect(restorableHold(deleted(null), {}).ok).toBe(false);
  });

  it("names a hold from the pasted page when the audit predates descriptions", () => {
    // The 2026-09-20 event: normalized state without description, evidence with the page.
    const { description: _description, notes: _notes, ...legacy } = wholeRow;
    const rawText = `${PLANNER_BANK_SNAPSHOT_HEADER}\n${JSON.stringify({
      version: 1,
      source: "capitalone",
      capturedAt: "2026-09-20T09:00:00.000-04:00",
      accountLast4: "3448",
      balanceKind: "posted_only",
      currentBalance: "$340.18",
      completeness: {
        currentCycle: true,
        posted: true,
        pending: true,
        filtered: false,
        searched: false,
      },
      posted: [],
      pending: [
        {
          transactionDate: "Fri, Sep 18, 2026",
          postedDate: null,
          description: "Chewy.com",
          category: "",
          amount: "$51.29",
        },
      ],
    })}\n`;
    const verdict = restorableHold(deleted(legacy), { rawText });
    expect(verdict).toMatchObject({ ok: true, hold: { description: "Chewy.com" } });
  });

  it("refuses rather than guess when the evidence cannot single the hold out", () => {
    const { description: _description, ...legacy } = wholeRow;
    expect(restorableHold(deleted(legacy), {}).ok).toBe(false);
  });
});
