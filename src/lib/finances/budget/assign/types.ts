/**
 * Auto-assign options and the preview/write payload they share.
 *
 * Spec: `agent-os/specs/2026-08-24-1311-budget-assign-options/`.
 */

import type { EnvelopeKind, EnvelopeStatus } from "@/db/schema";
import type { MonthKey } from "../envelope";
import type { Target } from "../targets/types";

export const ASSIGN_OPTIONS = [
  "underfunded",
  "assigned-last-month",
  "spent-last-month",
  "average-assigned",
  "average-spent",
  "reduce-overfunding",
  "reset-available",
  "reset-assigned",
] as const;

export type AssignOption = (typeof ASSIGN_OPTIONS)[number];

export const ASSIGN_OPTION_LABELS: Record<AssignOption, string> = {
  underfunded: "Underfunded",
  "assigned-last-month": "Assigned Last Month",
  "spent-last-month": "Spent Last Month",
  "average-assigned": "Average Assigned",
  "average-spent": "Average Spent",
  "reduce-overfunding": "Reduce Overfunding",
  "reset-available": "Reset Available Amounts",
  "reset-assigned": "Reset Assigned Amounts",
};

/** How many prior months Average Assigned / Average Spent look at (excluding current). */
export const ASSIGN_AVERAGE_MONTHS = 12;

export type AssignEnvelope = {
  id: string;
  name: string;
  kind: EnvelopeKind;
  hidden: boolean;
  /** Bills carry a status; other envelopes are treated as active. */
  status: EnvelopeStatus;
  target: Target | null;
  assignedCents: number;
  activityCents: number;
  balanceCents: number;
  carryInCents: number;
  nextDueKey: string | null;
};

export type AssignHistoryMonth = {
  month: MonthKey;
  assigned: Readonly<Record<string, number>>;
  activity: Readonly<Record<string, number>>;
};

export type AssignLineStatus = "full" | "partial" | "skipped" | "reduced";

export type AssignLine = {
  categoryId: string;
  name: string;
  fromAssignedCents: number;
  toAssignedCents: number;
  deltaCents: number;
  status: AssignLineStatus;
};

export type AssignError = {
  categoryId: string;
  categoryName: string;
  message: string;
};

export type AssignAllocation = {
  categoryId: string;
  amountCents: number;
  goalCents?: number;
};

export type AssignResult = {
  option: AssignOption;
  lines: AssignLine[];
  allocations: AssignAllocation[];
  remainingRtaCents: number;
  /** Unclamped money this option would consume from RTA (Auto-list figure). */
  listAmountCents: number;
  partialCount: number;
  skippedCount: number;
  fullCount: number;
  reducedCount: number;
  shortfall: boolean;
  errors: AssignError[];
  note: string;
};
