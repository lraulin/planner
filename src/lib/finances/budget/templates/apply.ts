/**
 * Apply / overwrite templates against one month, as a pure function.
 *
 * **Reimplemented from Actual Budget** — `computeTemplates` / `processTemplate` in
 * `packages/loot-core/src/server/budget/goal-template.ts` (MIT, © James Long). Demand
 * templates (simple, by) and bill envelopes write absolute Assigned amounts and may drive
 * Ready to Assign negative. Remainder runs last and only consumes leftover RTA > 0.
 *
 * **A bill envelope (`kind === "bill"`) participates even with an empty `templates` array.**
 * Its demand is intrinsic to its own cadence (`billFundingDemand` in `./schedule`), not
 * declared as a template line — `agent-os/specs/2026-08-23-2313-one-budget/` D4 retired the
 * `schedule` template type that used to carry this.
 *
 * Spec: `agent-os/specs/2026-08-22-2242-budget-goal-templates/` D2 and D4.
 */

import { formatUsd } from "@/lib/finances/money";
import { monthName, type MonthKey } from "../envelope";
import type { EnvelopeKind } from "@/db/schema";
import { runBy } from "./by";
import { distributeRemainder } from "./remainder";
import { billFundingDemand, type BillSnapshot } from "./schedule";
import { applyLimit, limitOf, runSimple } from "./simple";
import {
  assertCents,
  type ByTemplate,
  type RemainderTemplate,
  type SimpleTemplate,
  type Template,
} from "./types";

export type EnvelopeApplyInput = {
  id: string;
  name: string;
  isIncome: boolean;
  kind: EnvelopeKind;
  templates: readonly Template[];
  assignedCents: number;
  /** Carry-in into this month: previous balance if carryover, else max(0, previous). */
  carryInCents: number;
};

export type ApplyOptions = {
  month: MonthKey;
  envelopes: readonly EnvelopeApplyInput[];
  bills: ReadonlyMap<string, BillSnapshot>;
  readyToAssignCents: number;
  /** Overwrite: replace Assigned on every templated envelope. Apply: only empty cells. */
  force: boolean;
  /** When set, only these envelopes (still honouring force / income / empty). */
  categoryIds?: readonly string[];
  todayKey: string;
};

export type ApplyAllocation = {
  categoryId: string;
  amountCents: number;
  goalCents: number;
};

export type ApplyError = {
  categoryId: string;
  categoryName: string;
  message: string;
};

export type ApplyResult = {
  allocations: ApplyAllocation[];
  errors: ApplyError[];
  note: string;
};

function onDay(todayKey: string): string {
  return `on ${monthName(todayKey)} ${Number(todayKey.slice(8, 10))}`;
}

function selected(envelope: EnvelopeApplyInput, options: ApplyOptions): boolean {
  if (envelope.isIncome) return false;
  if (envelope.kind !== "bill" && envelope.templates.length === 0) return false;
  if (options.categoryIds && !options.categoryIds.includes(envelope.id)) return false;
  if (!options.force && envelope.assignedCents !== 0) return false;
  return true;
}

function simples(templates: readonly Template[]): SimpleTemplate[] {
  return templates.filter((t): t is SimpleTemplate => t.type === "simple");
}
function bys(templates: readonly Template[]): ByTemplate[] {
  return templates.filter((t): t is ByTemplate => t.type === "by");
}
function remainders(templates: readonly Template[]): RemainderTemplate[] {
  return templates.filter((t): t is RemainderTemplate => t.type === "remainder");
}

function demandOf(
  envelope: EnvelopeApplyInput,
  options: ApplyOptions,
): { amount: number; errors: string[] } {
  const carryIn = assertCents(envelope.carryInCents, "carry-in");
  let amount = 0;
  const errors: string[] = [];

  for (const template of simples(envelope.templates)) {
    amount += runSimple(template, carryIn);
  }
  const byTemplates = bys(envelope.templates);
  if (byTemplates.length > 0) {
    amount += runBy(byTemplates, options.month, carryIn).toBudget;
  }
  if (envelope.kind === "bill") {
    const snapshot = options.bills.get(envelope.id);
    if (!snapshot) {
      errors.push("Bill has no next-due date yet");
    } else {
      const demand = billFundingDemand(snapshot, options.month, carryIn);
      amount += demand.toBudgetCents;
      if (demand.error) errors.push(demand.error);
    }
  }

  amount = applyLimit(amount, carryIn, 0, limitOf(simples(envelope.templates)));
  return { amount, errors };
}

export function applyTemplates(options: ApplyOptions): ApplyResult {
  assertCents(options.readyToAssignCents, "ready to assign");
  const participants = options.envelopes.filter((envelope) =>
    selected(envelope, options),
  );
  if (participants.length === 0) {
    return { allocations: [], errors: [], note: "" };
  }

  let available =
    options.readyToAssignCents +
    participants.reduce((sum, envelope) => sum + envelope.assignedCents, 0);

  const allocations: ApplyAllocation[] = [];
  const errors: ApplyError[] = [];
  const names: string[] = [];

  const remainderEnvelopes: {
    envelope: EnvelopeApplyInput;
    weight: number;
    demand: number;
  }[] = [];

  for (const envelope of participants) {
    const remainderLines = remainders(envelope.templates);
    const hasDemand =
      simples(envelope.templates).length + bys(envelope.templates).length > 0 ||
      envelope.kind === "bill";

    let demand = 0;
    if (hasDemand) {
      const ran = demandOf(envelope, options);
      demand = ran.amount;
      for (const message of ran.errors) {
        errors.push({ categoryId: envelope.id, categoryName: envelope.name, message });
      }
    }

    if (remainderLines.length > 0) {
      const weight = remainderLines.reduce((sum, line) => sum + line.weight, 0);
      remainderEnvelopes.push({ envelope, weight, demand });
    } else {
      allocations.push({
        categoryId: envelope.id,
        amountCents: demand,
        goalCents: demand,
      });
      available -= demand;
      names.push(`${envelope.name} ${formatUsd(demand)}`);
    }
  }

  const leftover = available;
  const shares = distributeRemainder(
    remainderEnvelopes.map((entry) => ({
      envelopeId: entry.envelope.id,
      weight: entry.weight,
    })),
    leftover,
  );

  for (const entry of remainderEnvelopes) {
    const extra = shares.get(entry.envelope.id) ?? 0;
    const amount = entry.demand + extra;
    allocations.push({
      categoryId: entry.envelope.id,
      amountCents: amount,
      goalCents: amount,
    });
    names.push(`${entry.envelope.name} ${formatUsd(amount)}`);
  }

  const verb = options.force ? "Overwrote with templates" : "Applied templates";
  const note =
    allocations.length === 0
      ? ""
      : `${verb}: ${names.join(", ")} ${onDay(options.todayKey)}`;

  return { allocations, errors, note };
}

/** Carry-in Actual feeds templates: negative without carryover counts as 0. */
export function templateCarryIn(
  previous: {
    balanceCents: number;
    carryover: boolean;
  } | null,
): number {
  if (!previous) return 0;
  if (previous.carryover) return previous.balanceCents;
  return Math.max(0, previous.balanceCents);
}
