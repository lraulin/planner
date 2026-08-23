import { describe, expect, it } from "vitest";
import { matchesOccurrence, matchStartDate, type MatchCandidate } from "./match";
import type { ScheduleConds } from "./conditions";

const PAYEE_A = "11111111-1111-4111-8111-111111111111";
const PAYEE_B = "22222222-2222-4222-8222-222222222222";

function conds(overrides: Partial<ScheduleConds> = {}): ScheduleConds {
  return {
    payee: { field: "payee", op: "is", value: PAYEE_A },
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
    payeeId: PAYEE_A,
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

  it("rejects a different payee or an amount outside the threshold", () => {
    expect(
      matchesOccurrence(conds(), "2026-08-15", row({ payeeId: PAYEE_B }), false),
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

  it("matches the stable payee id and does not fall back to description", () => {
    const named = conds({ payee: { field: "payee", op: "is", value: PAYEE_A } });

    expect(
      matchesOccurrence(named, "2026-08-15", row({ payeeId: PAYEE_A }), false),
    ).toBe(true);
    expect(matchesOccurrence(named, "2026-08-15", row({ payeeId: null }), false)).toBe(
      false,
    );
  });
});
