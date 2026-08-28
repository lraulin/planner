/**
 * How an Actual template list becomes one YNAB target.
 *
 * The SQL migration is what rewrites live rows; this module is the same mapping in TypeScript
 * so a test can fail on a plausible conversion mistake (keeping a remainder, taking the
 * highest priority, treating `weekly` as `add`) without waiting for Postgres.
 *
 * `weekly` becomes `upTo` rather than `add` because that is the behaviour this spec exists
 * to deliver. `remainder` is dropped: leftover Ready to Assign stays in Ready to Assign.
 * More than one line keeps the lowest `priority`.
 *
 * Spec: `agent-os/specs/2026-08-28-1000-ynab-target-engine/` Task 6.
 */

import { parseTemplates, type Template } from "../templates/types";
import { parseTarget, type Target } from "./types";

export type TemplateCutover = {
  target: Target | null;
  /** Extra non-remainder lines after the one that was kept. */
  discarded: number;
  droppedRemainder: boolean;
};

/** Last day of any month — `month` cadence clamps 31 down when the month is shorter. */
const LAST_DAY = 31;

function amountOf(template: Template): Target | null {
  switch (template.type) {
    case "remainder":
      return null;
    case "simple": {
      if (
        template.monthlyCents !== undefined &&
        Number.isInteger(template.monthlyCents) &&
        template.monthlyCents > 0
      ) {
        return {
          behavior: "add",
          cadence: { unit: "month", day: LAST_DAY },
          amountCents: template.monthlyCents,
        };
      }
      const limit = template.limit?.amountCents;
      if (limit !== undefined && Number.isInteger(limit) && limit > 0) {
        return {
          behavior: "upTo",
          cadence: { unit: "month", day: LAST_DAY },
          amountCents: limit,
        };
      }
      return null;
    }
    case "weekly":
      return {
        behavior: "upTo",
        cadence: { unit: "week", weekday: template.weekday },
        amountCents: template.amountCents,
      };
    case "by": {
      if (!Number.isInteger(template.amountCents) || template.amountCents <= 0) {
        return null;
      }
      if (template.annual) {
        const month = Number(template.month.slice(5, 7));
        return {
          behavior: "upTo",
          cadence: { unit: "year", month },
          amountCents: template.amountCents,
        };
      }
      return {
        behavior: "balance",
        cadence: { unit: "by", month: template.month },
        amountCents: template.amountCents,
      };
    }
  }
}

function priorityOf(template: Template): number {
  return template.type === "remainder" ? Number.POSITIVE_INFINITY : template.priority;
}

/**
 * Pick one target from a stored `templates` JSONB array. Unparseable input is treated as
 * empty — a garbage list must not invent an ask.
 */
export function targetFromTemplates(raw: unknown): TemplateCutover {
  const templates = parseTemplates(raw) ?? [];
  const droppedRemainder = templates.some((line) => line.type === "remainder");
  const ranked = templates
    .map((template, index) => ({ template, index, priority: priorityOf(template) }))
    .filter((entry) => entry.template.type !== "remainder")
    .sort((left, right) =>
      left.priority !== right.priority
        ? left.priority - right.priority
        : left.index - right.index,
    );

  let kept: Target | null = null;
  let used = 0;
  for (const entry of ranked) {
    const converted = amountOf(entry.template);
    const parsed = converted ? parseTarget(converted) : null;
    if (!parsed) continue;
    if (!kept) kept = parsed;
    used += 1;
  }

  return {
    target: kept,
    discarded: Math.max(0, used - (kept ? 1 : 0)),
    droppedRemainder,
  };
}
