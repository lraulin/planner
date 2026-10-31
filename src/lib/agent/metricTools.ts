/**
 * Agent tools over metrics: list, read, create, update, and log tracking entries.
 */

import {
  createMetricOnce,
  createMetricEntryOnce,
  updateMetric as updateMetricMutation,
  updateMetricEntry as updateMetricEntryMutation,
} from "@/lib/metrics/mutations";
import { getMetricDetail, getMetricEntry, listMetrics } from "@/lib/metrics/queries";
import { localDateKey } from "@/lib/schedule/geometry";
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
  optionalExternalRef,
  optionalNullableNumber,
  parseDateKey,
  requireSomeField,
} from "./parse";
import { pageBounds, paginate } from "./pagination";

function parseMetricType(value: unknown, field = "metricType"): MetricType {
  if (typeof value !== "string" || !isMetricType(value)) {
    throw new AgentError(
      "validation",
      `${field} must be "instance", "cumulative", or "total"`,
    );
  }
  return value;
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
  entryOffset = 0,
) {
  const entryPage = paginate(m.entries, { offset: entryOffset, limit: entryLimit });
  const entries = entryPage.items.map((e) => ({
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
    entryPageInfo: entryPage.pageInfo,
  };
}

export async function listMetricsTool(userId: string, args: Record<string, unknown>) {
  const bounds = pageBounds(
    optionalNumber(args, "offset"),
    optionalNumber(args, "limit"),
  );
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

  const page = paginate(rows, bounds);
  return { metrics: page.items.map(metricListSummary), pageInfo: page.pageInfo };
}

export async function getMetricTool(userId: string, args: Record<string, unknown>) {
  const id = requireString(args, "id");
  const entryLimit = Math.min(
    Math.max(optionalNumber(args, "entryLimit") ?? 30, 1),
    200,
  );
  const entryOffset = Math.max(optionalNumber(args, "entryOffset") ?? 0, 0);
  const detail = await getMetricDetail(userId, id);
  if (!detail) throw new AgentError("not_found", `Metric not found: ${id}`);
  return { metric: metricDetailSummary(detail, entryLimit, entryOffset) };
}

/** A metric's fields from tool arguments: only what was sent, for create and update alike. */
function metricInputFromArgs(args: Record<string, unknown>): MetricInput {
  return {
    title: args.title === undefined ? undefined : requireString(args, "title"),
    category: optionalString(args, "category"),
    question: optionalString(args, "question"),
    description: optionalString(args, "description"),
    reason: optionalString(args, "reason"),
    units: optionalString(args, "units"),
    active: optionalBoolean(args, "active"),
    metricType:
      args.metricType === undefined ? undefined : parseMetricType(args.metricType),
    priorityLetter:
      args.priorityLetter === undefined
        ? undefined
        : parsePriorityLetter(args.priorityLetter),
    priorityRank: optionalNullableNumber(args, "priorityRank"),
    objectiveTarget: optionalNullableNumber(args, "objectiveTarget"),
    ownerNodeId: optionalNullableString(args, "ownerNodeId"),
  };
}

export async function createMetricTool(userId: string, args: Record<string, unknown>) {
  const input: MetricInput = {
    ...metricInputFromArgs(args),
    external: optionalExternalRef(args),
  };

  const result = await createMetricOnce(userId, input);
  const payload = (await getMetricTool(userId, {
    id: result.id,
    entryLimit: 5,
  })) as Record<string, unknown>;
  return { ...payload, created: result.created };
}

export async function updateMetricTool(userId: string, args: Record<string, unknown>) {
  const id = requireString(args, "id");
  // Prove ownership before patching (mutations throw on missing, but we want a clear 404).
  await getMetricTool(userId, { id, entryLimit: 1 });

  const input = metricInputFromArgs(args);

  requireSomeField(input);

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
      ? (parseDateKey(entryDateRaw, "entryDate") ?? localDateKey(new Date()))
      : localDateKey(new Date());

  const input: MetricEntryInput = {
    entryDate,
    value,
    external: optionalExternalRef(args),
  };
  if (args.target !== undefined) {
    input.target = optionalNullableNumber(args, "target") ?? null;
  }
  if (args.entryType !== undefined) {
    input.entryType = requireString(args, "entryType");
  }

  const created = await createMetricEntryOnce(userId, metricId, input);
  const entry = await getMetricEntry(userId, created.id);
  if (!entry)
    throw new AgentError("internal", "Created metric entry missing on reload");
  const result = (await getMetricTool(userId, {
    id: entry.metricId,
    entryLimit: 10,
  })) as {
    metric: { entries: { id: string }[] };
  };
  return {
    entryId: entry.id,
    entryDate: entry.entryDate,
    value: entry.value,
    metric: result.metric,
    created: created.created,
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

  requireSomeField(patch);

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
