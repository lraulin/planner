/**
 * Agent tools over metrics: list, read, create, update, and log tracking entries.
 */

import {
  createMetric,
  createMetricEntry,
  updateMetric as updateMetricMutation,
  updateMetricEntry as updateMetricEntryMutation,
} from "@/lib/metrics/mutations";
import { getMetricDetail, getMetricEntry, listMetrics } from "@/lib/metrics/queries";
import { isDateKey, localDateKey } from "@/lib/metrics/parse";
import { isMetricType } from "@/lib/metrics/derive";
import type { MetricEntryInput, MetricInput, MetricType } from "@/lib/metrics/types";
import { AgentError } from "./errors";
import {
  optionalBoolean,
  optionalNullableString,
  optionalNumber,
  optionalString,
  parsePriorityLetter,
  requireString,
} from "./parse";

function parseMetricType(value: unknown, field = "metricType"): MetricType {
  if (typeof value !== "string" || !isMetricType(value)) {
    throw new AgentError(
      "validation",
      `${field} must be "instance", "cumulative", or "total"`,
    );
  }
  return value;
}

function parseDateKey(
  value: string | null | undefined,
  field: string,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (!isDateKey(value)) {
    // Two different mistakes, and telling them apart is the difference between "reformat it"
    // and "count the days in that month again". `2026-06-31` is the right shape.
    throw new AgentError(
      "validation",
      /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? `${field} is not a date that exists: ${value}`
        : `${field} must be YYYY-MM-DD`,
    );
  }
  return value;
}

function optionalNullableNumber(
  obj: Record<string, unknown>,
  key: string,
): number | null | undefined {
  if (!(key in obj)) return undefined;
  const v = obj[key];
  if (v === null) return null;
  if (typeof v !== "number" || Number.isNaN(v)) {
    throw new AgentError("validation", `${key} must be a number or null`);
  }
  return v;
}

function metricListSummary(m: Awaited<ReturnType<typeof listMetrics>>[number]) {
  return {
    id: m.id,
    title: m.title,
    category: m.category,
    question: m.question,
    units: m.units,
    active: m.active,
    metricType: m.metricType,
    objectiveTarget: m.objectiveTarget,
    ownerNodeId: m.ownerNodeId,
    ownerName: m.ownerName,
    priorityLetter: m.priorityLetter,
    priorityRank: m.priorityRank,
    lastValue: m.lastValue,
    lastDate: m.lastDate,
  };
}

function metricDetailSummary(
  m: NonNullable<Awaited<ReturnType<typeof getMetricDetail>>>,
  entryLimit: number,
) {
  const entries = m.entries.slice(0, entryLimit).map((e) => ({
    id: e.id,
    entryDate: e.entryDate,
    value: e.value,
    target: e.target,
    entryType: e.entryType,
  }));
  return {
    id: m.id,
    title: m.title,
    category: m.category,
    question: m.question,
    description: m.description,
    reason: m.reason,
    units: m.units,
    active: m.active,
    metricType: m.metricType,
    objectiveTarget: m.objectiveTarget,
    ownerNodeId: m.ownerNodeId,
    ownerName: m.ownerName,
    priorityLetter: m.priorityLetter,
    priorityRank: m.priorityRank,
    lastValue: m.lastValue,
    lastDate: m.lastDate,
    entries,
    entryCount: m.entries.length,
  };
}

export async function listMetricsTool(userId: string, args: Record<string, unknown>) {
  const limit = Math.min(Math.max(optionalNumber(args, "limit") ?? 50, 1), 200);
  const activeOnly = optionalBoolean(args, "activeOnly") ?? false;
  const query = optionalString(args, "query")?.trim().toLowerCase();
  const ownerNodeId = optionalNullableString(args, "ownerNodeId");

  let rows = await listMetrics(userId);

  if (ownerNodeId !== undefined) {
    rows = rows.filter((m) => m.ownerNodeId === ownerNodeId);
  }
  if (activeOnly) {
    rows = rows.filter((m) => m.active);
  }
  if (query) {
    rows = rows.filter((m) => {
      const hay =
        `${m.title} ${m.category} ${m.question} ${m.units} ${m.ownerName ?? ""}`.toLowerCase();
      return hay.includes(query);
    });
  }

  return { metrics: rows.slice(0, limit).map(metricListSummary) };
}

export async function getMetricTool(userId: string, args: Record<string, unknown>) {
  const id = requireString(args, "id");
  const entryLimit = Math.min(
    Math.max(optionalNumber(args, "entryLimit") ?? 30, 1),
    200,
  );
  const detail = await getMetricDetail(userId, id);
  if (!detail) throw new AgentError("not_found", `Metric not found: ${id}`);
  return { metric: metricDetailSummary(detail, entryLimit) };
}

export async function createMetricTool(userId: string, args: Record<string, unknown>) {
  const input: MetricInput = {};
  if (args.title !== undefined) input.title = requireString(args, "title");
  if (args.category !== undefined)
    input.category = optionalString(args, "category") ?? "";
  if (args.question !== undefined)
    input.question = optionalString(args, "question") ?? "";
  if (args.description !== undefined) {
    input.description = optionalString(args, "description") ?? "";
  }
  if (args.reason !== undefined) input.reason = optionalString(args, "reason") ?? "";
  if (args.units !== undefined) input.units = optionalString(args, "units") ?? "";
  if (args.active !== undefined) input.active = optionalBoolean(args, "active");
  if (args.metricType !== undefined)
    input.metricType = parseMetricType(args.metricType);
  if (args.priorityLetter !== undefined) {
    input.priorityLetter = parsePriorityLetter(args.priorityLetter);
  }
  if (args.priorityRank !== undefined) {
    input.priorityRank = optionalNullableNumber(args, "priorityRank") ?? null;
  }
  if (args.objectiveTarget !== undefined) {
    input.objectiveTarget = optionalNullableNumber(args, "objectiveTarget") ?? null;
  }
  if (args.ownerNodeId !== undefined) {
    input.ownerNodeId = optionalNullableString(args, "ownerNodeId") ?? null;
  }

  const id = await createMetric(userId, input);
  return getMetricTool(userId, { id, entryLimit: 5 });
}

export async function updateMetricTool(userId: string, args: Record<string, unknown>) {
  const id = requireString(args, "id");
  // Prove ownership before patching (mutations throw on missing, but we want a clear 404).
  await getMetricTool(userId, { id, entryLimit: 1 });

  const input: MetricInput = {};
  if (args.title !== undefined) input.title = requireString(args, "title");
  if (args.category !== undefined)
    input.category = optionalString(args, "category") ?? "";
  if (args.question !== undefined)
    input.question = optionalString(args, "question") ?? "";
  if (args.description !== undefined) {
    input.description = optionalString(args, "description") ?? "";
  }
  if (args.reason !== undefined) input.reason = optionalString(args, "reason") ?? "";
  if (args.units !== undefined) input.units = optionalString(args, "units") ?? "";
  if (args.active !== undefined) {
    const active = optionalBoolean(args, "active");
    if (active === undefined) {
      throw new AgentError("validation", "active must be a boolean");
    }
    input.active = active;
  }
  if (args.metricType !== undefined)
    input.metricType = parseMetricType(args.metricType);
  if (args.priorityLetter !== undefined) {
    input.priorityLetter = parsePriorityLetter(args.priorityLetter);
  }
  if (args.priorityRank !== undefined) {
    input.priorityRank = optionalNullableNumber(args, "priorityRank") ?? null;
  }
  if (args.objectiveTarget !== undefined) {
    input.objectiveTarget = optionalNullableNumber(args, "objectiveTarget") ?? null;
  }
  if (args.ownerNodeId !== undefined) {
    input.ownerNodeId = optionalNullableString(args, "ownerNodeId") ?? null;
  }

  if (Object.keys(input).length === 0) {
    throw new AgentError("validation", "Provide at least one field to update");
  }

  await updateMetricMutation(userId, id, input);
  return getMetricTool(userId, { id, entryLimit: 5 });
}

/**
 * Record a tracking value for a metric (the main "save a reading" path).
 * `entryDate` defaults to today (local YYYY-MM-DD). Returns the metric with recent entries.
 */
export async function logMetricEntryTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const metricId = requireString(args, "metricId");
  const value = optionalNumber(args, "value");
  if (value === undefined) {
    throw new AgentError("validation", "value is required");
  }

  const entryDateRaw = optionalString(args, "entryDate");
  const entryDate =
    entryDateRaw !== undefined
      ? (parseDateKey(entryDateRaw, "entryDate") ?? localDateKey())
      : localDateKey();

  const input: MetricEntryInput = {
    entryDate,
    value,
  };
  if (args.target !== undefined) {
    input.target = optionalNullableNumber(args, "target") ?? null;
  }
  if (args.entryType !== undefined) {
    input.entryType = requireString(args, "entryType");
  }

  const entryId = await createMetricEntry(userId, metricId, input);
  const result = (await getMetricTool(userId, { id: metricId, entryLimit: 10 })) as {
    metric: { entries: { id: string }[] };
  };
  return {
    entryId,
    entryDate,
    value,
    metric: result.metric,
  };
}

export async function updateMetricEntryTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const id = requireString(args, "id");
  const patch: Partial<MetricEntryInput> = {};

  if (args.entryDate !== undefined) {
    const d = parseDateKey(requireString(args, "entryDate"), "entryDate");
    if (!d) throw new AgentError("validation", "entryDate must be YYYY-MM-DD");
    patch.entryDate = d;
  }
  if (args.value !== undefined) {
    const value = optionalNumber(args, "value");
    if (value === undefined) {
      throw new AgentError("validation", "value must be a number");
    }
    patch.value = value;
  }
  if (args.target !== undefined) {
    patch.target = optionalNullableNumber(args, "target") ?? null;
  }
  if (args.entryType !== undefined) {
    patch.entryType = requireString(args, "entryType");
  }

  if (Object.keys(patch).length === 0) {
    throw new AgentError("validation", "Provide at least one field to update");
  }

  await updateMetricEntryMutation(userId, id, patch);

  const entry = await getMetricEntry(userId, id);
  if (!entry) throw new AgentError("not_found", `Metric entry not found: ${id}`);

  const detail = await getMetricDetail(userId, entry.metricId);
  if (!detail) throw new AgentError("not_found", `Metric not found: ${entry.metricId}`);

  return {
    entry: {
      id: entry.id,
      metricId: entry.metricId,
      entryDate: entry.entryDate,
      value: entry.value,
      target: entry.target,
      entryType: entry.entryType,
    },
    metric: metricDetailSummary(detail, 10),
  };
}
