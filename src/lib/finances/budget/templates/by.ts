/**
 * Save-by-a-date templates.
 *
 * **Reimplemented from Actual Budget** — `runBy` in
 * `packages/loot-core/src/server/budget/category-template-context.ts` (MIT, © James Long).
 * Two `by` lines on one envelope share the shortest remaining window. A repeating target
 * that has passed walks forward by its period; a one-shot in the past requests 0.
 *
 * Spec: `agent-os/specs/2026-08-22-2242-budget-goal-templates/` D1.
 */

import { shiftMonthKey, type MonthKey } from "../envelope";
import { monthsBetween } from "./monthSpan";
import { assertCents, type ByTemplate } from "./types";

function periodMonths(template: ByTemplate): number | null {
  if (template.annual) return (template.repeat ?? 1) * 12;
  return template.repeat ?? null;
}

function targetMonthKey(template: ByTemplate): MonthKey {
  return `${template.month}-01`;
}

/**
 * Months from `month` until this template's next due month, walking a repeating period
 * forward. `null` means a one-shot that is already in the past — request nothing.
 */
export function monthsUntilBy(template: ByTemplate, month: MonthKey): number | null {
  let target = targetMonthKey(template);
  let remaining = monthsBetween(month, target);
  const period = periodMonths(template);
  while (remaining < 0 && period) {
    target = shiftMonthKey(target, period);
    remaining = monthsBetween(month, target);
  }
  if (remaining < 0) return null;
  return remaining;
}

export function runBy(
  templates: readonly ByTemplate[],
  month: MonthKey,
  carryInCents: number,
): { toBudget: number; perTemplate: Map<string, number> } {
  assertCents(carryInCents, "carry-in");
  const windows: { template: ByTemplate; numMonths: number }[] = [];
  for (const template of templates) {
    assertCents(template.amountCents, "by amount");
    const numMonths = monthsUntilBy(template, month);
    if (numMonths === null) continue;
    windows.push({ template, numMonths });
  }

  const perTemplate = new Map<string, number>();
  if (windows.length === 0) return { toBudget: 0, perTemplate };

  const shortNumMonths = Math.min(...windows.map((entry) => entry.numMonths));
  let totalNeeded = 0;
  for (const { template, numMonths } of windows) {
    const period = periodMonths(template);
    let amount: number;
    if (numMonths > shortNumMonths && period) {
      amount = Math.round(
        (template.amountCents / period) * (period - numMonths + shortNumMonths),
      );
    } else if (numMonths > shortNumMonths) {
      amount = Math.round(
        (template.amountCents / (numMonths + 1)) * (shortNumMonths + 1),
      );
    } else {
      amount = template.amountCents;
    }
    perTemplate.set(template.id, amount);
    totalNeeded += amount;
  }

  const toBudget = Math.round((totalNeeded - carryInCents) / (shortNumMonths + 1));
  return { toBudget, perTemplate };
}
