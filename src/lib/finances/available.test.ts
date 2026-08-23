import { describe, expect, it } from "vitest";
import {
  accountBalanceTooltip,
  accountBalanceView,
  availableToSpend,
  cashPosition,
  nextPayday,
  paydaysPerCadence,
  setAsideHeld,
  recurringSpendHeld,
  type BillCharge,
  type DashboardAccount,
  type PendingRow,
} from "./available";
import type { Payday } from "./classify/income";
import type { StoredSpend } from "./commitments";
import type { StoredBill } from "./recurringBills";

/**
 * These tests exist because every number on the dashboard is plausible when wrong. A card
 * balance added instead of subtracted, pending counted twice, a set-aside that never clears —
 * each produces a figure that looks like money and is not.
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

function bill(over: Partial<StoredBill> = {}): StoredBill {
  return {
    name: "RENT:RAULIN",
    cadenceMonths: 1,
    expectedCents: 210000,
    anchorDate: null,
    scheduled: true,
    dueDay: null,
    ...over,
  };
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

describe("availableToSpend", () => {
  const pending: PendingRow[] = [{ accountId: "chk", amountCents: -4210 }];

  it("applies pending on top of a synced balance", () => {
    // SimpleFIN reports the posted balance, so a pending charge is not in it yet.
    const result = availableToSpend(
      [
        account({
          id: "chk",
          kind: "checking",
          balanceCents: 57145,
          syncedBalanceAsOf: new Date("2026-08-16T09:00:00Z"),
        }),
      ],
      pending,
      [],
    );

    expect(result.pendingCents).toBe(-4210);
    expect(result.totalCents).toBe(52935);
  });

  it("does not apply pending to a statement-anchored or ledger balance", () => {
    // Those tiers are built by summing transactions, pending rows included. Applying pending
    // again would deduct the same $42.10 twice, and only on accounts that have pending rows.
    const result = availableToSpend(
      [
        account({
          id: "chk",
          kind: "checking",
          balanceCents: 57145,
          syncedBalanceAsOf: null,
        }),
      ],
      pending,
      [],
    );

    expect(result.pendingCents).toBe(0);
    expect(result.totalCents).toBe(57145);
  });

  it("ignores pending on a savings account, which is outside the figure anyway", () => {
    const result = availableToSpend(
      [
        account({
          id: "sav",
          kind: "savings",
          balanceCents: 270000,
          syncedBalanceAsOf: new Date("2026-08-16T09:00:00Z"),
        }),
      ],
      [{ accountId: "sav", amountCents: -1000 }],
      [],
    );

    expect(result.pendingCents).toBe(0);
    expect(result.totalCents).toBe(0);
  });

  it("reduces the total by card debt and set-asides, and goes negative", () => {
    const result = availableToSpend(
      [
        account({
          id: "chk",
          kind: "checking",
          balanceCents: 57145,
          syncedBalanceAsOf: new Date("2026-08-16T09:00:00Z"),
        }),
        account({ id: "card", kind: "credit_card", balanceCents: -30100 }),
      ],
      pending,
      [
        {
          name: "RENT:RAULIN",
          expectedCents: 210000,
          perPaycheckCents: 105000,
          heldCents: 105000,
          fullyFunded: false,
          periodStartKey: "2026-08-01",
          nextDueKey: "2026-09-01",
        },
      ],
    );

    // 571.45 − 42.10 − 301.00 − 1050.00
    expect(result.totalCents).toBe(-82165);
  });

  it("returns terms that sum to its own headline", () => {
    // The failure mode of every dashboard that formats its breakdown separately from its total.
    const result = availableToSpend(
      [
        account({
          id: "chk",
          kind: "checking",
          balanceCents: 57145,
          syncedBalanceAsOf: new Date("2026-08-16T09:00:00Z"),
        }),
        account({ id: "card", kind: "credit_card", balanceCents: -30100 }),
      ],
      pending,
      [
        {
          name: "RENT:RAULIN",
          expectedCents: 210000,
          perPaycheckCents: 105000,
          heldCents: 105000,
          fullyFunded: false,
          periodStartKey: "2026-08-01",
          nextDueKey: "2026-09-01",
        },
      ],
    );

    const summed = result.terms.reduce((total, term) => total + term.cents, 0);
    expect(summed).toBe(result.totalCents);
  });

  it("handles no accounts, no pending and no set-asides", () => {
    expect(availableToSpend([], [], []).totalCents).toBe(0);
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

describe("setAsideHeld", () => {
  const charges: BillCharge[] = [{ name: "RENT:RAULIN", dateKey: "2026-08-01" }];

  it("accrues one half-share per payday since the last charge", () => {
    const held = setAsideHeld(bill(), [payday("2026-08-07")], charges, "2026-08-16");

    expect(held).toMatchObject({
      perPaycheckCents: 105000,
      heldCents: 105000,
      fullyFunded: false,
      periodStartKey: "2026-08-01",
      nextDueKey: "2026-09-01",
    });
  });

  it("caps at the full expected amount however many paydays have passed", () => {
    const held = setAsideHeld(
      bill(),
      [payday("2026-08-07"), payday("2026-08-21"), payday("2026-09-04")],
      [{ name: "RENT:RAULIN", dateKey: "2026-08-01" }],
      "2026-09-10",
    );

    expect(held?.heldCents).toBe(210000);
    expect(held?.fullyFunded).toBe(true);
  });

  it("resets to zero on the day the charge posts", () => {
    // The whole point of "until the rent is actually paid". Without this the set-aside is a
    // permanent deduction and the headline is wrong by a month's rent forever. The reset is
    // the anchor moving to the new charge, not a separate paid-this-period branch.
    const beforeRentPosts = setAsideHeld(
      bill({ anchorDate: "2026-07-01" }),
      [payday("2026-07-10"), payday("2026-07-24")],
      [{ name: "RENT:RAULIN", dateKey: "2026-07-01" }],
      "2026-07-31",
    );
    expect(beforeRentPosts?.heldCents).toBe(210000);

    const afterRentPosts = setAsideHeld(
      bill({ anchorDate: "2026-07-01" }),
      [payday("2026-07-10"), payday("2026-07-24")],
      [
        { name: "RENT:RAULIN", dateKey: "2026-07-01" },
        { name: "RENT:RAULIN", dateKey: "2026-08-01" },
      ],
      "2026-08-01",
    );
    expect(afterRentPosts?.heldCents).toBe(0);
    expect(afterRentPosts?.periodStartKey).toBe("2026-08-01");
  });

  it("keeps accruing when the newest charge is a whole cadence behind", () => {
    // Rent went unpaid in August. The accrual stays anchored on July, so it is fully funded
    // and the next-due date reads as overdue rather than being walked forward out of sight.
    const held = setAsideHeld(
      bill(),
      [payday("2026-08-07"), payday("2026-08-21")],
      [{ name: "RENT:RAULIN", dateKey: "2026-07-01" }],
      "2026-08-25",
    );

    expect(held?.heldCents).toBe(210000);
    expect(held?.nextDueKey).toBe("2026-08-01");
  });

  it("holds nothing before the first payday of the period", () => {
    const held = setAsideHeld(bill(), [payday("2026-07-24")], charges, "2026-08-05");
    expect(held?.heldCents).toBe(0);
  });

  it("ignores a charge dated in the future", () => {
    const held = setAsideHeld(
      bill({ anchorDate: "2026-08-01" }),
      [payday("2026-08-07")],
      [{ name: "RENT:RAULIN", dateKey: "2026-09-01" }],
      "2026-08-16",
    );

    // The anchor is the charge being *waited for* (`billAnchor`), so the period accruing
    // toward it is the cadence ending there — not one starting there. Read the other way,
    // an anchor set to a future date accrued over a window that had not begun and held
    // nothing at all.
    expect(held?.periodStartKey).toBe("2026-07-01");
    expect(held?.nextDueKey).toBe("2026-08-01");
    expect(held?.heldCents).toBe(105000);
  });

  it("does not anchor on another merchant's charge", () => {
    const held = setAsideHeld(
      bill({ anchorDate: "2026-08-01" }),
      [payday("2026-08-07")],
      [{ name: "Geico", dateKey: "2026-08-02" }],
      "2026-08-16",
    );

    expect(held?.periodStartKey).toBe("2026-07-01");
  });

  it("accrues toward an anchor set in the future rather than holding nothing", () => {
    // The regression `billAnchor` exists for: a bill declared with its next charge and no
    // history read that date as the *start* of the accrual period, so the window ran from a
    // day that had not happened and every payday fell outside it.
    const held = setAsideHeld(
      bill({ anchorDate: "2026-09-01" }),
      [payday("2026-08-07"), payday("2026-08-21")],
      [],
      "2026-08-25",
    );

    expect(held?.periodStartKey).toBe("2026-08-01");
    expect(held?.nextDueKey).toBe("2026-09-01");
    expect(held?.heldCents).toBe(210000);
  });

  it("returns null rather than inventing a figure when no amount is declared", () => {
    // A median of the charges on file is a fine estimate for a report and the wrong basis for
    // deducting money from a number the user is about to spend against.
    expect(
      setAsideHeld(
        bill({ expectedCents: null }),
        [payday("2026-08-07")],
        [],
        "2026-08-16",
      ),
    ).toBe(null);
  });

  it("accrues an unscheduled bill, whose date is unknown but whose cost is not", () => {
    // The date being unknown says nothing about the cost: propane's $500 a year still has to
    // come from somewhere before the truck arrives.
    const held = setAsideHeld(
      bill({
        name: "Taylor Gas",
        cadenceMonths: 12,
        expectedCents: 50000,
        scheduled: false,
        anchorDate: "2026-08-01",
      }),
      [payday("2026-08-07")],
      [],
      "2026-08-16",
    );

    expect(held).toMatchObject({ perPaycheckCents: 1923, heldCents: 1923 });
  });

  it("anchors on dueDay when there is no charge and no anchorDate", () => {
    const held = setAsideHeld(
      bill({ dueDay: 1 }),
      [payday("2026-08-07"), payday("2026-08-21")],
      [],
      "2026-08-25",
    );

    expect(held?.periodStartKey).toBe("2026-08-01");
    expect(held?.heldCents).toBe(210000);
  });

  it("walks dueDay back a cadence when this month's has not arrived", () => {
    const held = setAsideHeld(
      bill({ dueDay: 20 }),
      [payday("2026-08-07")],
      [],
      "2026-08-16",
    );
    expect(held?.periodStartKey).toBe("2026-07-20");
  });

  it("holds nothing with no paydays at all", () => {
    expect(setAsideHeld(bill({ dueDay: 1 }), [], [], "2026-08-16")?.heldCents).toBe(0);
  });
});

function spendEntry(over: Partial<StoredSpend> = {}): StoredSpend {
  return {
    id: "spend-1",
    name: "Pizza",
    payees: [],
    category: "",
    period: "week",
    amountSource: "auto",
    expectedCents: null,
    active: true,
    ...over,
  };
}

describe("recurringSpendHeld", () => {
  /*
   * The behaviour this whole tier exists for. `setAsideHeld` cannot express it: that one
   * accrues toward a future charge and assumes the cadence is at least a pay period, which a
   * weekly grocery run against fortnightly pay is not.
   *
   * 2026-08-17 is a Monday, so a week runs Mon–Sun and the fortnight to 2026-08-31 holds
   * exactly two whole weeks.
   */
  const MONDAY = "2026-08-17";
  const PAYDAY = "2026-08-31";

  it("holds every whole period between today and payday", () => {
    const held = recurringSpendHeld(spendEntry(), 6000, [], MONDAY, PAYDAY);

    expect(held?.periodsCounted).toBe(2);
    expect(held?.heldCents).toBe(12000);
  });

  it("moves available by exactly the overage, not by the whole charge", () => {
    /*
     * The trace from the spec, and the reason the clamp at zero is the mechanism rather than a
     * tidy-up. A $95 pizza against a $60 week:
     *
     *   before  balance − 12000
     *   after   (balance − 9500) − 6000  =  balance − 15500
     *   delta   −3500, the overage alone
     *
     * Without the clamp the $35 would be counted twice — once as a real charge that already
     * left the account, and again as an obligation still outstanding.
     */
    const before = recurringSpendHeld(spendEntry(), 6000, [], MONDAY, PAYDAY);
    const after = recurringSpendHeld(
      spendEntry(),
      6000,
      [{ dateKey: "2026-08-21", costCents: 9500 }],
      MONDAY,
      PAYDAY,
    );

    expect(before?.heldCents).toBe(12000);
    expect(after?.heldCents).toBe(6000);
    expect(-9500 - (after?.heldCents ?? 0) + (before?.heldCents ?? 0)).toBe(-3500);
    expect(after?.overCents).toBe(3500);
  });

  it("makes spending within the rate free, because it was already held", () => {
    // Buying the pizza you budgeted for must not move the headline at all.
    const before = recurringSpendHeld(spendEntry(), 6000, [], MONDAY, PAYDAY);
    const after = recurringSpendHeld(
      spendEntry(),
      6000,
      [{ dateKey: "2026-08-21", costCents: 6000 }],
      MONDAY,
      PAYDAY,
    );

    expect(-6000 - (after?.heldCents ?? 0) + (before?.heldCents ?? 0)).toBe(0);
    expect(after?.overCents).toBe(0);
  });

  it("never holds a negative amount when a period runs well over", () => {
    const held = recurringSpendHeld(
      spendEntry(),
      6000,
      [{ dateKey: "2026-08-18", costCents: 50000 }],
      MONDAY,
      PAYDAY,
    );

    // The second week is still owed in full; only the blown one clamps to zero.
    expect(held?.heldCents).toBe(6000);
    expect(held?.overCents).toBe(44000);
  });

  it("does not pro-rate the current period, however little of it is left", () => {
    // Friday's pizza is a lump. Two days left in the week does not mean two sevenths of one.
    const held = recurringSpendHeld(spendEntry(), 6000, [], "2026-08-22", "2026-08-23");
    expect(held?.heldCents).toBe(6000);
  });

  it("pro-rates a future period that payday cuts short", () => {
    // Payday lands on the Wednesday of the third week, so that week is owed 2/7 of its rate.
    const held = recurringSpendHeld(spendEntry(), 7000, [], MONDAY, "2026-09-02");

    expect(held?.periodsCounted).toBe(3);
    expect(held?.heldCents).toBe(7000 + 7000 + 2000);
  });

  it("still holds this period when no payday can be dated", () => {
    const held = recurringSpendHeld(spendEntry(), 6000, [], MONDAY, null);

    expect(held?.periodsCounted).toBe(1);
    expect(held?.heldCents).toBe(6000);
  });

  it("holds nothing for an inactive entry or a zero rate", () => {
    expect(
      recurringSpendHeld(spendEntry({ active: false }), 6000, [], MONDAY, PAYDAY),
    ).toBeNull();
    expect(recurringSpendHeld(spendEntry(), 0, [], MONDAY, PAYDAY)).toBeNull();
  });

  it("counts only the current period's charges as spent, not last week's", () => {
    const held = recurringSpendHeld(
      spendEntry(),
      6000,
      [
        { dateKey: "2026-08-14", costCents: 9500 },
        { dateKey: "2026-08-19", costCents: 1000 },
      ],
      MONDAY,
      PAYDAY,
    );

    expect(held?.spentThisPeriodCents).toBe(1000);
    expect(held?.heldCents).toBe(5000 + 6000);
  });
});

describe("availableToSpend with recurring spend", () => {
  it("subtracts bills and recurring spend as two separate, labelled lines", () => {
    // One merged figure would make the larger of them impossible to interpret.
    const result = availableToSpend(
      [account({ kind: "checking", balanceCents: 100000 })],
      [],
      [
        {
          name: "Rent",
          expectedCents: 210000,
          perPaycheckCents: 105000,
          heldCents: 105000,
          fullyFunded: false,
          periodStartKey: "2026-08-01",
          nextDueKey: "2026-09-01",
        },
      ],
      [
        {
          name: "Pizza",
          ratePerPeriodCents: 6000,
          spentThisPeriodCents: 0,
          heldCents: 12000,
          overCents: 0,
          periodsCounted: 2,
        },
      ],
    );

    expect(result.setAsideCents).toBe(105000);
    expect(result.recurringSpendCents).toBe(12000);
    expect(result.totalCents).toBe(100000 - 105000 - 12000);
    // The breakdown must add up to its own headline, or the page shows a contradiction.
    expect(result.terms.reduce((total, term) => total + term.cents, 0)).toBe(
      result.totalCents,
    );
  });

  it("is unchanged when nothing recurring is declared", () => {
    const result = availableToSpend([account({ balanceCents: 50000 })], [], []);
    expect(result.recurringSpendCents).toBe(0);
    expect(result.totalCents).toBe(50000);
  });
});
