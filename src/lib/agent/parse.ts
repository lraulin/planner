import type { NodeState, NodeType, PriorityLetter } from "@/db/schema";
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

export function parseDate(
  value: string | null | undefined,
  field: string,
): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new AgentError("validation", `${field} must be a valid ISO date`);
  }
  return d;
}

const NODE_TYPES: NodeType[] = ["result_area", "goal", "project", "task"];
const NODE_STATES: NodeState[] = [
  "not_started",
  "in_progress",
  "waiting",
  "completed",
  "cancelled",
  "postponed",
  "delegated",
  "should_delegate",
  "proposed",
];
const PRIORITY_LETTERS: PriorityLetter[] = ["A", "B", "C", "D"];

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
