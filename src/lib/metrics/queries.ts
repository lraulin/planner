import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { metricEntries, metrics, nodes } from "@/db/schema";
import { latestEntry } from "./derive";
import { parseNumeric } from "./parse";
import type { MetricDetail, MetricEntryView, MetricListRow } from "./types";

function mapEntry(row: {
  id: string;
  metricId: string;
  entryDate: string;
  entryType: string;
  target: string | null;
  value: string;
}): MetricEntryView {
  return {
    id: row.id,
    metricId: row.metricId,
    entryDate: row.entryDate,
    entryType: row.entryType,
    target: parseNumeric(row.target),
    value: parseNumeric(row.value) ?? 0,
  };
}

/**
 * All metrics for the user, with owner name and last value derived from entries.
 * Ordered by sortKey.
 */
export async function listMetrics(userId: string): Promise<MetricListRow[]> {
  const rows = await db
    .select({
      id: metrics.id,
      ownerNodeId: metrics.ownerNodeId,
      title: metrics.title,
      category: metrics.category,
      question: metrics.question,
      units: metrics.units,
      active: metrics.active,
      priorityLetter: metrics.priorityLetter,
      priorityRank: metrics.priorityRank,
      metricType: metrics.metricType,
      objectiveTarget: metrics.objectiveTarget,
      sortKey: metrics.sortKey,
      ownerName: nodes.name,
    })
    .from(metrics)
    .leftJoin(nodes, eq(nodes.id, metrics.ownerNodeId))
    .where(eq(metrics.userId, userId))
    .orderBy(asc(metrics.sortKey));

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const entryRows = await db
    .select({
      id: metricEntries.id,
      metricId: metricEntries.metricId,
      entryDate: metricEntries.entryDate,
      value: metricEntries.value,
    })
    .from(metricEntries)
    .where(and(eq(metricEntries.userId, userId), inArray(metricEntries.metricId, ids)));

  const byMetric = new Map<
    string,
    { id: string; entryDate: string; value: number }[]
  >();
  for (const e of entryRows) {
    const list = byMetric.get(e.metricId) ?? [];
    list.push({
      id: e.id,
      entryDate: e.entryDate,
      value: parseNumeric(e.value) ?? 0,
    });
    byMetric.set(e.metricId, list);
  }

  return rows.map((r) => {
    const latest = latestEntry(byMetric.get(r.id) ?? []);
    return {
      id: r.id,
      ownerNodeId: r.ownerNodeId,
      ownerName: r.ownerName ?? null,
      title: r.title,
      category: r.category,
      question: r.question,
      units: r.units,
      active: r.active,
      priorityLetter: r.priorityLetter,
      priorityRank: r.priorityRank,
      metricType: r.metricType,
      objectiveTarget: parseNumeric(r.objectiveTarget),
      sortKey: r.sortKey,
      lastValue: latest?.value ?? null,
      lastDate: latest?.entryDate ?? null,
    };
  });
}

/** Metrics owned by a goal (for the Goal form Metrics tab). */
export async function listMetricsForOwner(
  userId: string,
  ownerNodeId: string,
): Promise<MetricListRow[]> {
  const all = await listMetrics(userId);
  return all.filter((m) => m.ownerNodeId === ownerNodeId);
}

export async function getMetricDetail(
  userId: string,
  metricId: string,
): Promise<MetricDetail | null> {
  const [row] = await db
    .select({
      id: metrics.id,
      ownerNodeId: metrics.ownerNodeId,
      title: metrics.title,
      category: metrics.category,
      question: metrics.question,
      description: metrics.description,
      reason: metrics.reason,
      units: metrics.units,
      active: metrics.active,
      priorityLetter: metrics.priorityLetter,
      priorityRank: metrics.priorityRank,
      metricType: metrics.metricType,
      objectiveTarget: metrics.objectiveTarget,
      sortKey: metrics.sortKey,
      ownerName: nodes.name,
    })
    .from(metrics)
    .leftJoin(nodes, eq(nodes.id, metrics.ownerNodeId))
    .where(and(eq(metrics.id, metricId), eq(metrics.userId, userId)))
    .limit(1);

  if (!row) return null;

  const entryRows = await db
    .select({
      id: metricEntries.id,
      metricId: metricEntries.metricId,
      entryDate: metricEntries.entryDate,
      entryType: metricEntries.entryType,
      target: metricEntries.target,
      value: metricEntries.value,
    })
    .from(metricEntries)
    .where(and(eq(metricEntries.userId, userId), eq(metricEntries.metricId, metricId)))
    .orderBy(desc(metricEntries.entryDate), desc(metricEntries.id));

  const entries = entryRows.map(mapEntry);
  const latest = latestEntry(entries);

  return {
    id: row.id,
    ownerNodeId: row.ownerNodeId,
    ownerName: row.ownerName ?? null,
    title: row.title,
    category: row.category,
    question: row.question,
    description: row.description,
    reason: row.reason,
    units: row.units,
    active: row.active,
    priorityLetter: row.priorityLetter,
    priorityRank: row.priorityRank,
    metricType: row.metricType,
    objectiveTarget: parseNumeric(row.objectiveTarget),
    sortKey: row.sortKey,
    entries,
    lastValue: latest?.value ?? null,
    lastDate: latest?.entryDate ?? null,
  };
}
