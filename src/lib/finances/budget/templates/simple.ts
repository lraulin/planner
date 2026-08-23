/**
 * Simple and refill templates, plus the category-level `up to` clamp.
 *
 * **Reimplemented from Actual Budget** — `runSimple` in
 * `packages/loot-core/src/server/budget/category-template-context.ts` (MIT, © James Long).
 *
 * Spec: `agent-os/specs/2026-08-22-2242-budget-goal-templates/` D1.
 */

import { assertCents, type SimpleTemplate, type TemplateLimit } from "./types";

/**
 * What one simple line wants to assign this month, before the category `up to` clamp.
 *
 * A monthly amount is that amount, even when carry-in is already higher — it is not a
 * refill. Monthly omitted is the refill case: `limit − carry-in`.
 */
export function runSimple(template: SimpleTemplate, carryInCents: number): number {
  assertCents(carryInCents, "carry-in");
  if (template.monthlyCents !== undefined) {
    return assertCents(template.monthlyCents, "simple monthly");
  }
  if (!template.limit) return 0;
  return assertCents(template.limit.amountCents, "simple limit") - carryInCents;
}

/**
 * After summing a category's demand, clamp so carry-in + assigned does not exceed `up to`.
 *
 * `hold` means do not *remove* funds already over the cap — assign 0 rather than a
 * negative. Without hold, a negative result pulls money back out of the envelope.
 */
export function applyLimit(
  toBudget: number,
  carryInCents: number,
  alreadyBudgeted: number,
  limit: TemplateLimit | undefined,
): number {
  if (!limit) return toBudget;
  assertCents(limit.amountCents, "limit");
  const projected = toBudget + alreadyBudgeted + carryInCents;
  if (projected < limit.amountCents) return toBudget;
  const next = limit.amountCents - alreadyBudgeted - carryInCents;
  if (next < 0 && limit.hold) return 0;
  return next;
}

export function limitOf(
  templates: readonly SimpleTemplate[],
): TemplateLimit | undefined {
  return templates.find((template) => template.limit)?.limit;
}
