/**
 * View-model for the Budget inspector pane: Actual leftover identity, bill-facet
 * copy that cannot invent a charge date for an unscheduled bill, and the Target
 * section's Assign callout / Needed-Funded-To Go.
 *
 * Spec: `agent-os/specs/2026-08-25-1633-budget-inspector/` D7,
 * `agent-os/specs/2026-09-07-1355-target-assign-button/` D2–D4.
 */

import type { EnvelopeStatus } from "@/db/schema";
import { formatUsd } from "@/lib/finances/money";
import {
  annualCents,
  cadenceLabel,
  cadenceOf,
  type Cadence,
} from "@/lib/finances/recurringBills";
import { declaresSchedule } from "@/lib/finances/billSchedule";
import { billSnapshotFromRow } from "./assign/fromBudget";
import type { AssignEnvelope } from "./assign/types";
import type { MonthKey } from "./envelope";
import {
  targetProgress,
  type EnvelopeIndicator,
  type TargetProgress,
} from "./indicator";
import type { BillFacet } from "./queries";
import type { BudgetRow } from "./rows";
import type { BillSnapshot } from "./targets/derive";

export type InspectorBreakdown = {
  carryInCents: number;
  assignedCents: number;
  activityCents: number;
  availableCents: number;
};

export type TargetPaneView = {
  showAssignCallout: boolean;
  assignThisMonthCents: number;
  progress: TargetProgress | null;
  /** `indicator.bar.fill01` — do not recompute (D4). */
  fill01: number | null;
};

/** The AssignEnvelope the Target pane reads, using the inspector's already-folded carry-in. */
export function inspectorAssignEnvelope(
  row: BudgetRow,
  carryInCents: number,
): AssignEnvelope {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    hidden: row.hidden,
    status: row.bill?.status ?? "active",
    target: row.target,
    assignedCents: row.assignedCents,
    activityCents: row.activityCents,
    balanceCents: row.balanceCents,
    carryInCents,
    snoozed: row.snoozed,
    contributedBeforeCents: row.contributedBeforeCents,
    nextDueKey: row.nextDueKey,
  };
}

export function inspectorBills(row: BudgetRow): ReadonlyMap<string, BillSnapshot> {
  const snapshot = billSnapshotFromRow(row);
  return snapshot ? new Map([[snapshot.id, snapshot]]) : new Map();
}

/**
 * Target section chrome: this month's Underfunded ask, overall progress, and the
 * bar fraction the grid already drew. Does not invent a second demand.
 */
export function targetPaneView(
  row: BudgetRow,
  carryInCents: number,
  month: MonthKey,
  indicator: EnvelopeIndicator,
): TargetPaneView {
  const envelope = inspectorAssignEnvelope(row, carryInCents);
  return {
    showAssignCallout: !row.isIncome && indicator.moreNeededCents > 0,
    assignThisMonthCents: indicator.moreNeededCents,
    progress: targetProgress(envelope, month, inspectorBills(row)),
    fill01: indicator.bar?.fill01 ?? null,
  };
}

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

/**
 * Whether this bill's charge dates come from its declared due day rather than from a walk.
 *
 * `BillFacet` allows a null `cadenceMonths` (an ordinary envelope's shape), which
 * `declaresSchedule` does not; this is the one place the two meet.
 */
export function declaresBillSchedule(bill: BillFacet): boolean {
  return (
    bill.cadenceMonths !== null &&
    declaresSchedule({ ...bill, cadenceMonths: bill.cadenceMonths })
  );
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
