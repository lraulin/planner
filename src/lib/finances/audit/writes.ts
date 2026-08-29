import { randomUUID } from "node:crypto";
import { financeAuditChanges, financeAuditEvents } from "@/db/schema";
import type { FinanceExecutor } from "../dbExecutor";
import type {
  FinanceAuditChange,
  FinanceAuditKind,
  FinanceAuditScope,
  FinanceMoneyCheckpoint,
} from "./types";

export function financeAuditBatchId(): string {
  return randomUUID();
}

export type WriteFinanceAuditEventInput = {
  kind: FinanceAuditKind;
  origin: string;
  batchId?: string;
  occurredAt?: Date;
  summary: string;
  scope?: FinanceAuditScope;
  warnings?: readonly string[];
  sourceEvidence?: Record<string, unknown>;
  beforeCheckpoint?: FinanceMoneyCheckpoint | null;
  afterCheckpoint?: FinanceMoneyCheckpoint | null;
  changes?: readonly FinanceAuditChange[];
};

/**
 * Write one immutable event and its ordered normalized changes through the caller's
 * executor. Passing the transaction executor is what makes evidence commit or roll back with
 * the state it describes.
 */
export async function writeFinanceAuditEvent(
  executor: FinanceExecutor,
  userId: string,
  input: WriteFinanceAuditEventInput,
): Promise<{ eventId: string; batchId: string }> {
  const batchId = input.batchId ?? financeAuditBatchId();
  const [event] = await executor
    .insert(financeAuditEvents)
    .values({
      userId,
      kind: input.kind,
      origin: input.origin,
      batchId,
      occurredAt: input.occurredAt ?? new Date(),
      summary: input.summary,
      scope: input.scope ?? {},
      warnings: [...(input.warnings ?? [])],
      sourceEvidence: input.sourceEvidence ?? {},
      beforeCheckpoint: input.beforeCheckpoint ?? null,
      afterCheckpoint: input.afterCheckpoint ?? null,
    })
    .returning({ id: financeAuditEvents.id });

  const changes = input.changes ?? [];
  if (changes.length > 0) {
    await executor.insert(financeAuditChanges).values(
      changes.map((change, sequence) => ({
        userId,
        eventId: event.id,
        sequence,
        entityType: change.entityType,
        entityIdentity: change.entityIdentity,
        beforeFields: change.before,
        afterFields: change.after,
      })),
    );
  }

  return { eventId: event.id, batchId };
}
