import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { metricEntries, metrics, nodes } from "@/db/schema";
import type { PriorityLetter } from "@/db/schema";
import { between } from "@/lib/tree/sortKey";
import { isMetricType } from "./derive";
import { isDateKey, parseNumeric } from "./parse";
import type { MetricEntryInput, MetricInput, MetricType } from "./types";

function requireMetricType(raw: string | undefined, fallback: MetricType): MetricType {
  if (raw === undefined) return fallback;
  if (!isMetricType(raw)) {
    throw new Error('Metric type must be "instance", "cumulative", or "total".');
  }
  return raw;
}

/**
 * Metrics domain writes. Every function takes `userId` and scopes on it.
 * Entries cascade with the metric; metrics never cascade with outline nodes.
 */

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Db | Tx;

async function requireMetric(tx: Executor, userId: string, metricId: string) {
  const [row] = await tx
    .select()
    .from(metrics)
    .where(and(eq(metrics.id, metricId), eq(metrics.userId, userId)))
    .limit(1);
  if (!row) throw new Error("Metric not found.");
  return row;
}

async function requireEntry(tx: Executor, userId: string, entryId: string) {
  const [row] = await tx
    .select()
    .from(metricEntries)
    .where(and(eq(metricEntries.id, entryId), eq(metricEntries.userId, userId)))
    .limit(1);
  if (!row) throw new Error("Metric entry not found.");
  return row;
}

/** Owner must be this user's goal (or dream-as-goal). Null owner is fine. */
async function assertOwnerOk(
  tx: Executor,
  userId: string,
  ownerNodeId: string | null | undefined,
): Promise<void> {
  if (ownerNodeId === undefined || ownerNodeId === null) return;
  const [node] = await tx
    .select({ id: nodes.id, type: nodes.type })
    .from(nodes)
    .where(and(eq(nodes.id, ownerNodeId), eq(nodes.userId, userId)))
    .limit(1);
  if (!node) throw new Error("Owner not found.");
  if (node.type !== "goal") throw new Error("Metric owner must be a goal.");
}

async function nextSortKey(tx: Executor, userId: string): Promise<string> {
  const siblings = await tx
    .select({ sortKey: metrics.sortKey })
    .from(metrics)
    .where(eq(metrics.userId, userId))
    .orderBy(asc(metrics.sortKey));
  return between(siblings[siblings.length - 1]?.sortKey ?? null, null);
}

function numericString(n: number | null | undefined): string | null {
  if (n === null || n === undefined) return null;
  if (!Number.isFinite(n)) throw new Error("Value must be a finite number.");
  return String(n);
}

export async function createMetric(
  userId: string,
  input: MetricInput = {},
): Promise<string> {
  return (await createMetricOnce(userId, input)).id;
}

export async function createMetricOnce(
  userId: string,
  input: MetricInput = {},
): Promise<{ id: string; created: boolean }> {
  return db.transaction(async (tx) => {
    if (input.external) {
      const [existing] = await tx
        .select({ id: metrics.id })
        .from(metrics)
        .where(
          and(
            eq(metrics.userId, userId),
            eq(metrics.externalSource, input.external.source),
            eq(metrics.externalId, input.external.id),
          ),
        )
        .limit(1);
      if (existing) return { id: existing.id, created: false };
    }
    await assertOwnerOk(tx, userId, input.ownerNodeId ?? null);
    const sortKey = await nextSortKey(tx, userId);
    const title = (input.title ?? "").trim() || "New Metric";

    const [row] = await tx
      .insert(metrics)
      .values({
        userId,
        ownerNodeId: input.ownerNodeId ?? null,
        title,
        category: input.category ?? "",
        question: input.question ?? "",
        description: input.description ?? "",
        reason: input.reason ?? "",
        units: input.units ?? "",
        active: input.active ?? true,
        priorityLetter: input.priorityLetter ?? null,
        priorityRank:
          input.priorityLetter === null ? null : (input.priorityRank ?? null),
        metricType: requireMetricType(input.metricType, "total"),
        objectiveTarget: numericString(input.objectiveTarget),
        sortKey,
        externalSource: input.external?.source ?? null,
        externalId: input.external?.id ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: metrics.id });

    if (row) return { id: row.id, created: true };
    if (!input.external) throw new Error("Metric could not be created.");
    const [existing] = await tx
      .select({ id: metrics.id })
      .from(metrics)
      .where(
        and(
          eq(metrics.userId, userId),
          eq(metrics.externalSource, input.external.source),
          eq(metrics.externalId, input.external.id),
        ),
      )
      .limit(1);
    if (!existing) throw new Error("Metric could not be created.");
    return { id: existing.id, created: false };
  });
}

export async function updateMetric(
  userId: string,
  metricId: string,
  input: MetricInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    await requireMetric(tx, userId, metricId);
    if ("ownerNodeId" in input) {
      await assertOwnerOk(tx, userId, input.ownerNodeId ?? null);
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (input.title !== undefined) {
      const t = input.title.trim();
      if (!t) throw new Error("Title is required.");
      patch.title = t;
    }
    if (input.category !== undefined) patch.category = input.category;
    if (input.question !== undefined) patch.question = input.question;
    if (input.description !== undefined) patch.description = input.description;
    if (input.reason !== undefined) patch.reason = input.reason;
    if (input.units !== undefined) patch.units = input.units;
    if (input.active !== undefined) patch.active = input.active;
    if (input.metricType !== undefined) {
      patch.metricType = requireMetricType(input.metricType, "total");
    }
    if (input.priorityLetter !== undefined) {
      patch.priorityLetter = input.priorityLetter;
      if (input.priorityLetter === null) patch.priorityRank = null;
    }
    if (input.priorityRank !== undefined && input.priorityLetter !== null) {
      patch.priorityRank = input.priorityRank;
    }
    if (input.objectiveTarget !== undefined) {
      patch.objectiveTarget = numericString(input.objectiveTarget);
    }
    if (input.ownerNodeId !== undefined) {
      patch.ownerNodeId = input.ownerNodeId;
    }

    await tx
      .update(metrics)
      .set(patch)
      .where(and(eq(metrics.id, metricId), eq(metrics.userId, userId)));
  });
}

export async function deleteMetric(userId: string, metricId: string): Promise<void> {
  const result = await db
    .delete(metrics)
    .where(and(eq(metrics.id, metricId), eq(metrics.userId, userId)))
    .returning({ id: metrics.id });
  if (result.length === 0) throw new Error("Metric not found.");
}

export async function createMetricEntry(
  userId: string,
  metricId: string,
  input: MetricEntryInput,
): Promise<string> {
  return (await createMetricEntryOnce(userId, metricId, input)).id;
}

export async function createMetricEntryOnce(
  userId: string,
  metricId: string,
  input: MetricEntryInput,
): Promise<{ id: string; created: boolean }> {
  return db.transaction(async (tx) => {
    if (input.external) {
      const [existing] = await tx
        .select({ id: metricEntries.id })
        .from(metricEntries)
        .where(
          and(
            eq(metricEntries.userId, userId),
            eq(metricEntries.externalSource, input.external.source),
            eq(metricEntries.externalId, input.external.id),
          ),
        )
        .limit(1);
      if (existing) return { id: existing.id, created: false };
    }
    await requireMetric(tx, userId, metricId);
    if (!isDateKey(input.entryDate)) {
      throw new Error("entryDate must be YYYY-MM-DD.");
    }
    if (!Number.isFinite(input.value)) {
      throw new Error("Value must be a finite number.");
    }

    const [row] = await tx
      .insert(metricEntries)
      .values({
        userId,
        metricId,
        entryDate: input.entryDate,
        entryType: input.entryType ?? "new_total",
        target: numericString(input.target),
        value: numericString(input.value)!,
        externalSource: input.external?.source ?? null,
        externalId: input.external?.id ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: metricEntries.id });

    if (!row) {
      if (!input.external) throw new Error("Metric entry could not be created.");
      const [existing] = await tx
        .select({ id: metricEntries.id })
        .from(metricEntries)
        .where(
          and(
            eq(metricEntries.userId, userId),
            eq(metricEntries.externalSource, input.external.source),
            eq(metricEntries.externalId, input.external.id),
          ),
        )
        .limit(1);
      if (!existing) throw new Error("Metric entry could not be created.");
      return { id: existing.id, created: false };
    }

    await tx
      .update(metrics)
      .set({ updatedAt: new Date() })
      .where(and(eq(metrics.id, metricId), eq(metrics.userId, userId)));

    return { id: row.id, created: true };
  });
}

export type ImportMetricEntriesResult = {
  created: number;
  skipped: number;
  createdIds: string[];
};

/**
 * Bulk-import tracking rows (CSV import path). Skips a row when an entry with the
 * same `entryDate` and `value` already exists for this metric — re-importing the
 * same file is safe. Same-date different values still insert (two readings that day).
 */
export async function importMetricEntries(
  userId: string,
  metricId: string,
  inputs: readonly MetricEntryInput[],
): Promise<ImportMetricEntriesResult> {
  return db.transaction(async (tx) => {
    await requireMetric(tx, userId, metricId);

    for (const input of inputs) {
      if (!isDateKey(input.entryDate)) {
        throw new Error("entryDate must be YYYY-MM-DD.");
      }
      if (!Number.isFinite(input.value)) {
        throw new Error("Value must be a finite number.");
      }
    }

    const existing = await tx
      .select({
        entryDate: metricEntries.entryDate,
        value: metricEntries.value,
      })
      .from(metricEntries)
      .where(
        and(eq(metricEntries.userId, userId), eq(metricEntries.metricId, metricId)),
      );

    const seen = new Set(
      existing.map((e) => `${e.entryDate}\0${parseNumeric(e.value) ?? 0}`),
    );

    const createdIds: string[] = [];
    let skipped = 0;

    for (const input of inputs) {
      const key = `${input.entryDate}\0${input.value}`;
      if (seen.has(key)) {
        skipped += 1;
        continue;
      }
      seen.add(key);

      const [row] = await tx
        .insert(metricEntries)
        .values({
          userId,
          metricId,
          entryDate: input.entryDate,
          entryType: input.entryType ?? "new_total",
          target: numericString(input.target),
          value: numericString(input.value)!,
        })
        .returning({ id: metricEntries.id });
      createdIds.push(row.id);
    }

    if (createdIds.length > 0) {
      await tx
        .update(metrics)
        .set({ updatedAt: new Date() })
        .where(and(eq(metrics.id, metricId), eq(metrics.userId, userId)));
    }

    return { created: createdIds.length, skipped, createdIds };
  });
}

export async function updateMetricEntry(
  userId: string,
  entryId: string,
  input: Partial<MetricEntryInput>,
): Promise<void> {
  await db.transaction(async (tx) => {
    const entry = await requireEntry(tx, userId, entryId);
    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (input.entryDate !== undefined) {
      if (!isDateKey(input.entryDate)) throw new Error("entryDate must be YYYY-MM-DD.");
      patch.entryDate = input.entryDate;
    }
    if (input.entryType !== undefined) patch.entryType = input.entryType;
    if (input.target !== undefined) patch.target = numericString(input.target);
    if (input.value !== undefined) {
      if (!Number.isFinite(input.value))
        throw new Error("Value must be a finite number.");
      patch.value = numericString(input.value);
    }

    await tx
      .update(metricEntries)
      .set(patch)
      .where(and(eq(metricEntries.id, entryId), eq(metricEntries.userId, userId)));

    await tx
      .update(metrics)
      .set({ updatedAt: new Date() })
      .where(and(eq(metrics.id, entry.metricId), eq(metrics.userId, userId)));
  });
}

export async function deleteMetricEntry(
  userId: string,
  entryId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const entry = await requireEntry(tx, userId, entryId);
    await tx
      .delete(metricEntries)
      .where(and(eq(metricEntries.id, entryId), eq(metricEntries.userId, userId)));
    await tx
      .update(metrics)
      .set({ updatedAt: new Date() })
      .where(and(eq(metrics.id, entry.metricId), eq(metrics.userId, userId)));
  });
}

export type { PriorityLetter };
