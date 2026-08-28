/**
 * The one target an envelope may hold.
 *
 * **Reimplemented from YNAB**, not from Actual Budget. Actual's `goal_def` is a *list* of typed
 * template lines whose job (refill vs set aside) is implied by which optional fields are
 * present; every complication that list bought — `priority`, summing, a sibling line's `up to`
 * clamping the whole envelope — exists to resolve conflicts between lines that should never
 * have coexisted. YNAB allows a category exactly one target and makes behaviour and cadence
 * explicit axes. An envelope that genuinely wants two asks is two envelopes.
 *
 * We take YNAB's mechanics and not its vocabulary: there is no "refill vs set aside" toggle,
 * only the seven sentences of D2.
 *
 * Money is **integer cents** throughout, asserted — the one divergence from Actual that
 * survives this rewrite.
 *
 * Spec: `agent-os/specs/2026-08-28-1000-ynab-target-engine/` D1, D2.
 */

import { weekdayLongLabel } from "@/lib/dateFormat";
import { formatUsd } from "@/lib/finances/money";
import { monthLabel, monthName, type MonthKey } from "../envelope";

export const TARGET_BEHAVIORS = ["add", "upTo", "balance"] as const;
export type TargetBehavior = (typeof TARGET_BEHAVIORS)[number];

export const CADENCE_UNITS = [
  "week",
  "month",
  "year",
  "by",
  "none",
  "schedule",
] as const;
export type CadenceUnit = (typeof CADENCE_UNITS)[number];

export type Cadence =
  /** 0 = Sunday … 6 = Saturday, the `weekdayOfDateKey` convention (`standards/development/dates.md`). */
  | { unit: "week"; weekday: number }
  /** 1–31, clamped to the month's end. */
  | { unit: "month"; day: number }
  /** 1–12, the month it is needed by. */
  | { unit: "year"; month: number }
  /** `YYYY-MM`, a one-time deadline. */
  | { unit: "by"; month: MonthKey }
  /** No deadline. */
  | { unit: "none" }
  /** Derived only — the bill's own cadence. Never user-selectable. */
  | { unit: "schedule" };

export type Target = {
  behavior: TargetBehavior;
  cadence: Cadence;
  /** Integer cents, > 0. */
  amountCents: number;
};

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * The legal `behavior` × `cadence.unit` matrix (D2). **This table lives here and nowhere
 * else** — a second copy is how a pairing gets accepted by the parser and then crashes the
 * evaluator, which has no arm for it.
 *
 * The omissions are deliberate. `add` + `year` / `add` + `by` would need "assigned since the
 * cycle started" to know how much of the cycle's contribution has landed, and nothing stores
 * that; a flat twelfth is honest but identical to writing `add` + `month`. `balance` + a
 * repeating cadence *is* `upTo` — the only difference between them is what happens after the
 * anchor passes.
 */
const LEGAL: Record<TargetBehavior, readonly CadenceUnit[]> = {
  add: ["month", "week"],
  upTo: ["month", "week", "year", "schedule"],
  balance: ["by", "none"],
};

export function isLegalPairing(behavior: TargetBehavior, unit: CadenceUnit): boolean {
  return LEGAL[behavior]?.includes(unit) ?? false;
}

export function assertCents(value: number, what: string): number {
  if (!Number.isInteger(value)) {
    throw new Error(`${what} must be integer cents, got ${value}`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIntIn(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
  );
}

function parseCadence(raw: unknown, allowSchedule: boolean): Cadence | null {
  if (!isRecord(raw)) return null;
  switch (raw.unit) {
    case "week":
      return isIntIn(raw.weekday, 0, 6) ? { unit: "week", weekday: raw.weekday } : null;
    case "month":
      return isIntIn(raw.day, 1, 31) ? { unit: "month", day: raw.day } : null;
    case "year":
      return isIntIn(raw.month, 1, 12) ? { unit: "year", month: raw.month } : null;
    case "by":
      return typeof raw.month === "string" && MONTH.test(raw.month)
        ? { unit: "by", month: raw.month }
        : null;
    case "none":
      return { unit: "none" };
    case "schedule":
      // Only the bill deriver may produce this; a stored one means someone hand-edited JSONB.
      return allowSchedule ? { unit: "schedule" } : null;
    default:
      return null;
  }
}

/**
 * Parse stored JSONB into a target. Returns null when the blob is not usable — callers must
 * not hand garbage to the evaluator.
 *
 * `allowSchedule` is off by default so a user-supplied `schedule` cadence is rejected; only
 * `targets/derive.ts` builds one, and it builds the object directly.
 */
export function parseTarget(raw: unknown, allowSchedule = false): Target | null {
  if (!isRecord(raw)) return null;
  const behavior = raw.behavior;
  if (typeof behavior !== "string") return null;
  if (!(TARGET_BEHAVIORS as readonly string[]).includes(behavior)) return null;
  const cadence = parseCadence(raw.cadence, allowSchedule);
  if (!cadence) return null;
  if (!isLegalPairing(behavior as TargetBehavior, cadence.unit)) return null;
  if (
    typeof raw.amountCents !== "number" ||
    !Number.isInteger(raw.amountCents) ||
    raw.amountCents <= 0
  ) {
    return null;
  }
  return {
    behavior: behavior as TargetBehavior,
    cadence,
    amountCents: raw.amountCents,
  };
}

export function parseTargetOrThrow(raw: unknown): Target {
  const parsed = parseTarget(raw);
  if (!parsed) throw new Error("That target is not valid.");
  return parsed;
}

/** `null` and `undefined` pass through; anything else must parse. */
export function parseNullableTargetOrThrow(raw: unknown): Target | null {
  if (raw === null || raw === undefined) return null;
  return parseTargetOrThrow(raw);
}

/**
 * The one-line sentence the UI shows. D2's table, in the app's own words — deliberately not
 * YNAB's "refill" / "set aside", which is the vocabulary that made the choice read as a puzzle.
 */
export function summarize(target: Target): string {
  const amount = formatUsd(target.amountCents);
  const { behavior, cadence } = target;
  switch (cadence.unit) {
    case "week": {
      const day = weekdayLongLabel(cadence.weekday);
      return behavior === "add"
        ? `Add ${amount} each ${day}`
        : `Have ${amount} available each ${day}`;
    }
    case "month":
      return behavior === "add"
        ? `Add ${amount} every month`
        : `Have ${amount} available each month`;
    case "year":
      return `Have ${amount} available each year by ${monthName(`2000-${String(cadence.month).padStart(2, "0")}-01`)}`;
    case "by":
      return `Have ${amount} available by ${monthLabel(cadence.month)}`;
    case "none":
      return `Have ${amount} available (no deadline)`;
    case "schedule":
      return `Have ${amount} available for each charge`;
  }
}
