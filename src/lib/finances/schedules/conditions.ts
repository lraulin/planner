/**
 * Schedule conditions in Actual's `{field, op, value}` shape, restricted to the four
 * schedule fields.
 *
 * **Reimplemented from Actual Budget** — `extractScheduleConds` in
 * `packages/loot-core/src/shared/schedules.ts`, `getScheduledAmount` there, and
 * `getApproxNumberThreshold` in `packages/loot-core/src/shared/rules.ts` (MIT, © James Long).
 * We do not port the generic rule engine; this module is the validating parse so bad JSONB
 * never reaches the recurrence math or the matcher.
 *
 * Amount values are **signed integer cents, positive is money in**, matching
 * `finance_transactions`. A $50 bill is `-5000`.
 *
 * Spec: `agent-os/specs/2026-08-22-2124-actual-schedules/` D1. `payee oneOf` is a small
 * widening of Actual's `payee is`, so one schedule can span both spellings of a merchant
 * the way bills already do.
 */

import type { RecurConfig } from "./recur";

export type AmountRange = { num1: number; num2: number };

export type PayeeCondition =
  | { field: "payee"; op: "is"; value: string }
  | { field: "payee"; op: "oneOf"; value: string[] };

export type AccountCondition = { field: "account"; op: "is"; value: string };

export type AmountCondition =
  | { field: "amount"; op: "is"; value: number }
  | { field: "amount"; op: "isapprox"; value: number }
  | { field: "amount"; op: "isbetween"; value: AmountRange };

export type DateCondition =
  | { field: "date"; op: "is"; value: RecurConfig | string }
  | { field: "date"; op: "isapprox"; value: RecurConfig | string };

export type ScheduleCondition =
  PayeeCondition | AccountCondition | AmountCondition | DateCondition;

export type ScheduleConds = {
  payee: PayeeCondition | null;
  account: AccountCondition | null;
  amount: AmountCondition | null;
  date: DateCondition | null;
};

const FREQUENCIES = new Set(["daily", "weekly", "monthly", "yearly"]);
const END_MODES = new Set(["never", "after_n_occurrences", "on_date"]);
const WEEKEND_MODES = new Set(["before", "after"]);
const PATTERN_TYPES = new Set(["SU", "MO", "TU", "WE", "TH", "FR", "SA", "day"]);
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDateKey(value: unknown): value is string {
  return typeof value === "string" && DATE_KEY.test(value);
}

function isIntegerCents(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function parseRecurConfig(value: unknown): RecurConfig | null {
  if (!isRecord(value)) return null;
  if (typeof value.frequency !== "string" || !FREQUENCIES.has(value.frequency)) {
    return null;
  }
  if (!isDateKey(value.start)) return null;
  const config: RecurConfig = {
    frequency: value.frequency as RecurConfig["frequency"],
    start: value.start,
  };
  if (value.interval !== undefined) {
    if (typeof value.interval !== "number" || !Number.isInteger(value.interval)) {
      return null;
    }
    config.interval = value.interval;
  }
  if (value.skipWeekend !== undefined) {
    if (typeof value.skipWeekend !== "boolean") return null;
    config.skipWeekend = value.skipWeekend;
  }
  if (value.endMode !== undefined) {
    if (typeof value.endMode !== "string" || !END_MODES.has(value.endMode)) return null;
    config.endMode = value.endMode as RecurConfig["endMode"];
  }
  if (value.endOccurrences !== undefined) {
    if (
      typeof value.endOccurrences !== "number" ||
      !Number.isInteger(value.endOccurrences)
    ) {
      return null;
    }
    config.endOccurrences = value.endOccurrences;
  }
  if (value.endDate !== undefined) {
    if (!isDateKey(value.endDate)) return null;
    config.endDate = value.endDate;
  }
  if (value.weekendSolveMode !== undefined) {
    if (
      typeof value.weekendSolveMode !== "string" ||
      !WEEKEND_MODES.has(value.weekendSolveMode)
    ) {
      return null;
    }
    config.weekendSolveMode = value.weekendSolveMode as RecurConfig["weekendSolveMode"];
  }
  if (value.patterns !== undefined) {
    if (!Array.isArray(value.patterns)) return null;
    const patterns: RecurConfig["patterns"] = [];
    for (const entry of value.patterns) {
      if (!isRecord(entry)) return null;
      if (typeof entry.type !== "string" || !PATTERN_TYPES.has(entry.type)) return null;
      if (
        typeof entry.value !== "number" ||
        !Number.isInteger(entry.value) ||
        entry.value === 0
      ) {
        return null;
      }
      patterns.push({
        type: entry.type as NonNullable<RecurConfig["patterns"]>[number]["type"],
        value: entry.value,
      });
    }
    config.patterns = patterns;
  }
  return config;
}

function parsePayee(raw: Record<string, unknown>): PayeeCondition | null {
  if (raw.op === "is") {
    if (typeof raw.value !== "string" || raw.value === "") return null;
    return { field: "payee", op: "is", value: raw.value };
  }
  if (raw.op === "oneOf") {
    if (!Array.isArray(raw.value) || raw.value.length === 0) return null;
    if (!raw.value.every((entry) => typeof entry === "string" && entry !== ""))
      return null;
    return { field: "payee", op: "oneOf", value: raw.value };
  }
  return null;
}

function parseAccount(raw: Record<string, unknown>): AccountCondition | null {
  if (raw.op !== "is") return null;
  if (typeof raw.value !== "string" || raw.value === "") return null;
  return { field: "account", op: "is", value: raw.value };
}

function parseAmount(raw: Record<string, unknown>): AmountCondition | null {
  if (raw.op === "is" || raw.op === "isapprox") {
    if (!isIntegerCents(raw.value)) return null;
    return { field: "amount", op: raw.op, value: raw.value };
  }
  if (raw.op === "isbetween") {
    if (!isRecord(raw.value)) return null;
    if (!isIntegerCents(raw.value.num1) || !isIntegerCents(raw.value.num2)) return null;
    return {
      field: "amount",
      op: "isbetween",
      value: { num1: raw.value.num1, num2: raw.value.num2 },
    };
  }
  return null;
}

function parseDate(raw: Record<string, unknown>): DateCondition | null {
  if (raw.op !== "is" && raw.op !== "isapprox") return null;
  if (isDateKey(raw.value)) {
    return { field: "date", op: raw.op, value: raw.value };
  }
  const recur = parseRecurConfig(raw.value);
  if (!recur) return null;
  return { field: "date", op: raw.op, value: recur };
}

function parseOne(raw: unknown): ScheduleCondition | null {
  if (!isRecord(raw) || typeof raw.field !== "string" || typeof raw.op !== "string") {
    return null;
  }
  switch (raw.field) {
    case "payee":
      return parsePayee(raw);
    case "account":
      return parseAccount(raw);
    case "amount":
      return parseAmount(raw);
    case "date":
      return parseDate(raw);
    default:
      return null;
  }
}

/**
 * Parse stored JSONB into schedule conditions. Returns null when the blob is not a
 * usable list — callers must not pass garbage to the matcher or the recurrence engine.
 */
export function parseConditions(raw: unknown): ScheduleCondition[] | null {
  if (!Array.isArray(raw)) return null;
  const parsed: ScheduleCondition[] = [];
  for (const entry of raw) {
    const condition = parseOne(entry);
    if (!condition) return null;
    parsed.push(condition);
  }
  return parsed;
}

/** First matching condition per field, Actual's `extractScheduleConds`. */
export function extractScheduleConds(
  conditions: readonly ScheduleCondition[],
): ScheduleConds {
  const payee =
    conditions.find((c): c is PayeeCondition => c.field === "payee") ?? null;
  const account =
    conditions.find((c): c is AccountCondition => c.field === "account") ?? null;
  const amount =
    conditions.find((c): c is AmountCondition => c.field === "amount") ?? null;
  const date = conditions.find((c): c is DateCondition => c.field === "date") ?? null;
  return { payee, account, amount, date };
}

export function dateConfigOf(date: DateCondition | null): RecurConfig | null {
  if (!date) return null;
  if (typeof date.value === "string") return null;
  return date.value;
}

/**
 * 7.5% of the absolute amount, rounded — Actual's `getApproxNumberThreshold`.
 * The tolerance behind every "is this the bill?" decision.
 */
export function approxThreshold(n: number): number {
  return Math.round(Math.abs(n) * 0.075);
}

export function amountMatches(condition: AmountCondition, cents: number): boolean {
  if (condition.op === "is") return cents === condition.value;
  if (condition.op === "isapprox") {
    const threshold = approxThreshold(condition.value);
    return cents >= condition.value - threshold && cents <= condition.value + threshold;
  }
  const lo = Math.min(condition.value.num1, condition.value.num2);
  const hi = Math.max(condition.value.num1, condition.value.num2);
  return cents >= lo && cents <= hi;
}

/** Midpoint of a range, or the exact amount. Zero when there is no amount condition. */
export function getScheduledAmount(amount: AmountCondition | null): number {
  if (!amount) return 0;
  if (amount.op === "isbetween") {
    return Math.round((amount.value.num1 + amount.value.num2) / 2);
  }
  return amount.value;
}

export function payeeValues(payee: PayeeCondition | null): string[] {
  if (!payee) return [];
  return payee.op === "is" ? [payee.value] : payee.value;
}
