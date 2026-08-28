/**
 * Parse, persist and apply a Planner Amazon snapshot.
 *
 * Preview is computed from the stored evidence plus the live register, then the automatic
 * subset is written in one domain transaction. Drift, incomplete pages and non-exact charges
 * stay as review — they are never silently applied.
 */

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  amazonChargeMatches,
  amazonCharges,
  amazonOrderItems,
  amazonReceiptAllocations,
  amazonSubscriptions,
  financeAccounts,
  financeBudgetCategories,
  financeCategoryGroups,
  financeSupplyItems,
  financeSupplyOptions,
  financeTransactions,
} from "@/db/schema";
import { createCategoryGroup } from "@/lib/finances/budget/mutations";
import { centsToNumericString, numericStringToCents } from "@/lib/finances/money";
import { splitTransaction, upsertBillEnvelope } from "@/lib/finances/mutations";
import { updateSupplyItem } from "@/lib/finances/supplies/mutations";
import {
  allocateCharge,
  splitChildrenFromAllocation,
  stampBillIds,
  type ChargeAllocation,
} from "./allocate";
import { persistAmazonSnapshot } from "./reconcile";
import {
  AMAZON_SNS_GROUP,
  previewAmazonSnapshot,
  type AmazonPreview,
  type ExistingBill,
  type ExistingMatch,
  type ExistingSubscription,
  type PreviewInput,
} from "./preview";
import { parseAmazonSnapshot } from "./snapshot";
import { canManuallyMatch } from "./match";
import { subscriptionSavingCents } from "./orderSummary";
import {
  listAmazonChargeOrders,
  listAmazonCharges,
  listAmazonOrderSummaries,
} from "./queries";

export type AmazonSnapshotApplyResult = {
  preview: AmazonPreview;
  billsCreated: number;
  matchesApplied: number;
  suppliesLinked: number;
  subscriptionsCreated: number;
  chargesCreated: number;
};

export async function previewAmazonSnapshotText(
  userId: string,
  text: string,
): Promise<AmazonPreview> {
  const parsed = parseAmazonSnapshot(text);
  if (!parsed.ok) throw new Error(parsed.error);
  const state = await loadPreviewState(
    userId,
    parsed.snapshot.payments.map((row) => row.paymentId),
  );
  return previewAmazonSnapshot({
    snapshot: parsed.snapshot,
    issues: parsed.issues,
    ...state,
  });
}

export async function applyAmazonSnapshotText(
  userId: string,
  text: string,
): Promise<AmazonSnapshotApplyResult> {
  const parsed = parseAmazonSnapshot(text);
  if (!parsed.ok) throw new Error(parsed.error);
  const persist = await persistAmazonSnapshot(userId, parsed.snapshot);
  const state = await loadPreviewState(
    userId,
    parsed.snapshot.payments.map((row) => row.paymentId),
  );
  const preview = previewAmazonSnapshot({
    snapshot: parsed.snapshot,
    issues: parsed.issues,
    ...state,
  });
  const applied = await applyPreview(userId, preview);
  return {
    preview,
    billsCreated: applied.billsCreated,
    matchesApplied: applied.matchesApplied,
    suppliesLinked: applied.suppliesLinked,
    subscriptionsCreated: persist.subscriptionsCreated,
    chargesCreated: persist.chargesCreated,
  };
}

async function applyPreview(
  userId: string,
  preview: AmazonPreview,
): Promise<{ billsCreated: number; matchesApplied: number; suppliesLinked: number }> {
  const groupId = await ensureSnsGroup(userId);
  const billBySubscription = new Map<string, string>();
  let billsCreated = 0;
  for (const decision of preview.bills) {
    if (decision.kind !== "create" || !decision.cadence) continue;
    await upsertBillEnvelope(userId, {
      name: decision.name,
      groupId,
      cadence: decision.cadence,
      expectedCents: decision.expectedCents,
      anchorDate: decision.anchorDate,
      url: decision.asin ? decision.url : "",
      notes: decision.provisionalAnchor
        ? "Provisional next-delivery anchor from Amazon."
        : undefined,
    });
    const bill = await billByName(userId, decision.name);
    if (!bill) throw new Error(`Could not create the ${decision.name} bill.`);
    await db
      .update(amazonSubscriptions)
      .set({ billId: bill.id, updatedAt: new Date() })
      .where(
        and(
          eq(amazonSubscriptions.userId, userId),
          eq(amazonSubscriptions.amazonSubscriptionId, decision.subscriptionId),
        ),
      );
    billBySubscription.set(decision.subscriptionId, bill.id);
    billsCreated += 1;
  }

  for (const decision of preview.bills) {
    if (decision.kind === "unchanged" || decision.kind === "drift") {
      billBySubscription.set(decision.subscriptionId, decision.billId);
    }
  }

  let suppliesLinked = 0;
  for (const decision of preview.supplies) {
    if (decision.kind !== "link") continue;
    const billId = billBySubscription.get(decision.subscriptionId);
    if (!billId) continue;
    await updateSupplyItem(userId, decision.itemId, { envelopeId: billId });
    suppliesLinked += 1;
  }

  const charges = await listAmazonCharges(userId);
  const chargeByPayment = new Map(charges.map((row) => [row.amazonPaymentId, row]));
  let matchesApplied = 0;
  for (const decision of preview.matches) {
    if (decision.kind === "review") {
      const charge = chargeByPayment.get(decision.paymentId);
      if (charge) {
        await db
          .update(amazonCharges)
          .set({
            needsReview: true,
            reviewReason: decision.reason,
            updatedAt: new Date(),
          })
          .where(
            and(eq(amazonCharges.id, charge.id), eq(amazonCharges.userId, userId)),
          );
      }
      continue;
    }
    if (decision.kind !== "auto") continue;
    const charge = chargeByPayment.get(decision.paymentId);
    if (!charge) continue;
    const allocation = retargetAllocation(decision.allocation, billBySubscription);
    await applyMatch(userId, {
      chargeId: charge.id,
      transactionId: decision.transactionId,
      method: "automatic",
      dateMismatch: false,
      cardMismatch: false,
      allocation,
    });
    matchesApplied += 1;
  }

  for (const row of preview.bills) {
    if (row.kind !== "drift") continue;
    await db
      .update(amazonSubscriptions)
      .set({
        needsReview: true,
        reviewReason: row.changes.join(", "),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(amazonSubscriptions.userId, userId),
          eq(amazonSubscriptions.amazonSubscriptionId, row.subscriptionId),
        ),
      );
  }
  for (const row of preview.cancellationReviews) {
    await db
      .update(amazonSubscriptions)
      .set({
        needsReview: true,
        reviewReason: "Missing from a complete subscription snapshot.",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(amazonSubscriptions.userId, userId),
          eq(amazonSubscriptions.amazonSubscriptionId, row.subscriptionId),
        ),
      );
  }

  return { billsCreated, matchesApplied, suppliesLinked };
}

export type AmazonChargeCandidate = {
  id: string;
  transactionDate: string;
  description: string;
  amountCents: number;
  dateMismatch: boolean;
};

export async function listAmazonChargeCandidates(
  userId: string,
  chargeId: string,
): Promise<AmazonChargeCandidate[]> {
  const charge = await requireOwnedCharge(userId, chargeId);
  const rows = await db
    .select({
      id: financeTransactions.id,
      accountId: financeTransactions.accountId,
      transactionDate: financeTransactions.transactionDate,
      amount: financeTransactions.amount,
      pending: financeTransactions.pending,
      isParent: financeTransactions.isParent,
      description: financeTransactions.description,
      budgetCategoryId: financeTransactions.budgetCategoryId,
    })
    .from(financeTransactions)
    .where(
      and(eq(financeTransactions.userId, userId), isNull(financeTransactions.parentId)),
    );
  const chargeView = {
    paymentId: charge.amazonPaymentId,
    date: charge.paymentDate ?? "",
    amountCents: numericStringToCents(charge.amount),
    status: charge.status,
    cardLast4: charge.cardLast4,
    instrumentKind: charge.instrumentKind,
  };
  const out: AmazonChargeCandidate[] = [];
  for (const row of rows) {
    const allowed = canManuallyMatch(chargeView, {
      id: row.id,
      accountId: row.accountId,
      transactionDate: row.transactionDate,
      amountCents: numericStringToCents(row.amount) ?? 0,
      pending: row.pending,
      isParent: row.isParent,
      description: row.description,
      budgetCategoryId: row.budgetCategoryId,
    });
    if (!allowed.ok) continue;
    out.push({
      id: row.id,
      transactionDate: row.transactionDate,
      description: row.description,
      amountCents: numericStringToCents(row.amount) ?? 0,
      dateMismatch: allowed.dateMismatch,
    });
  }
  return out;
}

export async function approveAmazonChargeMatch(
  userId: string,
  chargeId: string,
  transactionId: string,
): Promise<void> {
  const charge = await requireOwnedCharge(userId, chargeId);
  const transaction = await requireOwnedTransaction(userId, transactionId);
  const allowed = canManuallyMatch(
    {
      paymentId: charge.amazonPaymentId,
      date: charge.paymentDate ?? "",
      amountCents: numericStringToCents(charge.amount),
      status: charge.status,
      cardLast4: charge.cardLast4,
      instrumentKind: charge.instrumentKind,
    },
    {
      id: transaction.id,
      accountId: transaction.accountId,
      transactionDate: transaction.transactionDate,
      amountCents: numericStringToCents(transaction.amount) ?? 0,
      pending: transaction.pending,
      isParent: transaction.isParent,
      description: transaction.description,
      budgetCategoryId: transaction.budgetCategoryId,
    },
  );
  if (!allowed.ok) throw new Error(allowed.reason);
  const orders = await listAmazonChargeOrders(userId, chargeId);
  const orderIds = orders.map((row) => row.amazonOrderId);
  const lines = await db
    .select({
      lineId: amazonOrderItems.externalId,
      amazonOrderId: amazonOrderItems.amazonOrderId,
      asin: amazonOrderItems.asin,
      itemPaid: amazonOrderItems.itemPaid,
      subscribeAndSave: amazonOrderItems.subscribeAndSave,
    })
    .from(amazonOrderItems)
    .where(eq(amazonOrderItems.userId, userId));
  const linked = lines.filter((row) => orderIds.includes(row.amazonOrderId));
  const subscriptions = await db
    .select()
    .from(amazonSubscriptions)
    .where(eq(amazonSubscriptions.userId, userId));
  const billBySubscription = new Map(
    subscriptions.flatMap((row) =>
      row.billId ? [[row.amazonSubscriptionId, row.billId] as const] : [],
    ),
  );
  const allocation = stampBillIds(
    allocateCharge({
      chargeCents: numericStringToCents(charge.amount) ?? 0,
      lines: linked.map((row) => ({
        lineId: row.lineId,
        amazonOrderId: row.amazonOrderId,
        asin: row.asin,
        itemPaidCents: numericStringToCents(row.itemPaid),
        subscribeAndSave: row.subscribeAndSave,
        subscriptionId: null,
      })),
      subscriptions: subscriptions.map((row) => ({
        subscriptionId: row.amazonSubscriptionId,
        asin: row.asin,
        status: row.status,
        billId: row.billId,
      })),
      orderSavings: (await listAmazonOrderSummaries(userId, orderIds)).map((row) => ({
        amazonOrderId: row.amazonOrderId,
        subscriptionSavingCents: subscriptionSavingCents(row.lines),
      })),
    }),
    billBySubscription,
  );
  await applyMatch(userId, {
    chargeId,
    transactionId,
    method: "manual",
    dateMismatch: allowed.dateMismatch,
    cardMismatch: allowed.cardMismatch,
    allocation,
  });
}

async function applyMatch(
  userId: string,
  input: {
    chargeId: string;
    transactionId: string;
    method: "automatic" | "manual";
    dateMismatch: boolean;
    cardMismatch: boolean;
    allocation: ChargeAllocation;
  },
): Promise<void> {
  const existing = await db
    .select({
      id: amazonChargeMatches.id,
      splitProtected: amazonChargeMatches.splitProtected,
    })
    .from(amazonChargeMatches)
    .where(
      and(
        eq(amazonChargeMatches.userId, userId),
        eq(amazonChargeMatches.chargeId, input.chargeId),
      ),
    )
    .limit(1);
  if (existing[0]?.splitProtected) return;

  const [transaction] = await db
    .select({
      id: financeTransactions.id,
      isParent: financeTransactions.isParent,
      budgetCategoryId: financeTransactions.budgetCategoryId,
      amount: financeTransactions.amount,
    })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financeTransactions.id, input.transactionId),
      ),
    )
    .limit(1);
  if (!transaction) throw new Error("Transaction not found.");
  if (transaction.isParent && !existing[0]) {
    throw new Error("An existing split is not rewritten automatically.");
  }

  await db
    .delete(amazonReceiptAllocations)
    .where(
      and(
        eq(amazonReceiptAllocations.userId, userId),
        eq(amazonReceiptAllocations.chargeId, input.chargeId),
      ),
    );
  if (input.allocation.lines.length > 0) {
    await db.insert(amazonReceiptAllocations).values(
      input.allocation.lines.map((line) => ({
        userId,
        chargeId: input.chargeId,
        lineId: line.lineId,
        amazonOrderId: line.amazonOrderId,
        asin: line.asin,
        amazonSubscriptionId: line.amazonSubscriptionId,
        billId: line.billId,
        amount: centsToNumericString(line.amountCents),
        kind: line.kind,
      })),
    );
  }

  if (existing[0]) {
    await db
      .update(amazonChargeMatches)
      .set({
        transactionId: input.transactionId,
        method: input.method,
        dateMismatch: input.dateMismatch,
        cardMismatch: input.cardMismatch,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(amazonChargeMatches.id, existing[0].id),
          eq(amazonChargeMatches.userId, userId),
        ),
      );
  } else {
    await db.insert(amazonChargeMatches).values({
      userId,
      chargeId: input.chargeId,
      transactionId: input.transactionId,
      method: input.method,
      dateMismatch: input.dateMismatch,
      cardMismatch: input.cardMismatch,
    });
  }

  await db
    .update(amazonCharges)
    .set({ needsReview: false, reviewReason: "", updatedAt: new Date() })
    .where(and(eq(amazonCharges.id, input.chargeId), eq(amazonCharges.userId, userId)));

  const children = splitChildrenFromAllocation(
    input.allocation,
    transaction.budgetCategoryId,
  );
  const realChildren = children.map((child) => ({
    amountCents: child.amountCents,
    budgetCategoryId: child.billId?.startsWith("pending:") ? null : child.billId,
  }));
  const billChildren = realChildren.filter((child) => child.budgetCategoryId);
  if (billChildren.length === 1 && realChildren.length === 1) {
    await db
      .update(financeTransactions)
      .set({
        budgetCategoryId: billChildren[0].budgetCategoryId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(financeTransactions.id, input.transactionId),
          eq(financeTransactions.userId, userId),
        ),
      );
    return;
  }
  if (realChildren.length >= 1 && !transaction.isParent) {
    await splitTransaction(userId, input.transactionId, realChildren);
  }
}

function retargetAllocation(
  allocation: ChargeAllocation,
  billBySubscription: Map<string, string>,
): ChargeAllocation {
  const lines = allocation.lines.map((line) => {
    if (!line.amazonSubscriptionId) return line;
    const billId = billBySubscription.get(line.amazonSubscriptionId) ?? line.billId;
    return billId && !billId.startsWith("pending:")
      ? { ...line, billId, kind: "subscription" as const }
      : line;
  });
  const byBill = new Map<string, number>();
  let remainderCents = 0;
  for (const line of lines) {
    if (line.billId && !line.billId.startsWith("pending:")) {
      byBill.set(line.billId, (byBill.get(line.billId) ?? 0) + line.amountCents);
    } else remainderCents += line.amountCents;
  }
  return { lines, byBill, remainderCents };
}

async function ensureSnsGroup(userId: string): Promise<string> {
  const [existing] = await db
    .select({ id: financeCategoryGroups.id })
    .from(financeCategoryGroups)
    .where(
      and(
        eq(financeCategoryGroups.userId, userId),
        eq(financeCategoryGroups.name, AMAZON_SNS_GROUP),
        isNull(financeCategoryGroups.parentGroupId),
      ),
    )
    .limit(1);
  if (existing) return existing.id;
  // Subscribe & Save deliveries are bills, so the group that holds them is a Bills group.
  return createCategoryGroup(userId, { name: AMAZON_SNS_GROUP, kind: "bill" });
}

async function billByName(userId: string, name: string) {
  const [row] = await db
    .select({ id: financeBudgetCategories.id })
    .from(financeBudgetCategories)
    .where(
      and(
        eq(financeBudgetCategories.userId, userId),
        eq(financeBudgetCategories.name, name),
        eq(financeBudgetCategories.kind, "bill"),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function loadPreviewState(
  userId: string,
  paymentIds: readonly string[],
): Promise<Omit<PreviewInput, "snapshot" | "issues">> {
  const [subscriptions, bills, accounts, transactions, matches, supplies] =
    await Promise.all([
      db
        .select()
        .from(amazonSubscriptions)
        .where(eq(amazonSubscriptions.userId, userId)),
      db
        .select({
          id: financeBudgetCategories.id,
          name: financeBudgetCategories.name,
          groupId: financeBudgetCategories.groupId,
          expectedCents: financeBudgetCategories.expectedCents,
          cadenceMonths: financeBudgetCategories.cadenceMonths,
          cadenceDays: financeBudgetCategories.cadenceDays,
          status: financeBudgetCategories.status,
        })
        .from(financeBudgetCategories)
        .where(
          and(
            eq(financeBudgetCategories.userId, userId),
            eq(financeBudgetCategories.kind, "bill"),
          ),
        ),
      db
        .select({
          id: financeAccounts.id,
          externalKey: financeAccounts.externalKey,
          closedAt: financeAccounts.closedAt,
        })
        .from(financeAccounts)
        .where(eq(financeAccounts.userId, userId)),
      db
        .select({
          id: financeTransactions.id,
          accountId: financeTransactions.accountId,
          transactionDate: financeTransactions.transactionDate,
          amount: financeTransactions.amount,
          pending: financeTransactions.pending,
          isParent: financeTransactions.isParent,
          description: financeTransactions.description,
          budgetCategoryId: financeTransactions.budgetCategoryId,
        })
        .from(financeTransactions)
        .where(
          and(
            eq(financeTransactions.userId, userId),
            isNull(financeTransactions.parentId),
          ),
        ),
      loadMatches(userId, paymentIds),
      db
        .select({
          asin: financeSupplyOptions.asin,
          itemId: financeSupplyItems.id,
          envelopeId: financeSupplyItems.envelopeId,
        })
        .from(financeSupplyOptions)
        .innerJoin(
          financeSupplyItems,
          and(
            eq(financeSupplyItems.id, financeSupplyOptions.itemId),
            eq(financeSupplyItems.userId, userId),
          ),
        )
        .where(eq(financeSupplyOptions.userId, userId)),
    ]);

  const existingSubs: ExistingSubscription[] = subscriptions.map((row) => ({
    amazonSubscriptionId: row.amazonSubscriptionId,
    billId: row.billId,
    asin: row.asin,
    productName: row.productName,
    quantity: row.quantity,
    cadenceMonths: row.cadenceMonths,
    cadenceDays: row.cadenceDays,
    status: row.status,
    nextDeliveryDate: row.nextDeliveryDate,
    needsReview: row.needsReview,
  }));
  const existingBills: ExistingBill[] = bills;
  return {
    subscriptions: existingSubs,
    bills: existingBills,
    accounts,
    transactions: transactions.map((row) => ({
      id: row.id,
      accountId: row.accountId,
      transactionDate: row.transactionDate,
      amountCents: numericStringToCents(row.amount) ?? 0,
      pending: row.pending,
      isParent: row.isParent,
      description: row.description,
      budgetCategoryId: row.budgetCategoryId,
    })),
    matches,
    supplies: supplies.filter((row) => row.asin !== ""),
  };
}

async function loadMatches(
  userId: string,
  paymentIds: readonly string[],
): Promise<ExistingMatch[]> {
  const charges = await db
    .select({
      id: amazonCharges.id,
      paymentId: amazonCharges.amazonPaymentId,
    })
    .from(amazonCharges)
    .where(eq(amazonCharges.userId, userId));
  const wanted = new Set(paymentIds);
  const chargeIds = charges
    .filter((row) => wanted.size === 0 || wanted.has(row.paymentId))
    .map((row) => row.id);
  if (chargeIds.length === 0) return [];
  const rows = await db
    .select({
      chargeId: amazonChargeMatches.chargeId,
      transactionId: amazonChargeMatches.transactionId,
      splitProtected: amazonChargeMatches.splitProtected,
    })
    .from(amazonChargeMatches)
    .where(eq(amazonChargeMatches.userId, userId));
  const paymentByCharge = new Map(charges.map((row) => [row.id, row.paymentId]));
  return rows.flatMap((row) => {
    const paymentId = paymentByCharge.get(row.chargeId);
    if (!paymentId) return [];
    return [
      {
        paymentId,
        transactionId: row.transactionId,
        splitProtected: row.splitProtected,
      },
    ];
  });
}

async function requireOwnedCharge(userId: string, chargeId: string) {
  const [row] = await db
    .select()
    .from(amazonCharges)
    .where(and(eq(amazonCharges.id, chargeId), eq(amazonCharges.userId, userId)))
    .limit(1);
  if (!row) throw new Error("Amazon charge not found.");
  return row;
}

async function requireOwnedTransaction(userId: string, transactionId: string) {
  const [row] = await db
    .select()
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.id, transactionId),
        eq(financeTransactions.userId, userId),
      ),
    )
    .limit(1);
  if (!row) throw new Error("Transaction not found.");
  return row;
}

export { markAmazonMatchSplitProtected } from "./matchProtect";
