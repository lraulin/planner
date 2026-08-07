import {
  nodeStateEnum,
  nodeTypeEnum,
  type NodeState,
  type NodeType,
  type PriorityLetter,
} from "@/db/schema";
import { daysInMonth } from "@/lib/dateMath";
import { PRIORITY_LETTERS } from "@/lib/priority/letterRank";
import { AgentError } from "./errors";

export function asObject(body: unknown): Record<string, unknown> {
  if (body === null || body === undefined) return {};
  if (typeof body !== "object" || Array.isArray(body)) {
    throw new AgentError("validation", "Request body must be a JSON object");
  }
  return body as Record<string, unknown>;
}

export function optionalString(
  obj: Record<string, unknown>,
  key: string,
): string | undefined {
  if (!(key in obj) || obj[key] === undefined) return undefined;
  if (typeof obj[key] !== "string") {
    throw new AgentError("validation", `${key} must be a string`);
  }
  return obj[key];
}

export function requireString(obj: Record<string, unknown>, key: string): string {
  const v = optionalString(obj, key);
  if (v === undefined || v.trim() === "") {
    throw new AgentError("validation", `${key} is required`);
  }
  return v;
}

export function optionalBoolean(
  obj: Record<string, unknown>,
  key: string,
): boolean | undefined {
  if (!(key in obj) || obj[key] === undefined) return undefined;
  if (typeof obj[key] !== "boolean") {
    throw new AgentError("validation", `${key} must be a boolean`);
  }
  return obj[key];
}

export function optionalNumber(
  obj: Record<string, unknown>,
  key: string,
): number | undefined {
  if (!(key in obj) || obj[key] === undefined || obj[key] === null) return undefined;
  if (typeof obj[key] !== "number" || Number.isNaN(obj[key])) {
    throw new AgentError("validation", `${key} must be a number`);
  }
  return obj[key];
}

export function optionalNullableString(
  obj: Record<string, unknown>,
  key: string,
): string | null | undefined {
  if (!(key in obj)) return undefined;
  if (obj[key] === null) return null;
  if (typeof obj[key] !== "string") {
    throw new AgentError("validation", `${key} must be a string or null`);
  }
  return obj[key];
}

/** A leading calendar day, whether the string is `2026-06-31` or `2026-06-31T09:00:00Z`. */
const LEADING_DAY = /^(\d{4})-(\d{2})-(\d{2})(?=$|[T ])/;

/**
 * A date that does not exist is a *rejection*, not a date two days later.
 *
 * `new Date("2026-06-31")` is not Invalid Date — it is July 1. June has thirty days, so the
 * extra one rolls over, and the caller is told nothing. That is the wrong answer for an
 * interface driven by an agent: asked for a month-end deadline it will sometimes produce
 * `06-31`, and silently getting July back is worse than being told to count again.
 *
 * Only the calendar day is checked. The time part is left to `Date`, which does clamp
 * sensibly there and has no equivalent trap.
 */
export function parseDate(
  value: string | null | undefined,
  field: string,
): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;

  const day = LEADING_DAY.exec(value);
  if (day) {
    const [, year, month, date] = day.map(Number);
    if (month < 1 || month > 12 || date < 1 || date > daysInMonth(year, month)) {
      throw new AgentError(
        "validation",
        `${field} is not a date that exists: ${value}`,
      );
    }
  }

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new AgentError("validation", `${field} must be a valid ISO date`);
  }
  return d;
}

/**
 * Taken from the schema and from `letterRank`, never re-typed.
 *
 * These were three hand-written copies. They happened to agree, and that is the problem: the
 * compiler cannot see a *missing* member, only a wrong one. Add a tenth state to
 * `nodeStateEnum` and every grid, filter and form picks it up, while the agent API alone
 * answers `state must be one of: …` and lists nine — a rejection that reads like the caller's
 * mistake. Same reason `maintenance.ts` stopped carrying its own letters.
 */
const NODE_TYPES: readonly NodeType[] = nodeTypeEnum.enumValues;
const NODE_STATES: readonly NodeState[] = nodeStateEnum.enumValues;

export function parseNodeType(value: unknown, field = "type"): NodeType {
  if (typeof value !== "string" || !NODE_TYPES.includes(value as NodeType)) {
    throw new AgentError(
      "validation",
      `${field} must be one of: ${NODE_TYPES.join(", ")}`,
    );
  }
  return value as NodeType;
}

export function parseNodeState(value: unknown, field = "state"): NodeState {
  if (typeof value !== "string" || !NODE_STATES.includes(value as NodeState)) {
    throw new AgentError(
      "validation",
      `${field} must be one of: ${NODE_STATES.join(", ")}`,
    );
  }
  return value as NodeState;
}

export function parsePriorityLetter(
  value: unknown,
  field = "priorityLetter",
): PriorityLetter | null {
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    !PRIORITY_LETTERS.includes(value as PriorityLetter)
  ) {
    throw new AgentError("validation", `${field} must be A, B, C, D, or null`);
  }
  return value as PriorityLetter;
}

export function optionalStringArray(
  obj: Record<string, unknown>,
  key: string,
): string[] | undefined {
  if (!(key in obj) || obj[key] === undefined) return undefined;
  const v = obj[key];
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) {
    throw new AgentError("validation", `${key} must be an array of strings`);
  }
  return v;
}
