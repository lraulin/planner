import type { BillFacet } from "@/lib/finances/budget/queries";

/** An active monthly $10 bill with no due day; `overrides` sets what a test is about. */
export function billFacet(overrides: Partial<BillFacet> = {}): BillFacet {
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
    expectedCents: 1_000,
    ...overrides,
  };
}
