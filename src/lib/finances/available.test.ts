import { describe, expect, it } from "vitest";
import {
  accountBalanceTooltip,
  accountBalanceView,
  cashPosition,
  nextPayday,
  paydaysPerCadence,
  type DashboardAccount,
} from "./available";
import type { Payday } from "./classify/income";

/**
 * These tests exist because every number on the dashboard is plausible when wrong. A card
 * balance added instead of subtracted, pending counted twice, a payday projected off the wrong
 * anchor — each produces a figure that looks like money and is not.
 */

const NO_OVERRIDE = { anchorDate: null, cadenceDays: null };

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

function payday(dateKey: string): Payday {
  return { dateKey, employer: "TrustedQA", amountCents: 247433, transactionIds: [] };
}

describe("cashPosition", () => {
  it("subtracts a card's negative balance rather than adding its magnitude", () => {
    // The sign convention makes this an addition. Anyone reaching for Math.abs here turns
    // $301 of debt into $301 of assets, and the total still looks like a reasonable number.
    const position = cashPosition([
      account({ id: "chk", kind: "checking", balanceCents: 57145 }),
      account({ id: "card", kind: "credit_card", balanceCents: -30100 }),
    ]);

    expect(position.cardDebtCents).toBe(-30100);
    expect(position.netCents).toBe(27045);
  });

  it("keeps savings out of spendable but inside the net", () => {
    const position = cashPosition([
      account({ id: "chk", kind: "checking", balanceCents: 57145 }),
      account({ id: "sav", kind: "savings", balanceCents: 270000 }),
    ]);

    expect(position.spendableCents).toBe(57145);
    expect(position.savingsCents).toBe(270000);
    expect(position.netCents).toBe(327145);
  });

  it("ignores investment and loan accounts entirely", () => {
    // Net worth is a different question, asked by assetDebtAt() in analytics.ts. A mortgage
    // in here would swamp a figure about groceries.
    const position = cashPosition([
      account({ id: "chk", kind: "checking", balanceCents: 57145 }),
      account({ id: "ira", kind: "investment", balanceCents: 5000000 }),
      account({ id: "mtg", kind: "loan", balanceCents: -18000000 }),
    ]);

    expect(position.netCents).toBe(57145);
  });

  it("returns zeros rather than NaN for no accounts", () => {
    expect(cashPosition([])).toEqual({
      spendableCents: 0,
      savingsCents: 0,
      cardDebtCents: 0,
      netCents: 0,
    });
  });
});

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

describe("nextPayday", () => {
  const series = [payday("2026-07-24"), payday("2026-08-07")];

  it("projects the next fortnight from the newest payday", () => {
    expect(nextPayday(series, NO_OVERRIDE, "2026-08-16")).toEqual({
      dateKey: "2026-08-21",
      daysAway: 5,
      source: "detected",
    });
  });

  it("crosses a month boundary without drifting", () => {
    expect(nextPayday(series, NO_OVERRIDE, "2026-08-25").dateKey).toBe("2026-09-04");
  });

  it("reports zero days when payday is today", () => {
    // Not 14. A payday that has arrived is today's payday until the day turns over.
    expect(nextPayday(series, NO_OVERRIDE, "2026-08-21")).toMatchObject({
      dateKey: "2026-08-21",
      daysAway: 0,
    });
  });

  it("uses the median gap, so a job-change hole does not drag the projection late", () => {
    // 77 days between Endava's last check and TrustedQA's first — a real gap from the data.
    const withHole = [
      payday("2026-05-08"),
      payday("2026-07-24"),
      payday("2026-08-07"),
      payday("2026-08-21"),
    ];
    // Gaps are 77, 14, 14 → median 14. A mean would give 35 and put payday in late September.
    expect(nextPayday(withHole, NO_OVERRIDE, "2026-08-25").dateKey).toBe("2026-09-04");
  });

  it("ignores a zero gap from two employers paying on the same day", () => {
    const sameDay = [
      { ...payday("2026-08-07"), employer: "TrustedQA" },
      { ...payday("2026-08-07"), employer: "VA" },
      payday("2026-08-21"),
    ];
    expect(nextPayday(sameDay, NO_OVERRIDE, "2026-08-25").dateKey).toBe("2026-09-04");
  });

  it("lets the override win and says so", () => {
    expect(
      nextPayday(series, { anchorDate: "2026-08-03", cadenceDays: 14 }, "2026-08-16"),
    ).toEqual({ dateKey: "2026-08-17", daysAway: 1, source: "override" });
  });

  it("falls back to detection when the override is half-filled", () => {
    // An anchor with no cadence is not a schedule, and defaulting the cadence would invent one.
    expect(
      nextPayday(series, { anchorDate: "2026-08-03", cadenceDays: null }, "2026-08-16")
        .source,
    ).toBe("detected");
  });

  it("reports unknown rather than guessing from an empty series", () => {
    expect(nextPayday([], NO_OVERRIDE, "2026-08-16")).toEqual({
      dateKey: null,
      daysAway: null,
      source: "unknown",
    });
  });

  it("assumes a fortnight from a single payday", () => {
    expect(nextPayday([payday("2026-08-07")], NO_OVERRIDE, "2026-08-16").dateKey).toBe(
      "2026-08-21",
    );
  });
});

describe("paydaysPerCadence", () => {
  it("gives a monthly bill two paychecks and a yearly one twenty-six", () => {
    expect(paydaysPerCadence({ unit: "month", n: 1 })).toBe(2);
    expect(paydaysPerCadence({ unit: "month", n: 3 })).toBe(7);
    expect(paydaysPerCadence({ unit: "month", n: 6 })).toBe(13);
    expect(paydaysPerCadence({ unit: "month", n: 12 })).toBe(26);
  });
});
