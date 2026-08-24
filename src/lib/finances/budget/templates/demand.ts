/**
 * How much an envelope asks to have Assigned this month.
 *
 * Shared by the templates editor preview and by Underfunded / Reduce Overfunding.
 * Bill envelopes participate with an empty `templates` array — cadence is the ask
 * (`agent-os/specs/2026-08-23-2313-one-budget/` D4).
 *
 * Spec: `agent-os/specs/2026-08-24-1311-budget-assign-options/` D3.
 */

import type { EnvelopeKind } from "@/db/schema";
import type { MonthKey } from "../envelope";
import { runBy } from "./by";
import { billFundingDemand, type BillSnapshot } from "./schedule";
import { applyLimit, limitOf, runSimple } from "./simple";
import {
  assertCents,
  type ByTemplate,
  type RemainderTemplate,
  type SimpleTemplate,
  type Template,
} from "./types";

export type DemandEnvelope = {
  id: string;
  name: string;
  kind: EnvelopeKind;
  templates: readonly Template[];
  carryInCents: number;
};

export function simples(templates: readonly Template[]): SimpleTemplate[] {
  return templates.filter((t): t is SimpleTemplate => t.type === "simple");
}

export function bys(templates: readonly Template[]): ByTemplate[] {
  return templates.filter((t): t is ByTemplate => t.type === "by");
}

export function remainders(templates: readonly Template[]): RemainderTemplate[] {
  return templates.filter((t): t is RemainderTemplate => t.type === "remainder");
}

/** Bill cadence or a simple/`by` line — remainder is leftover, not an ask. */
export function hasDemandAsk(envelope: {
  kind: EnvelopeKind;
  templates: readonly Template[];
}): boolean {
  return (
    envelope.kind === "bill" ||
    simples(envelope.templates).length + bys(envelope.templates).length > 0
  );
}

export function remainderWeight(templates: readonly Template[]): number {
  return remainders(templates).reduce((sum, line) => sum + line.weight, 0);
}

export function demandOf(
  envelope: DemandEnvelope,
  month: MonthKey,
  bills: ReadonlyMap<string, BillSnapshot>,
): { amount: number; errors: string[] } {
  const carryIn = assertCents(envelope.carryInCents, "carry-in");
  let amount = 0;
  const errors: string[] = [];

  for (const template of simples(envelope.templates)) {
    amount += runSimple(template, carryIn);
  }
  const byTemplates = bys(envelope.templates);
  if (byTemplates.length > 0) {
    amount += runBy(byTemplates, month, carryIn).toBudget;
  }
  if (envelope.kind === "bill") {
    const snapshot = bills.get(envelope.id);
    if (!snapshot) {
      errors.push("Bill has no next-due date yet");
    } else {
      const demand = billFundingDemand(snapshot, month, carryIn);
      amount += demand.toBudgetCents;
      if (demand.error) errors.push(demand.error);
    }
  }

  amount = applyLimit(amount, carryIn, 0, limitOf(simples(envelope.templates)));
  return { amount, errors };
}
