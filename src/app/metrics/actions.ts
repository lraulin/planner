"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";
import {
  createMetric,
  createMetricEntry,
  deleteMetric,
  deleteMetricEntry,
  updateMetric,
  updateMetricEntry,
} from "@/lib/metrics/mutations";
import type { MetricEntryInput, MetricInput } from "@/lib/metrics/types";
import {
  getMetricDetail,
  listMetrics,
  listMetricsForOwner,
} from "@/lib/metrics/queries";
import type { MetricDetail, MetricListRow } from "@/lib/metrics/types";

export type ActionResult =
  | { ok: true; id?: string; data?: MetricDetail | MetricListRow[] }
  | { ok: false; error: string };

async function run<T>(work: (userId: string) => Promise<T>): Promise<ActionResult> {
  try {
    const userId = await getCurrentUserId();
    const result = await work(userId);
    revalidatePath("/", "layout");
    if (typeof result === "string") return { ok: true, id: result };
    if (result === undefined || result === null) return { ok: true };
    return { ok: true, data: result as MetricDetail | MetricListRow[] };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Something went wrong.",
    };
  }
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

export async function updateMetricEntryAction(
  entryId: string,
  input: Partial<MetricEntryInput>,
): Promise<ActionResult> {
  return run((userId) => updateMetricEntry(userId, entryId, input));
}

export async function deleteMetricEntryAction(entryId: string): Promise<ActionResult> {
  return run((userId) => deleteMetricEntry(userId, entryId));
}
