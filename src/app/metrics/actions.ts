"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";
import {
  actionErrorMessage,
  runWithData,
  type DataActionResult,
} from "../actionResult";
import {
  createMetric,
  createMetricEntry,
  deleteMetric,
  deleteMetricEntry,
  importMetricEntries,
  updateMetric,
  updateMetricEntry,
  type ImportMetricEntriesResult,
} from "@/lib/metrics/mutations";
import type { MetricEntryInput, MetricInput } from "@/lib/metrics/types";
import {
  getMetricDetail,
  listMetrics,
  listMetricsForOwner,
} from "@/lib/metrics/queries";
import type { MetricDetail, MetricListRow } from "@/lib/metrics/types";

/**
 * Metrics reads through its action surface as well as writing to it, so results carry
 * `data` and the clients discriminate on it at runtime (`Array.isArray`).
 */
export type ActionResult = DataActionResult<MetricDetail | MetricListRow[]>;

export type ImportActionResult =
  { ok: true; data: ImportMetricEntriesResult } | { ok: false; error: string };

function run(
  work: (userId: string) => Promise<MetricDetail | MetricListRow[] | string | void>,
): Promise<ActionResult> {
  return runWithData(work);
}

export async function listMetricsAction(): Promise<ActionResult> {
  return run((userId) => listMetrics(userId));
}

export async function listMetricsForOwnerAction(
  ownerNodeId: string,
): Promise<ActionResult> {
  return run((userId) => listMetricsForOwner(userId, ownerNodeId));
}

export async function getMetricDetailAction(metricId: string): Promise<ActionResult> {
  return run(async (userId) => {
    const detail = await getMetricDetail(userId, metricId);
    if (!detail) throw new Error("Metric not found.");
    return detail;
  });
}

export async function createMetricAction(
  input: MetricInput = {},
): Promise<ActionResult> {
  return run((userId) => createMetric(userId, input));
}

export async function updateMetricAction(
  metricId: string,
  input: MetricInput,
): Promise<ActionResult> {
  return run((userId) => updateMetric(userId, metricId, input));
}

export async function deleteMetricAction(metricId: string): Promise<ActionResult> {
  return run((userId) => deleteMetric(userId, metricId));
}

export async function createMetricEntryAction(
  metricId: string,
  input: MetricEntryInput,
): Promise<ActionResult> {
  return run((userId) => createMetricEntry(userId, metricId, input));
}

/**
 * Bulk-import parsed tracking rows. Client parses CSV via `parseEntriesCsv`.
 * Idempotent for identical date+value pairs already on the metric.
 */
export async function importMetricEntriesAction(
  metricId: string,
  entries: MetricEntryInput[],
): Promise<ImportActionResult> {
  try {
    const userId = await getCurrentUserId();
    if (entries.length === 0) {
      throw new Error("No tracking rows to import.");
    }
    if (entries.length > 5000) {
      throw new Error("Too many rows (max 5000 per import).");
    }
    const data = await importMetricEntries(userId, metricId, entries);
    revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error) };
  }
}

export async function updateMetricEntryAction(
  entryId: string,
  input: Partial<MetricEntryInput>,
): Promise<ActionResult> {
  return run((userId) => updateMetricEntry(userId, entryId, input));
}

export async function deleteMetricEntryAction(entryId: string): Promise<ActionResult> {
  return run((userId) => deleteMetricEntry(userId, entryId));
}
