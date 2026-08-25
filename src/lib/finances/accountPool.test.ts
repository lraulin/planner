import { describe, expect, it } from "vitest";
import {
  accountPoolBreakdown,
  accountPoolCents,
  type PoolAccount,
} from "./accountPool";

function account(over: Partial<PoolAccount> = {}): PoolAccount {
  return {
    id: "a",
    name: "Account",
    kind: "checking",
    balanceCents: 0,
    syncedBalanceAsOf: null,
    offBudget: false,
    ...over,
  };
}

describe("accountPoolCents", () => {
  it("subtracts a card's negative balance rather than adding its magnitude", () => {
    // The sign convention makes this an addition. Anyone reaching for Math.abs here turns
    // $301 of debt into $301 of assets, and the total still looks like a reasonable number.
    expect(
      accountPoolCents([
        account({ id: "chk", kind: "checking", balanceCents: 57145 }),
        account({ id: "card", kind: "credit_card", balanceCents: -30100 }),
      ]),
    ).toBe(27045);
  });

  it("includes savings in the pool", () => {
    expect(
      accountPoolCents([
        account({ id: "chk", kind: "checking", balanceCents: 57145 }),
        account({ id: "sav", kind: "savings", balanceCents: 270000 }),
      ]),
    ).toBe(327145);
  });

  it("adds pending only on a synced headline", () => {
    const accounts = [
      account({
        id: "card",
        kind: "credit_card",
        balanceCents: -5978,
        syncedBalanceAsOf: new Date("2026-08-16T09:00:00Z"),
      }),
    ];
    expect(
      accountPoolCents(accounts, [{ accountId: "card", amountCents: -37968 }]),
    ).toBe(-43946);
    expect(
      accountPoolCents(
        [account({ id: "card", kind: "credit_card", balanceCents: -5978 })],
        [{ accountId: "card", amountCents: -37968 }],
      ),
    ).toBe(-5978);
  });

  it("ignores off-budget investments and loans", () => {
    expect(
      accountPoolCents([
        account({ id: "chk", kind: "checking", balanceCents: 57145 }),
        account({
          id: "ira",
          kind: "investment",
          balanceCents: 5000000,
          offBudget: true,
        }),
        account({
          id: "mtg",
          kind: "loan",
          balanceCents: -18000000,
          offBudget: true,
        }),
      ]),
    ).toBe(57145);
  });

  it("includes an on-budget investment in the pool", () => {
    expect(
      accountPoolCents([
        account({ id: "chk", kind: "checking", balanceCents: 57145 }),
        account({
          id: "broker",
          kind: "investment",
          balanceCents: 10000,
          offBudget: false,
        }),
      ]),
    ).toBe(67145);
  });
});

describe("accountPoolBreakdown", () => {
  it("names checking, savings and cards without a second total", () => {
    const breakdown = accountPoolBreakdown([
      account({ id: "chk", kind: "checking", balanceCents: 57145 }),
      account({ id: "sav", kind: "savings", balanceCents: 270000 }),
      account({ id: "card", kind: "credit_card", balanceCents: -30100 }),
    ]);
    expect(breakdown.checkingCashCents).toBe(57145);
    expect(breakdown.savingsCents).toBe(270000);
    expect(breakdown.cardDebtCents).toBe(-30100);
    expect(breakdown.otherOnBudgetCents).toBe(0);
    expect(breakdown.accountPoolCents).toBe(297045);
    expect(
      breakdown.checkingCashCents +
        breakdown.savingsCents +
        breakdown.cardDebtCents +
        breakdown.otherOnBudgetCents,
    ).toBe(breakdown.accountPoolCents);
  });
});
