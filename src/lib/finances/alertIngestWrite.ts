/**
 * Write one bank alert email as a pending hold
 * (`agent-os/specs/2026-10-03-1500-card-holds-from-alert-emails/` D1, D6).
 *
 * Identity is the Gmail message id, so a re-push is a no-op. An alert that cannot be parsed
 * or routed throws `AlertRejected` after leaving an audit event with the raw text — never a
 * silent drop.
 */

import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeAuditChanges,
  financeAuditEvents,
  financeTransactions,
} from "@/db/schema";
import { localDateKey, shiftDateKey } from "@/lib/schedule/geometry";
import { parseAlertEmail } from "./alertEmail";
import { retireAlertHolds } from "./alertHolds";
import { captureFinanceMoneyCheckpoint } from "./audit/checkpoints";
import { writeFinanceAuditEvent } from "./audit/writes";
import { reclassifyInsideTransaction } from "./bankSnapshotApply";
import { LOST_HOLD_TOLERANCE_DAYS } from "./feedPairing";
import { autoFileNewRows } from "./payees/claims";
import { centsToNumericString } from "./money";

export type AlertPush = {
  messageId: string;
  from: string;
  subject: string;
  receivedAt: Date;
  plainText: string;
  htmlBody?: string;
};

export type AlertIngestResult = {
  status: "inserted" | "duplicate" | "retired";
  accountName: string;
  transactionId: string | null;
};

export class AlertRejected extends Error {}

/**
 * `todayKey` is the day the retirement pass ages holds against. It is a parameter because an
 * alert carries its own date: a hold is "lost" once it is a week old with nothing posted for
 * it, so ingesting a dated alert against the wall clock gives a different answer depending
 * on the day it is run.
 *
 * `recordRejection: false` is for `retryRejectedAlerts`: the refusal it is replaying is
 * already in the audit trail, and being refused again is not news.
 */
export async function applyAlertEmail(
  userId: string,
  push: AlertPush,
  todayKey: string = localDateKey(new Date()),
  options: { recordRejection: boolean } = { recordRejection: true },
): Promise<AlertIngestResult> {
  const parsed = parseAlertEmail(push);
  const evidence = {
    messageId: push.messageId,
    from: push.from,
    subject: push.subject,
    receivedAt: push.receivedAt.toISOString(),
    rawText: push.plainText,
    ...(push.htmlBody ? { htmlBody: push.htmlBody } : {}),
  };

  const reject = async (reason: string): Promise<never> => {
    if (!options.recordRejection) throw new AlertRejected(reason);
    await writeFinanceAuditEvent(db, userId, {
      kind: "alert_email",
      origin: "Alert email",
      occurredAt: push.receivedAt,
      summary: `Rejected alert email "${push.subject}": ${reason}`,
      warnings: [reason],
      sourceEvidence: evidence,
    });
    throw new AlertRejected(reason);
  };
  if (!parsed.ok) return reject(parsed.error);
  const alert = parsed.alert;

  const accounts = await db
    .select({
      id: financeAccounts.id,
      name: financeAccounts.name,
      kind: financeAccounts.kind,
      externalKey: financeAccounts.externalKey,
      closedAt: financeAccounts.closedAt,
      historySource: financeAccounts.historySource,
    })
    .from(financeAccounts)
    .where(eq(financeAccounts.userId, userId));
  const matches = accounts.filter(
    (row) =>
      row.closedAt === null &&
      row.kind === "credit_card" &&
      row.externalKey.trim().endsWith(alert.accountLast4),
  );
  if (matches.length !== 1) {
    return reject(
      matches.length === 0
        ? `No open credit card ending in ${alert.accountLast4}.`
        : `More than one open credit card ends in ${alert.accountLast4}.`,
    );
  }
  const account = matches[0];
  // An alert is a hold on an account whose posted history comes from the feed. On a
  // bank-page or files account it would be a second author of the same money.
  if (account.historySource !== "simplefin") {
    return reject(
      `${account.name} takes its history from ${account.historySource}, not SimpleFIN, so an alert hold is not accepted.`,
    );
  }

  return db.transaction(async (tx) => {
    const scope = { accountIds: [account.id], accountNames: [account.name] };
    const beforeCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);
    const [inserted] = await tx
      .insert(financeTransactions)
      .values({
        userId,
        accountId: account.id,
        transactionDate: alert.transactionDate,
        postedDate: null,
        pending: true,
        description: alert.description,
        amount: centsToNumericString(alert.amountCents),
        sourceCategory: "",
        externalSource: alert.feed,
        externalId: push.messageId,
      })
      .onConflictDoNothing()
      .returning({ id: financeTransactions.id });
    if (!inserted) {
      const [existing] = await tx
        .select({ id: financeTransactions.id })
        .from(financeTransactions)
        .where(
          and(
            eq(financeTransactions.userId, userId),
            eq(financeTransactions.externalSource, alert.feed),
            eq(financeTransactions.externalId, push.messageId),
          ),
        );
      return {
        status: "duplicate" as const,
        accountName: account.name,
        transactionId: existing?.id ?? null,
      };
    }

    await reclassifyInsideTransaction(tx, userId);
    await autoFileNewRows(tx, userId, [inserted.id]);
    // A feed row may already hold this charge, if the sync outran the mail.
    const holds = await retireAlertHolds(tx, userId, account.id, todayKey);
    const retired = holds.changes.some(
      (change) => change.entityIdentity === inserted.id && change.after === null,
    );
    const afterCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);
    await writeFinanceAuditEvent(tx, userId, {
      kind: "alert_email",
      origin: "Alert email",
      occurredAt: push.receivedAt,
      summary: `${account.name}: hold ${alert.description} ${centsToNumericString(alert.amountCents)} on ${alert.transactionDate}${retired ? ", already covered by the bank feed" : ""}.`,
      scope,
      warnings: holds.warnings,
      sourceEvidence: evidence,
      beforeCheckpoint,
      afterCheckpoint,
      changes: [
        {
          entityType: "transaction",
          entityIdentity: inserted.id,
          before: null,
          after: {
            accountId: account.id,
            transactionDate: alert.transactionDate,
            amountCents: alert.amountCents,
            pending: true,
            externalSource: alert.feed,
            externalId: push.messageId,
          },
        },
        ...holds.changes,
      ],
    });
    return {
      status: retired ? ("retired" as const) : ("inserted" as const),
      accountName: account.name,
      transactionId: retired ? null : inserted.id,
    };
  });
}

/** The alert a rejected event kept as evidence, or null if the evidence is not a whole one. */
function pushFromEvidence(evidence: Record<string, unknown>): AlertPush | null {
  const { messageId, from, subject, receivedAt, rawText, htmlBody } = evidence;
  if (
    typeof messageId !== "string" ||
    typeof from !== "string" ||
    typeof subject !== "string" ||
    typeof receivedAt !== "string" ||
    Number.isNaN(Date.parse(receivedAt)) ||
    typeof rawText !== "string"
  ) {
    return null;
  }
  return {
    messageId,
    from,
    subject,
    receivedAt: new Date(receivedAt),
    plainText: rawText,
    ...(typeof htmlBody === "string" ? { htmlBody } : {}),
  };
}

/**
 * Offer the last week's rejected alerts again; returns how many were accepted this time.
 *
 * A refusal is a fact about the moment it was made: the card was still on the bank page, the
 * account was not yet linked, the parser did not know the wording. The Apps Script marks a
 * 422 handled so a refused alert does not re-audit every five minutes, which means Gmail
 * never sends it twice — all eight rejections in production (2026-10-01 to 10-06) were
 * alerts for cards mid-cutover, and none came back once the cutover finished. The audit
 * event holds the whole message, so the retry is made from that. It runs with each
 * SimpleFIN sync, after the feed rows are in: a hold whose charge already posted retires in
 * the same call.
 *
 * Only a week back, because an older hold would be flagged as lost the moment it landed.
 */
export async function retryRejectedAlerts(
  userId: string,
  todayKey: string = localDateKey(new Date()),
): Promise<number> {
  const since = new Date(
    `${shiftDateKey(todayKey, -LOST_HOLD_TOLERANCE_DAYS)}T00:00:00Z`,
  );
  const events = await db
    .select({
      sourceEvidence: financeAuditEvents.sourceEvidence,
      // The outer id is spelled out: a bare column in a one-table select renders
      // unqualified, and inside the subquery `"id"` would be the change row's own.
      accepted: sql<boolean>`exists (select 1 from ${financeAuditChanges} where ${financeAuditChanges.eventId} = "finance_audit_events"."id")`,
    })
    .from(financeAuditEvents)
    .where(
      and(
        eq(financeAuditEvents.userId, userId),
        eq(financeAuditEvents.kind, "alert_email"),
        gte(financeAuditEvents.occurredAt, since),
      ),
    );

  const acceptedIds = new Set(
    events
      .filter((event) => event.accepted)
      .map((event) => event.sourceEvidence.messageId),
  );
  const pending = new Map<string, AlertPush>();
  for (const event of events) {
    const push = pushFromEvidence(event.sourceEvidence);
    if (push && !acceptedIds.has(push.messageId)) pending.set(push.messageId, push);
  }

  let accepted = 0;
  for (const push of pending.values()) {
    try {
      await applyAlertEmail(userId, push, todayKey, { recordRejection: false });
      accepted += 1;
    } catch (error) {
      if (!(error instanceof AlertRejected)) throw error;
    }
  }
  return accepted;
}
