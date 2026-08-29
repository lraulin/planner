import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { financeAuditChanges, financeAuditEvents } from "@/db/schema";
import type { FinanceExecutor } from "../dbExecutor";
import type {
  FinanceAuditChange,
  FinanceAuditEvent,
  FinanceAuditEventSummary,
  FinanceAuditKind,
  FinanceAuditScope,
  FinanceMoneyCheckpoint,
} from "./types";

function checkpoint(
  value: Record<string, unknown> | null,
): FinanceMoneyCheckpoint | null {
  return value as FinanceMoneyCheckpoint | null;
}

function scope(value: Record<string, unknown>): FinanceAuditScope {
  return value;
}

function mergeScope(
  left: FinanceAuditScope,
  right: FinanceAuditScope,
): FinanceAuditScope {
  const merged: FinanceAuditScope = {};
  for (const key of [
    "accountIds",
    "accountNames",
    "budgetMonths",
    "envelopeIds",
  ] as const) {
    const values = [...new Set([...(left[key] ?? []), ...(right[key] ?? [])])];
    if (values.length > 0) merged[key] = values;
  }
  return merged;
}

export async function listFinanceAuditEvents(
  userId: string,
): Promise<FinanceAuditEventSummary[]> {
  const rows = await db
    .select({
      id: financeAuditEvents.id,
      batchId: financeAuditEvents.batchId,
      kind: financeAuditEvents.kind,
      origin: financeAuditEvents.origin,
      occurredAt: financeAuditEvents.occurredAt,
      summary: financeAuditEvents.summary,
      scope: financeAuditEvents.scope,
      warnings: financeAuditEvents.warnings,
      beforeCheckpoint: financeAuditEvents.beforeCheckpoint,
      afterCheckpoint: financeAuditEvents.afterCheckpoint,
      changeCount: sql<number>`count(${financeAuditChanges.id})::int`,
    })
    .from(financeAuditEvents)
    .leftJoin(
      financeAuditChanges,
      and(
        eq(financeAuditChanges.eventId, financeAuditEvents.id),
        eq(financeAuditChanges.userId, userId),
      ),
    )
    .where(eq(financeAuditEvents.userId, userId))
    .groupBy(financeAuditEvents.id)
    .orderBy(desc(financeAuditEvents.occurredAt), desc(financeAuditEvents.id));

  const grouped = new Map<
    string,
    FinanceAuditEventSummary & {
      firstBefore: FinanceMoneyCheckpoint | null;
      latestAfter: FinanceMoneyCheckpoint | null;
      eventCount: number;
    }
  >();
  for (const row of rows) {
    const before = checkpoint(row.beforeCheckpoint);
    const after = checkpoint(row.afterCheckpoint);
    const current = grouped.get(row.batchId);
    if (!current) {
      grouped.set(row.batchId, {
        id: row.id,
        batchId: row.batchId,
        kind: row.kind as FinanceAuditKind,
        origin: row.origin,
        occurredAt: row.occurredAt,
        summary: row.summary,
        scope: scope(row.scope),
        warnings: row.warnings,
        changeCount: row.changeCount,
        headlineImpactCents: null,
        firstBefore: before,
        latestAfter: after,
        eventCount: 1,
      });
      continue;
    }
    current.firstBefore = before ?? current.firstBefore;
    current.scope = mergeScope(current.scope, scope(row.scope));
    current.warnings = [...current.warnings, ...row.warnings];
    current.changeCount += row.changeCount;
    current.eventCount += 1;
    if (!current.origin.includes(row.origin)) current.origin += ` + ${row.origin}`;
  }

  return [...grouped.values()].map(
    ({ firstBefore, latestAfter, eventCount, ...event }) => ({
      ...event,
      summary:
        eventCount === 1
          ? event.summary
          : `${event.summary} (+${eventCount - 1} related)`,
      headlineImpactCents:
        firstBefore && latestAfter
          ? latestAfter.accountPoolCents - firstBefore.accountPoolCents
          : null,
    }),
  );
}

export async function loadFinanceAuditEvent(
  userId: string,
  eventOrBatchId: string,
): Promise<FinanceAuditEvent | null> {
  const [seed] = await db
    .select()
    .from(financeAuditEvents)
    .where(
      and(
        eq(financeAuditEvents.userId, userId),
        or(
          eq(financeAuditEvents.id, eventOrBatchId),
          eq(financeAuditEvents.batchId, eventOrBatchId),
        ),
      ),
    )
    .limit(1);
  if (!seed) return null;

  const events = await db
    .select()
    .from(financeAuditEvents)
    .where(
      and(
        eq(financeAuditEvents.userId, userId),
        eq(financeAuditEvents.batchId, seed.batchId),
      ),
    )
    .orderBy(asc(financeAuditEvents.occurredAt), asc(financeAuditEvents.id));
  const eventIds = events.map((event) => event.id);

  const rows = await db
    .select({
      eventId: financeAuditChanges.eventId,
      sequence: financeAuditChanges.sequence,
      entityType: financeAuditChanges.entityType,
      entityIdentity: financeAuditChanges.entityIdentity,
      before: financeAuditChanges.beforeFields,
      after: financeAuditChanges.afterFields,
    })
    .from(financeAuditChanges)
    .where(
      and(
        inArray(financeAuditChanges.eventId, eventIds),
        eq(financeAuditChanges.userId, userId),
      ),
    )
    .orderBy(asc(financeAuditChanges.sequence));

  const eventOrder = new Map(eventIds.map((id, index) => [id, index]));
  const changes: FinanceAuditChange[] = rows
    .sort(
      (left, right) =>
        (eventOrder.get(left.eventId) ?? 0) - (eventOrder.get(right.eventId) ?? 0) ||
        left.sequence - right.sequence,
    )
    .map((row) => ({
      entityType: row.entityType,
      entityIdentity: row.entityIdentity,
      before: row.before,
      after: row.after,
    }));
  const first = events[0];
  const latest = events[events.length - 1];
  const combinedScope = events.reduce(
    (result, event) => mergeScope(result, scope(event.scope)),
    {},
  );
  const origins = [...new Set(events.map((event) => event.origin))];
  return {
    id: latest.id,
    batchId: latest.batchId,
    kind: latest.kind as FinanceAuditKind,
    origin: origins.join(" + "),
    occurredAt: latest.occurredAt,
    summary:
      events.length === 1
        ? latest.summary
        : `${latest.summary} (+${events.length - 1} related)`,
    scope: combinedScope,
    warnings: events.flatMap((event) => event.warnings),
    sourceEvidence:
      events.length === 1
        ? latest.sourceEvidence
        : {
            events: events.map((event) => ({
              id: event.id,
              kind: event.kind,
              origin: event.origin,
              summary: event.summary,
              evidence: event.sourceEvidence,
            })),
          },
    beforeCheckpoint: checkpoint(first.beforeCheckpoint),
    afterCheckpoint: checkpoint(latest.afterCheckpoint),
    changes,
  };
}

/** Canonical Budget movement log, newest first, from the immutable audit. */
export async function listBudgetMovementAudit(
  userId: string,
  month: string,
  executor: FinanceExecutor = db,
): Promise<{ id: string; occurredAt: Date; summary: string }[]> {
  return executor
    .select({
      id: financeAuditEvents.id,
      occurredAt: financeAuditEvents.occurredAt,
      summary: financeAuditEvents.summary,
    })
    .from(financeAuditEvents)
    .where(
      and(
        eq(financeAuditEvents.userId, userId),
        sql`${financeAuditEvents.scope}->'budgetMonths' @> ${JSON.stringify([month])}::jsonb`,
      ),
    )
    .orderBy(desc(financeAuditEvents.occurredAt), desc(financeAuditEvents.id));
}
