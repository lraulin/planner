import { describe, expect, it } from "vitest";

import {
  billInspectorView,
  cancelledChargeWarning,
  inspectorBreakdown,
  walksNextDue,
} from "./inspector";
import type { BillFacet } from "./queries";

function bill(overrides: Partial<BillFacet> = {}): BillFacet {
  return {
    status: "active",
    cancelledOn: null,
    url: "",
    cadenceMonths: 1,
    cadenceDays: null,
    dueDay: null,
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
