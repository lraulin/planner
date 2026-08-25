import { describe, expect, it } from "vitest";
import {
  accountBalanceTooltip,
  accountBalanceView,
  type DashboardAccount,
} from "./workingBalance";

function account(over: Partial<DashboardAccount> = {}): DashboardAccount {
  return {
    id: "a",
    name: "Account",
    kind: "checking",
    balanceCents: 0,
    syncedBalanceAsOf: null,
    ...over,
  };
}

describe("accountBalanceView", () => {
  it("adds pending on top of a synced card and leaves the posted figure alone", () => {
    const view = accountBalanceView(
      account({
        id: "card",
        kind: "credit_card",
        balanceCents: -5978,
        syncedBalanceAsOf: new Date("2026-08-16T09:00:00Z"),
      }),
      [
        { accountId: "card", amountCents: -37968 },
        { accountId: "other", amountCents: -1000 },
      ],
    );

    expect(view.postedCents).toBe(-5978);
    expect(view.pendingCents).toBe(-37968);
    expect(view.workingCents).toBe(-43946);
  });

  it("does not add pending to a statement-anchored card", () => {
    const view = accountBalanceView(
      account({
        id: "card",
        kind: "credit_card",
        balanceCents: -5978,
        syncedBalanceAsOf: null,
      }),
      [{ accountId: "card", amountCents: -37968 }],
    );

    expect(view.pendingCents).toBe(0);
    expect(view.workingCents).toBe(-5978);
  });
});

describe("accountBalanceTooltip", () => {
  it("names the current balance, and the posted split only when pending exists", () => {
    expect(
      accountBalanceTooltip({
        workingCents: -43946,
        postedCents: -5978,
        pendingCents: -37968,
      }),
    ).toBe("Current balance -$439.46 (-$59.78 posted + -$379.68 pending)");

    expect(
      accountBalanceTooltip({
        workingCents: -43946,
        postedCents: -43946,
        pendingCents: 0,
      }),
    ).toBe("Current balance -$439.46");
  });
});
