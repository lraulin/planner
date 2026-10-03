/**
 * Write one bank alert email as a pending hold
 * (`agent-os/specs/2026-10-03-1500-card-holds-from-alert-emails/` D1, D6).
 *
 * Identity is the Gmail message id, so a re-push is a no-op. An alert that cannot be parsed
 * or routed throws `AlertRejected` after leaving an audit event with the raw text — never a
 * silent drop.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { financeAccounts, financeTransactions } from "@/db/schema";
import { localDateKey } from "@/lib/schedule/geometry";
import { parseAlertEmail } from "./alertEmail";
import { retireAlertHolds } from "./alertHolds";
import { captureFinanceMoneyCheckpoint } from "./audit/checkpoints";
import { writeFinanceAuditEvent } from "./audit/writes";
import { autoFileNewRows, reclassifyInsideTransaction } from "./bankSnapshotApply";
import { centsToNumericString } from "./money";

export type AlertPush = {
  messageId: string;
  from: string;
  subject: string;
  receivedAt: Date;
  plainText: string;
};

export type AlertIngestResult = {
  status: "inserted" | "duplicate" | "retired";
  accountName: string;
  transactionId: string | null;
};

export class AlertRejected extends Error {}

export async function applyAlertEmail(
  userId: string,
  push: AlertPush,
): Promise<AlertIngestResult> {
  const parsed = parseAlertEmail(push);
  const evidence = {
    messageId: push.messageId,
    from: push.from,
    subject: push.subject,
    receivedAt: push.receivedAt.toISOString(),
    rawText: push.plainText,
  };

  const reject = async (reason: string): Promise<never> => {
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
    const holds = await retireAlertHolds(
      tx,
      userId,
      account.id,
      localDateKey(new Date()),
    );
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
