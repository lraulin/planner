import { describe, expect, it } from "vitest";

import { billInspectorView, inspectorBreakdown } from "./inspector";
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
    expect(view.estimateCopy).toMatch(/Unscheduled/);
    expect(view.estimateCopy).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});
