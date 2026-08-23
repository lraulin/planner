import { describe, expect, it } from "vitest";
import type { TransactionListRow } from "../types";
import {
  createRuleRefusal,
  escapeRegex,
  ruleDraftFromTransaction,
} from "./fromTransaction";

function transaction(patch: Partial<TransactionListRow> = {}): TransactionListRow {
  return {
    id: "row",
    accountId: "account",
    accountName: "Checking",
    accountKind: "checking",
    transactionDate: "2026-08-23",
    postedDate: null,
    pending: false,
    description: "PADDLE.NET* CURSOR",
    amountCents: -2000,
    sourceCategory: "",
    category: null,
    derivedCategory: "Software & AI",
    derivedFlow: "spend",
    flowOverride: null,
    excludeFromBaseline: false,
    eventLabel: "",
    plannedWithdrawal: false,
    notes: "",
    balanceAfterCents: null,
    budgetCategoryId: null,
    budgetCategoryName: null,
    scheduleId: null,
    scheduleName: null,
    payeeId: null,
    payeeName: null,
    ...patch,
  };
}

describe("create rule from transaction", () => {
  it("uses stable payee identity when the row has one", () => {
    const draft = ruleDraftFromTransaction(
      transaction({
        payeeId: "11111111-1111-4111-8111-111111111111",
        payeeName: "Cursor",
      }),
    );
    expect(draft.conditions[0]).toMatchObject({
      field: "payee",
      op: "is",
      value: "11111111-1111-4111-8111-111111111111",
    });
    expect(draft.actions).toEqual([{ kind: "category", value: "Software & AI" }]);
  });

  it("falls back to an escaped exact normalized merchant", () => {
    expect(escapeRegex("PADDLE.NET* CURSOR")).toBe("PADDLE\\.NET\\* CURSOR");
    expect(ruleDraftFromTransaction(transaction()).conditions[0]).toMatchObject({
      field: "merchant",
      op: "matches",
      value: "^PADDLE\\* CURSOR$",
    });
  });

  it("states why a command cannot run", () => {
    expect(createRuleRefusal(undefined)).toBe("Select a row first");
    expect(createRuleRefusal(transaction({ description: "PAYPAL *" }))).toBe(
      "This row has no payee or merchant to match",
    );
  });
});
