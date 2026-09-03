/**
 * View-model for the Budget inspector pane: Actual leftover identity, and bill-facet
 * copy that cannot invent a charge date for an unscheduled bill.
 *
 * Spec: `agent-os/specs/2026-08-25-1633-budget-inspector/` D7.
 */

import type { EnvelopeStatus } from "@/db/schema";
import { formatUsd } from "@/lib/finances/money";
import {
  annualCents,
  cadenceLabel,
  cadenceOf,
  type Cadence,
} from "@/lib/finances/recurringBills";
import type { BillFacet } from "./queries";

export type InspectorBreakdown = {
  carryInCents: number;
  assignedCents: number;
  activityCents: number;
  availableCents: number;
};

/**
 * The three terms that already sum to Available. The inspector displays them; it does
 * not recompute leftover.
 */
export function inspectorBreakdown(
  carryInCents: number,
  assignedCents: number,
  activityCents: number,
  availableCents: number,
): InspectorBreakdown {
  return { carryInCents, assignedCents, activityCents, availableCents };
}

export function billCadence(bill: BillFacet): Cadence {
  return cadenceOf({
    cadenceMonths: bill.cadenceMonths ?? 1,
    cadenceDays: bill.cadenceDays,
  });
}

export type BillInspectorView = {
  scheduled: boolean;
  showDateEditor: boolean;
  /**
   * Cancelled bills omit the Next charge field entirely — not an editor, not
   * "Unscheduled", not an editable empty. Stored `anchorDate` is untouched.
   */
  omitNextCharge: boolean;
  cadenceCaption: string;
  expectedCents: number;
  annualCents: number;
  monthlyCents: number;
  /**
   * Set only for unscheduled bills. Must not name a next-charge date — propane has a
   * yearly cost and no calendar.
   */
  estimateCopy: string | null;
};

/**
 * Scheduled bills of any status except cancelled grow a next-charge date.
 * Paused still walks; cancelled keeps `anchorDate` so reactivate restores it.
 */
export function walksNextDue(bill: Pick<BillFacet, "scheduled" | "status">): boolean {
  return bill.scheduled && bill.status !== "cancelled";
}

export const CANCELLED_CHARGE_WARNING =
  "A charge posted after this bill was cancelled.";

/** Inspector copy when a cancelled bill still has Activity this month. */
export function cancelledChargeWarning(
  status: EnvelopeStatus,
  activityCents: number,
): string | null {
  if (status === "cancelled" && activityCents !== 0) {
    return CANCELLED_CHARGE_WARNING;
  }
  return null;
}

export function billInspectorView(bill: BillFacet): BillInspectorView {
  const cadence = billCadence(bill);
  const expectedCents = bill.expectedCents ?? 0;
  const yearly =
    bill.expectedCents === null ? 0 : annualCents(bill.expectedCents, cadence);
  const monthlyCents = Math.round(yearly / 12);
  const omitNextCharge = bill.status === "cancelled";

  if (!bill.scheduled) {
    return {
      scheduled: false,
      showDateEditor: false,
      omitNextCharge,
      cadenceCaption: "Irregular",
      expectedCents,
      annualCents: yearly,
      monthlyCents,
      estimateCopy:
        yearly === 0
          ? "Unscheduled — the yearly cost is an estimate, not a charge date."
          : `Aim to have ~${formatUsd(yearly)} available. Unscheduled — the amount is a yearly estimate, not a charge date.`,
    };
  }

  return {
    scheduled: true,
    showDateEditor: walksNextDue(bill),
    omitNextCharge,
    cadenceCaption: cadenceLabel(cadence),
    expectedCents,
    annualCents: yearly,
    monthlyCents,
    estimateCopy: null,
  };
}
