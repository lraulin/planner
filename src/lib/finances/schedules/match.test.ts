import { describe, expect, it } from "vitest";
import { matchesOccurrence, matchStartDate, type MatchCandidate } from "./match";
import type { ScheduleConds } from "./conditions";

function conds(overrides: Partial<ScheduleConds> = {}): ScheduleConds {
  return {
    payee: { field: "payee", op: "is", value: "NETFLIX" },
    account: null,
    amount: { field: "amount", op: "isapprox", value: -1599 },
    date: {
      field: "date",
      op: "isapprox",
      value: { frequency: "monthly", start: "2026-01-15" },
    },
    ...overrides,
  };
}

function row(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    accountId: "acct",
    description: "NETFLIX",
    amountCents: -1599,
    transactionDate: "2026-08-15",
    scheduleId: null,
    transferGroupId: null,
    ...overrides,
  };
}

describe("matchStartDate", () => {
  it("is exact for date op is and for postsTransaction, otherwise a 2-day lookback", () => {
    expect(
      matchStartDate(
        conds({ date: { field: "date", op: "is", value: "2026-08-15" } }),
        "2026-08-15",
        false,
      ),
    ).toBe("2026-08-15");
    expect(matchStartDate(conds(), "2026-08-15", true)).toBe("2026-08-15");
    expect(matchStartDate(conds(), "2026-08-15", false)).toBe("2026-08-13");
  });
});

describe("matchesOccurrence", () => {
  it("accepts a charge two days early within the amount threshold", () => {
    expect(
      matchesOccurrence(
        conds(),
        "2026-08-15",
        row({ transactionDate: "2026-08-13" }),
        false,
      ),
    ).toBe(true);
    expect(
      matchesOccurrence(
        conds(),
        "2026-08-15",
        row({ transactionDate: "2026-08-12" }),
        false,
      ),
    ).toBe(false);
  });

  it("rejects a different merchant or an amount outside the threshold", () => {
    expect(
      matchesOccurrence(conds(), "2026-08-15", row({ description: "SPOTIFY" }), false),
    ).toBe(false);
    expect(
      matchesOccurrence(conds(), "2026-08-15", row({ amountCents: -2000 }), false),
    ).toBe(false);
  });

  it("requires the account when one is named", () => {
    const named = conds({ account: { field: "account", op: "is", value: "checking" } });
    expect(
      matchesOccurrence(named, "2026-08-15", row({ accountId: "checking" }), false),
    ).toBe(true);
    expect(
      matchesOccurrence(named, "2026-08-15", row({ accountId: "card" }), false),
    ).toBe(false);
  });
});
