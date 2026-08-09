/**
 * Parse `create_node` / `update_node` bodies into a `NodeDetailPatch` for `saveNodeDetail`.
 *
 * The agent can send every form field the drawer can save. Nested objects (`project`,
 * `task`, `goal`, `resultArea`) match the form halves; core fields stay top-level. Empty
 * is fine — only keys that are present are written.
 */

import {
  GOAL_KEYS,
  PROJECT_KEYS,
  RESULT_AREA_KEYS,
  TASK_KEYS,
} from "@/lib/detail/mutations";
import type { NodeDetailPatch, NodeDetailValues } from "@/lib/detail/types";
import { AgentError } from "./errors";
import {
  optionalBoolean,
  optionalNullableString,
  optionalNumber,
  optionalString,
  parseDate,
  parseNodeState,
  parsePriorityLetter,
} from "./parse";

const MONEY_KEYS = new Set([
  "expectedCost",
  "lowCost",
  "highCost",
  "costToDate",
  "costLow",
  "costHigh",
  "actualCost",
]);

const DATE_KEYS = new Set([
  "deadline",
  "targetStartDate",
  "targetEndDate",
  "deferredDate",
  "reminderAt",
  "plannedStart",
  "constraintDate",
  "recurrenceUntil",
  "actualStartDate",
  "dateCompleted",
]);

const BOOLEAN_KEYS = new Set([
  "focus",
  "effortDriven",
  "onlyShowNextTask",
  "recomputeTaskDeadlines",
  "isDream",
  "scorecard",
  "private",
  "milestone",
]);

const NUMBER_KEYS = new Set([
  "priorityRank",
  "importance",
  "leadTimeMinutes",
  "blockSizeMinutes",
  "timePerWeekMinutes",
  "effortMinutes",
  "effortLeftMinutes",
  "actualEffortMinutes",
  "percentComplete",
  "recurrenceInterval",
  "recurrenceMonthDay",
  "recurrenceOrdinal",
  "recurrenceWeekday",
  "recurrenceMonth",
  "recurrenceCount",
  "deadlineLeadTimeMinutes",
  "durationMinutes",
]);

const STRING_ARRAY_KEYS = new Set(["contexts", "recurrenceByWeekday"]);

const ENUM_KEYS: Record<string, readonly string[]> = {
  sensitivity: ["normal", "personal", "private", "confidential"],
  progressReview: ["none", "daily", "weekly"],
  recurrenceFrequency: ["none", "daily", "weekly", "monthly", "yearly"],
  recurrenceMode: ["scheduled", "regenerate"],
  recurrencePattern: [
    "interval",
    "weekday",
    "weekend",
    "by_weekday",
    "by_month_day",
    "by_ordinal",
  ],
  recurrenceEnd: ["never", "count", "until"],
  constraint: [
    "as_soon_as_possible",
    "as_late_as_possible",
    "start_no_earlier_than",
    "start_no_later_than",
    "finish_no_earlier_than",
    "finish_no_later_than",
    "must_start_on",
    "must_finish_on",
  ],
};

/**
 * Build a partial detail save from agent tool args.
 *
 * Top-level `effortMinutes` is still accepted (tasks only matter downstream) and merges
 * into `task.effortMinutes` when that nested key was not also sent — keeps older agent
 * calls working.
 */
export function parseNodeDetailPatch(args: Record<string, unknown>): NodeDetailPatch {
  const patch: NodeDetailPatch = {};

  if (args.name !== undefined) {
    const name = optionalString(args, "name");
    if (name === undefined) {
      throw new AgentError("validation", "name must be a string");
    }
    patch.name = name;
  }
  if (args.priorityLetter !== undefined) {
    patch.priorityLetter = parsePriorityLetter(args.priorityLetter);
  }
  if (args.priorityRank !== undefined) {
    if (args.priorityLetter === undefined) {
      throw new AgentError(
        "validation",
        "priorityRank requires priorityLetter in the same call",
      );
    }
    const rank = optionalNumber(args, "priorityRank");
    patch.priorityRank = rank === undefined ? null : rank;
  }
  if (args.state !== undefined) {
    patch.state = parseNodeState(args.state);
  }
  for (const key of [
    "deadline",
    "targetStartDate",
    "targetEndDate",
    "deferredDate",
  ] as const) {
    if (args[key] !== undefined) {
      const parsed = parseDate(optionalNullableString(args, key) ?? null, key);
      patch[key] = parsed === undefined ? null : parsed;
    }
  }
  if (args.focus !== undefined) {
    const focus = optionalBoolean(args, "focus");
    if (focus === undefined) {
      throw new AgentError("validation", "focus must be a boolean");
    }
    patch.focus = focus;
  }
  if (args.notes !== undefined) {
    const notes = optionalString(args, "notes");
    if (notes === undefined) {
      throw new AgentError("validation", "notes must be a string");
    }
    patch.notes = notes;
  }

  if (args.resultArea !== undefined) {
    patch.resultArea = parseSide(
      args.resultArea,
      RESULT_AREA_KEYS,
      "resultArea",
    ) as NodeDetailValues["resultArea"];
  }
  if (args.goal !== undefined) {
    patch.goal = parseSide(args.goal, GOAL_KEYS, "goal") as NodeDetailValues["goal"];
  }
  if (args.project !== undefined) {
    patch.project = parseSide(
      args.project,
      PROJECT_KEYS,
      "project",
    ) as NodeDetailValues["project"];
  }
  if (args.task !== undefined) {
    patch.task = parseSide(args.task, TASK_KEYS, "task") as NodeDetailValues["task"];
  }

  // Legacy top-level effort (create_node / update_node before full forms).
  if (args.effortMinutes !== undefined) {
    const effort = optionalNumber(args, "effortMinutes");
    const value = effort === undefined ? null : effort;
    if (!patch.task || !("effortMinutes" in patch.task)) {
      patch.task = { ...patch.task, effortMinutes: value };
    }
  }

  return patch;
}

/** True when the patch would write at least one column. */
export function detailPatchHasWrites(patch: NodeDetailPatch): boolean {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (key === "resultArea" || key === "goal" || key === "project" || key === "task") {
      if (value && typeof value === "object" && Object.keys(value).length > 0) {
        return true;
      }
      continue;
    }
    return true;
  }
  return false;
}

function parseSide<K extends string>(
  raw: unknown,
  keys: readonly K[],
  path: string,
): Partial<Record<K, unknown>> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new AgentError("validation", `${path} must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  const allowed = new Set<string>(keys);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      throw new AgentError(
        "validation",
        `Unknown field ${path}.${key}. Allowed: ${keys.join(", ")}`,
      );
    }
  }

  const out: Partial<Record<K, unknown>> = {};
  for (const key of keys) {
    if (!(key in obj)) continue;
    out[key] = coerceField(obj[key], key, `${path}.${key}`);
  }
  return out;
}

function coerceField(value: unknown, key: string, path: string): unknown {
  if (value === null) {
    // Money / optional numerics / dates clear with null; booleans and required strings don't.
    if (BOOLEAN_KEYS.has(key)) {
      throw new AgentError("validation", `${path} must be a boolean`);
    }
    return null;
  }

  if (DATE_KEYS.has(key)) {
    if (typeof value !== "string") {
      throw new AgentError("validation", `${path} must be an ISO date string or null`);
    }
    return parseDate(value, path);
  }

  if (BOOLEAN_KEYS.has(key)) {
    if (typeof value !== "boolean") {
      throw new AgentError("validation", `${path} must be a boolean`);
    }
    return value;
  }

  if (STRING_ARRAY_KEYS.has(key)) {
    if (key === "recurrenceByWeekday") {
      if (!Array.isArray(value) || !value.every((x) => typeof x === "number")) {
        throw new AgentError(
          "validation",
          `${path} must be an array of numbers (0=Sun … 6=Sat)`,
        );
      }
      return value;
    }
    if (!Array.isArray(value) || !value.every((x) => typeof x === "string")) {
      throw new AgentError("validation", `${path} must be an array of strings`);
    }
    return value;
  }

  if (MONEY_KEYS.has(key)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    if (typeof value === "string") {
      return value;
    }
    throw new AgentError(
      "validation",
      `${path} must be a number, decimal string, or null`,
    );
  }

  if (ENUM_KEYS[key]) {
    if (typeof value !== "string" || !ENUM_KEYS[key].includes(value)) {
      throw new AgentError(
        "validation",
        `${path} must be one of: ${ENUM_KEYS[key].join(", ")}`,
      );
    }
    return value;
  }

  if (NUMBER_KEYS.has(key)) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      throw new AgentError("validation", `${path} must be a number or null`);
    }
    return value;
  }

  // Free-text and uuid strings (description, purpose, exerciseId, …).
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    // importance etc. already handled; leftover numbers become strings only if unexpected.
    throw new AgentError("validation", `${path} must be a string or null`);
  }
  if (typeof value === "boolean") {
    throw new AgentError("validation", `${path} must be a string or null`);
  }

  throw new AgentError("validation", `${path} has an unsupported value type`);
}

/** Fields that are create-only (not part of a detail patch). */
export function stripCreateOnlyArgs(
  args: Record<string, unknown>,
): Record<string, unknown> {
  const {
    type: _t,
    parentId: _p,
    id: _i,
    externalSource: _s,
    externalId: _e,
    ...rest
  } = args;
  return rest;
}
