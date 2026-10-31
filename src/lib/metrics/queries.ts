import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { metricEntries, metrics, nodes } from "@/db/schema";
import { ownedRow } from "@/lib/db/owned";
import { displayValue, normalizeMetricType } from "./derive";
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
 *
 * The owner join carries `userId` as well as the id. `assertOwnerOk` is the only thing that
 * writes `owner_node_id` and it already refuses another user's node — but that is a guard in
 * a different file, and a join that reads a foreign row correctly is the wrong shape to
 * leave lying around next to a query layer where every other read scopes itself.
 */
export async function listMetrics(userId: string): Promise<MetricListRow[]> {
  // Every entry the user has, rather than the entries of the metrics just read: they are
  // the same rows, and asking for them by metric id means waiting for the metrics first.
  const [rows, entryRows] = await Promise.all([
    db
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
      .leftJoin(nodes, and(eq(nodes.id, metrics.ownerNodeId), eq(nodes.userId, userId)))
      .where(eq(metrics.userId, userId))
      .orderBy(asc(metrics.sortKey)),
    db
      .select({
        id: metricEntries.id,
        metricId: metricEntries.metricId,
        entryDate: metricEntries.entryDate,
        value: metricEntries.value,
      })
      .from(metricEntries)
      .where(eq(metricEntries.userId, userId)),
  ]);

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
    const metricType = normalizeMetricType(r.metricType);
    const shown = displayValue(byMetric.get(r.id) ?? [], metricType);
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
      metricType,
      objectiveTarget: parseNumeric(r.objectiveTarget),
      sortKey: r.sortKey,
      lastValue: shown?.value ?? null,
      lastDate: shown?.entryDate ?? null,
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

/** One tracking entry by id, scoped to the user. */
export async function getMetricEntry(
  userId: string,
  entryId: string,
): Promise<MetricEntryView | null> {
  const [row] = await db
    .select({
      id: metricEntries.id,
      metricId: metricEntries.metricId,
      entryDate: metricEntries.entryDate,
      entryType: metricEntries.entryType,
      target: metricEntries.target,
      value: metricEntries.value,
    })
    .from(metricEntries)
    .where(ownedRow(metricEntries, entryId, userId))
    .limit(1);
  if (!row) return null;
  return mapEntry(row);
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
    .leftJoin(nodes, and(eq(nodes.id, metrics.ownerNodeId), eq(nodes.userId, userId)))
    .where(ownedRow(metrics, metricId, userId))
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
  const metricType = normalizeMetricType(row.metricType);
  const shown = displayValue(entries, metricType);

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
    metricType,
    objectiveTarget: parseNumeric(row.objectiveTarget),
    sortKey: row.sortKey,
    entries,
    lastValue: shown?.value ?? null,
    lastDate: shown?.entryDate ?? null,
  };
}
