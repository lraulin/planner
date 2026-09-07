import { describe, expect, it } from "vitest";

import { envelopeIndicator } from "./indicator";
import {
  billInspectorView,
  cancelledChargeWarning,
  inspectorBreakdown,
  targetPaneView,
  walksNextDue,
} from "./inspector";
import type { BillFacet } from "./queries";
import type { BudgetRow } from "./rows";
import type { Target } from "./targets/types";

function bill(overrides: Partial<BillFacet> = {}): BillFacet {
  return {
    status: "active",
    cancelledOn: null,
    url: "",
    cadenceMonths: 1,
    cadenceDays: null,
    dueDay: null,
    leadDays: 0,
    anchorDate: null,
    scheduled: true,
    expectedCents: 8_799,
    ...overrides,
  };
}

describe("inspectorBreakdown", () => {
  it("is the Actual leftover identity, not a new computation", () => {
    const view = inspectorBreakdown(10_000, 5_000, -3_000, 12_000);
    expect(view.carryInCents + view.assignedCents + view.activityCents).toBe(
      view.availableCents,
    );
  });
});

describe("billInspectorView", () => {
  it("shows a date editor for a scheduled monthly bill and no estimate copy", () => {
    const view = billInspectorView(bill());
    expect(view.showDateEditor).toBe(true);
    expect(view.omitNextCharge).toBe(false);
    expect(view.estimateCopy).toBeNull();
    expect(view.cadenceCaption.toLowerCase()).toContain("month");
    expect(view.annualCents).toBe(8_799 * 12);
    expect(view.monthlyCents).toBe(8_799);
  });

  it("does not invent a charge date for an unscheduled yearly bill", () => {
    const view = billInspectorView(
      bill({
        scheduled: false,
        cadenceMonths: 12,
        expectedCents: 50_000,
      }),
    );
    expect(view.showDateEditor).toBe(false);
    expect(view.cadenceCaption).toBe("Irregular");
    expect(view.estimateCopy).toMatch(/Aim to have ~\$500\.00 available/);
    expect(view.estimateCopy).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(view.estimateCopy?.toLowerCase()).not.toContain("next charge");
    expect(view.annualCents).toBe(50_000);
    expect(view.monthlyCents).toBe(Math.round(50_000 / 12));
  });

  it("still names the unscheduled case when no amount is declared", () => {
    const view = billInspectorView(
      bill({ scheduled: false, cadenceMonths: 12, expectedCents: null }),
    );
    expect(view.showDateEditor).toBe(false);
    expect(view.omitNextCharge).toBe(false);
    expect(view.estimateCopy).toMatch(/Unscheduled/);
    expect(view.estimateCopy).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("omits Next charge for a cancelled scheduled bill and does not reuse Unscheduled copy", () => {
    const view = billInspectorView(bill({ status: "cancelled" }));
    expect(view.showDateEditor).toBe(false);
    expect(view.omitNextCharge).toBe(true);
    expect(view.estimateCopy).toBeNull();
  });

  it("keeps Unscheduled copy for a cancelled unscheduled bill", () => {
    const view = billInspectorView(
      bill({ status: "cancelled", scheduled: false, cadenceMonths: 12 }),
    );
    expect(view.showDateEditor).toBe(false);
    expect(view.omitNextCharge).toBe(true);
    expect(view.estimateCopy).toMatch(/Unscheduled/);
  });

  it("still shows the date editor for a paused scheduled bill", () => {
    const view = billInspectorView(bill({ status: "paused" }));
    expect(view.showDateEditor).toBe(true);
    expect(view.omitNextCharge).toBe(false);
  });
});

describe("walksNextDue", () => {
  it("skips a cancelled scheduled bill and still walks a paused one", () => {
    expect(walksNextDue(bill({ status: "cancelled" }))).toBe(false);
    expect(walksNextDue(bill({ status: "paused" }))).toBe(true);
    expect(walksNextDue(bill({ status: "active" }))).toBe(true);
    expect(walksNextDue(bill({ scheduled: false }))).toBe(false);
  });
});

function budgetRow(overrides: Partial<BudgetRow> = {}): BudgetRow {
  return {
    id: "food",
    groupId: null,
    sortKey: "food",
    name: "Groceries",
    isIncome: false,
    hidden: false,
    notes: "",
    assignedCents: 0,
    activityCents: 0,
    balanceCents: 0,
    carryover: false,
    snoozed: false,
    contributedBeforeCents: 0,
    target: {
      behavior: "add",
      cadence: { unit: "month", day: 31 },
      amountCents: 50_000,
    },
    incomeRole: "other",
    expectedMonthlyIncomeCents: null,
    expectedKey: null,
    dueKey: null,
    goalCents: null,
    kind: "spending",
    bill: null,
    nextDueKey: null,
    ...overrides,
  };
}

function pane(row: BudgetRow, carryInCents = 0, month = "2026-08-01") {
  const envelope = {
    id: row.id,
    name: row.name,
    kind: row.kind,
    hidden: row.hidden,
    status: row.bill?.status ?? ("active" as const),
    target: row.target,
    assignedCents: row.assignedCents,
    activityCents: row.activityCents,
    balanceCents: row.balanceCents,
    carryInCents,
    snoozed: row.snoozed,
    contributedBeforeCents: row.contributedBeforeCents,
    nextDueKey: row.nextDueKey,
  };
  return targetPaneView(
    row,
    carryInCents,
    month,
    envelopeIndicator(envelope, month, new Map()),
  );
}

describe("targetPaneView", () => {
  it("offers Assign for this month's remaining ask on an underfunded add", () => {
    const view = pane(budgetRow({ assignedCents: 10_000, balanceCents: 10_000 }));
    expect(view.showAssignCallout).toBe(true);
    expect(view.assignThisMonthCents).toBe(40_000);
    expect(view.progress).toEqual({
      neededCents: 50_000,
      fundedCents: 10_000,
      toGoCents: 40_000,
      neededLabel: "Needed",
      summary: "Add $500.00 every month",
    });
    expect(view.fill01).toBeCloseTo(10_000 / 50_000, 5);
  });

  it("hides the callout when a snoozed target is not overspent", () => {
    const view = pane(
      budgetRow({
        snoozed: true,
        assignedCents: 50_000,
        activityCents: -50_000,
        balanceCents: 0,
      }),
    );
    expect(view.showAssignCallout).toBe(false);
    expect(view.assignThisMonthCents).toBe(0);
    expect(view.progress?.neededCents).toBe(50_000);
  });

  it("still offers Assign for the overspend floor with no target lines", () => {
    const view = pane(
      budgetRow({
        target: null,
        assignedCents: 0,
        activityCents: -5_000,
        balanceCents: -5_000,
      }),
    );
    expect(view.showAssignCallout).toBe(true);
    expect(view.assignThisMonthCents).toBe(5_000);
    expect(view.progress).toBeNull();
  });

  it("never offers Assign on income", () => {
    const view = pane(
      budgetRow({
        isIncome: true,
        kind: "income",
        target: null,
        assignedCents: 0,
        activityCents: -5_000,
        balanceCents: -5_000,
      }),
    );
    expect(view.showAssignCallout).toBe(false);
  });

  it("keeps Needed / Funded / To Go on a deadline-free save that does not ask", () => {
    const target: Target = {
      behavior: "save",
      cadence: { unit: "none" },
      amountCents: 45_000,
    };
    const view = pane(
      budgetRow({
        kind: "savings",
        target,
        assignedCents: 5_000,
        balanceCents: 5_000,
      }),
    );
    expect(view.showAssignCallout).toBe(false);
    expect(view.progress?.toGoCents).toBe(40_000);
  });
});

describe("cancelledChargeWarning", () => {
  it("warns only when a cancelled bill has Activity this month", () => {
    expect(cancelledChargeWarning("cancelled", -1_299)).toBe(
      "A charge posted after this bill was cancelled.",
    );
    expect(cancelledChargeWarning("cancelled", 0)).toBeNull();
    expect(cancelledChargeWarning("active", -1_299)).toBeNull();
    expect(cancelledChargeWarning("paused", -500)).toBeNull();
  });
});
