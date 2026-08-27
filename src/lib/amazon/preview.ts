/**
 * Pure preview of a parsed Amazon snapshot: which Bills to create, which charges match
 * exactly, and what stays in review. Apply re-runs this against the database; the UI never
 * decides.
 */

import { allocateCharge, stampBillIds, type ChargeAllocation } from "./allocate";
import { exactMatchCharge, type MatchAccount, type MatchTransaction } from "./match";
import type {
  AmazonSnapshot,
  AmazonSnapshotCadence,
  AmazonSnapshotSubscription,
  SnapshotIssue,
} from "./snapshot";

export const AMAZON_SNS_GROUP = "Amazon Subscribe & Save";

export type ExistingSubscription = {
  amazonSubscriptionId: string;
  billId: string | null;
  asin: string;
  productName: string;
  quantity: number;
  cadenceMonths: number | null;
  cadenceDays: number | null;
  status: string;
  nextDeliveryDate: string | null;
  needsReview: boolean;
};

export type ExistingBill = {
  id: string;
  name: string;
  groupId: string | null;
  expectedCents: number | null;
  cadenceMonths: number | null;
  cadenceDays: number | null;
  status: string;
};

export type ExistingMatch = {
  paymentId: string;
  transactionId: string;
  splitProtected: boolean;
};

export type SupplyByAsin = {
  asin: string;
  itemId: string;
  envelopeId: string | null;
};

export type PreviewInput = {
  snapshot: AmazonSnapshot;
  issues: SnapshotIssue[];
  subscriptions: readonly ExistingSubscription[];
  bills: readonly ExistingBill[];
  accounts: readonly MatchAccount[];
  transactions: readonly MatchTransaction[];
  matches: readonly ExistingMatch[];
  supplies: readonly SupplyByAsin[];
};

export type BillCreateDecision = {
  kind: "create";
  subscriptionId: string;
  name: string;
  cadence: AmazonSnapshotCadence;
  expectedCents: number | null;
  anchorDate: string | null;
  provisionalAnchor: boolean;
  asin: string;
  quantity: number;
  url: string;
};

export type BillDriftDecision = {
  kind: "drift";
  subscriptionId: string;
  billId: string;
  changes: string[];
};

export type BillDecision =
  | BillCreateDecision
  | BillDriftDecision
  | { kind: "unchanged"; subscriptionId: string; billId: string };

export type MatchDecision =
  | {
      kind: "auto";
      paymentId: string;
      transactionId: string;
      allocation: ChargeAllocation;
    }
  | {
      kind: "review";
      paymentId: string;
      reason: string;
      candidateIds: string[];
      allocation: ChargeAllocation | null;
    }
  | {
      kind: "settled";
      paymentId: string;
      transactionId: string;
    };

export type SupplyDecision =
  | { kind: "link"; asin: string; itemId: string; subscriptionId: string }
  | { kind: "skip"; asin: string; reason: string };

export type AmazonPreview = {
  issues: SnapshotIssue[];
  bills: BillDecision[];
  matches: MatchDecision[];
  supplies: SupplyDecision[];
  cancellationReviews: {
    subscriptionId: string;
    billId: string | null;
    productName: string;
  }[];
  counts: {
    billsCreate: number;
    billsDrift: number;
    matchesAuto: number;
    matchesReview: number;
    suppliesLink: number;
    cancellations: number;
  };
};

export function previewAmazonSnapshot(input: PreviewInput): AmazonPreview {
  const existingById = new Map(
    input.subscriptions.map((row) => [row.amazonSubscriptionId, row]),
  );
  const billNames = new Set(input.bills.map((bill) => bill.name));
  const billBySub = new Map(
    input.subscriptions.flatMap((row) =>
      row.billId ? [[row.amazonSubscriptionId, row.billId] as const] : [],
    ),
  );

  const expectedBySub = expectedAmounts(input);
  const bills: BillDecision[] = [];
  for (const subscription of input.snapshot.subscriptions) {
    if (subscription.status !== "active") continue;
    const existing = existingById.get(subscription.subscriptionId);
    if (!existing?.billId) {
      if (!subscription.cadence) {
        continue;
      }
      const name = uniqueBillName(subscription, billNames);
      billNames.add(name);
      bills.push({
        kind: "create",
        subscriptionId: subscription.subscriptionId,
        name,
        cadence: subscription.cadence,
        expectedCents: expectedBySub.get(subscription.subscriptionId) ?? null,
        anchorDate: anchorFor(subscription, expectedBySub),
        provisionalAnchor: !expectedBySub.has(subscription.subscriptionId),
        asin: subscription.asin,
        quantity: subscription.quantity,
        url: `https://www.amazon.com/gp/product/${subscription.asin}`,
      });
      continue;
    }
    const bill = input.bills.find((row) => row.id === existing.billId);
    const drift = driftOf(
      subscription,
      existing,
      bill,
      expectedBySub.get(subscription.subscriptionId),
    );
    if (drift.length > 0) {
      bills.push({
        kind: "drift",
        subscriptionId: subscription.subscriptionId,
        billId: existing.billId,
        changes: drift,
      });
    } else {
      bills.push({
        kind: "unchanged",
        subscriptionId: subscription.subscriptionId,
        billId: existing.billId,
      });
    }
  }

  const proposedBills = new Map(billBySub);
  for (const decision of bills) {
    if (decision.kind === "create") {
      proposedBills.set(decision.subscriptionId, `pending:${decision.subscriptionId}`);
    }
  }

  const subscriptionRefs = [
    ...input.snapshot.subscriptions.map((row) => ({
      subscriptionId: row.subscriptionId,
      asin: row.asin,
      status: row.status,
      billId: proposedBills.get(row.subscriptionId) ?? null,
    })),
    ...input.subscriptions
      .filter(
        (row) =>
          !input.snapshot.subscriptions.some(
            (s) => s.subscriptionId === row.amazonSubscriptionId,
          ),
      )
      .map((row) => ({
        subscriptionId: row.amazonSubscriptionId,
        asin: row.asin,
        status: row.status,
        billId: row.billId,
      })),
  ];

  const settledCharges = new Set(input.matches.map((row) => row.paymentId));
  const settledTxns = new Set(input.matches.map((row) => row.transactionId));
  const matches: MatchDecision[] = [];
  for (const payment of input.snapshot.payments) {
    const existingMatch = input.matches.find(
      (row) => row.paymentId === payment.paymentId,
    );
    if (existingMatch) {
      matches.push({
        kind: "settled",
        paymentId: payment.paymentId,
        transactionId: existingMatch.transactionId,
      });
      continue;
    }
    const lines = input.snapshot.items.filter((item) =>
      payment.amazonOrderIds.includes(item.amazonOrderId),
    );
    const allocation =
      payment.amountCents === null
        ? null
        : stampBillIds(
            allocateCharge({
              chargeCents: payment.amountCents,
              lines: lines.map((item) => ({
                lineId: item.lineId,
                amazonOrderId: item.amazonOrderId,
                asin: item.asin,
                itemPaidCents: item.itemPaidCents,
                subscribeAndSave: item.subscribeAndSave,
                subscriptionId: item.subscriptionId,
              })),
              subscriptions: subscriptionRefs,
            }),
            proposedBills,
          );
    const verdict = exactMatchCharge(payment, input.accounts, input.transactions, {
      chargeIds: settledCharges,
      transactionIds: settledTxns,
    });
    if (verdict.kind === "auto" && allocation) {
      settledCharges.add(payment.paymentId);
      settledTxns.add(verdict.transactionId);
      matches.push({
        kind: "auto",
        paymentId: payment.paymentId,
        transactionId: verdict.transactionId,
        allocation,
      });
    } else if (verdict.kind === "auto") {
      matches.push({
        kind: "review",
        paymentId: payment.paymentId,
        reason: "The charge matched a bank row but has no amount to allocate.",
        candidateIds: [verdict.transactionId],
        allocation: null,
      });
    } else {
      matches.push({
        kind: "review",
        paymentId: payment.paymentId,
        reason: verdict.reason,
        candidateIds: verdict.candidateIds,
        allocation,
      });
    }
  }

  const supplies: SupplyDecision[] = [];
  for (const decision of bills) {
    if (decision.kind !== "create" || !decision.asin) continue;
    const items = input.supplies.filter((row) => row.asin === decision.asin);
    if (items.length === 1 && items[0].envelopeId === null) {
      supplies.push({
        kind: "link",
        asin: decision.asin,
        itemId: items[0].itemId,
        subscriptionId: decision.subscriptionId,
      });
    } else if (items.length === 1) {
      supplies.push({
        kind: "skip",
        asin: decision.asin,
        reason: "That Supply item already has an envelope.",
      });
    } else if (items.length > 1) {
      supplies.push({
        kind: "skip",
        asin: decision.asin,
        reason: "More than one Supply item uses that ASIN.",
      });
    }
  }

  const snapshotIds = new Set(
    input.snapshot.subscriptions.map((row) => row.subscriptionId),
  );
  const cancellationReviews = input.snapshot.completeness.subscriptions
    ? input.subscriptions
        .filter(
          (row) =>
            row.status === "active" &&
            row.billId &&
            !snapshotIds.has(row.amazonSubscriptionId),
        )
        .map((row) => ({
          subscriptionId: row.amazonSubscriptionId,
          billId: row.billId,
          productName: row.productName,
        }))
    : [];

  return {
    issues: input.issues,
    bills,
    matches,
    supplies,
    cancellationReviews,
    counts: {
      billsCreate: bills.filter((row) => row.kind === "create").length,
      billsDrift: bills.filter((row) => row.kind === "drift").length,
      matchesAuto: matches.filter((row) => row.kind === "auto").length,
      matchesReview: matches.filter((row) => row.kind === "review").length,
      suppliesLink: supplies.filter((row) => row.kind === "link").length,
      cancellations: cancellationReviews.length,
    },
  };
}

export function uniqueBillName(
  subscription: Pick<
    AmazonSnapshotSubscription,
    "productName" | "quantity" | "cadenceLabel"
  >,
  taken: ReadonlySet<string>,
): string {
  const base = subscription.productName.trim() || "Amazon subscription";
  if (!taken.has(base)) return base;
  const cadence = subscription.cadenceLabel.trim();
  const withCadence = cadence ? `${base} (${cadence})` : "";
  if (withCadence && !taken.has(withCadence)) return withCadence;
  const withQty = `${base} (qty ${subscription.quantity})`;
  if (!taken.has(withQty)) return withQty;
  let n = 2;
  while (taken.has(`${base} (${n})`)) n += 1;
  return `${base} (${n})`;
}

function expectedAmounts(input: PreviewInput): Map<string, number> {
  const latest = new Map<string, { date: string; cents: number }>();
  const byId = new Map(
    input.snapshot.subscriptions.map((row) => [row.subscriptionId, row]),
  );
  for (const payment of input.snapshot.payments) {
    if (payment.status !== "completed" || payment.amountCents === null) continue;
    const lines = input.snapshot.items.filter((item) =>
      payment.amazonOrderIds.includes(item.amazonOrderId),
    );
    const allocation = allocateCharge({
      chargeCents: payment.amountCents,
      lines: lines.map((item) => ({
        lineId: item.lineId,
        amazonOrderId: item.amazonOrderId,
        asin: item.asin,
        itemPaidCents: item.itemPaidCents,
        subscribeAndSave: item.subscribeAndSave,
        subscriptionId: item.subscriptionId,
      })),
      subscriptions: input.snapshot.subscriptions.map((row) => ({
        subscriptionId: row.subscriptionId,
        asin: row.asin,
        status: row.status,
        billId: null,
      })),
    });
    for (const line of allocation.lines) {
      const subscriptionId = line.amazonSubscriptionId;
      if (!subscriptionId || !byId.has(subscriptionId)) continue;
      if (byId.get(subscriptionId)?.status !== "active") continue;
      const date = payment.date;
      const current = latest.get(subscriptionId);
      const cents = Math.abs(line.amountCents);
      if (!current || date >= current.date) {
        latest.set(subscriptionId, {
          date,
          cents: current && date === current.date ? current.cents + cents : cents,
        });
      }
    }
  }
  return new Map([...latest].map(([id, value]) => [id, value.cents]));
}

function anchorFor(
  subscription: AmazonSnapshotSubscription,
  expected: Map<string, number>,
): string | null {
  if (expected.has(subscription.subscriptionId)) return null;
  return subscription.nextDeliveryDate || null;
}

function driftOf(
  incoming: AmazonSnapshotSubscription,
  existing: ExistingSubscription,
  bill: ExistingBill | undefined,
  expectedCents: number | undefined,
): string[] {
  const changes: string[] = [];
  if (incoming.cadence) {
    const sameMonths =
      incoming.cadence.unit === "month" &&
      existing.cadenceMonths === incoming.cadence.n &&
      !existing.cadenceDays;
    const sameDays =
      incoming.cadence.unit === "day" && existing.cadenceDays === incoming.cadence.n;
    if (!sameMonths && !sameDays) changes.push("cadence");
  }
  if (incoming.status !== existing.status) changes.push("status");
  if (
    expectedCents !== undefined &&
    bill?.expectedCents != null &&
    bill.expectedCents !== expectedCents
  ) {
    changes.push("amount");
  }
  const next = incoming.nextDeliveryDate || "";
  const stored = existing.nextDeliveryDate ?? "";
  if (
    next &&
    stored &&
    next !== stored &&
    !isNormalProgression(stored, next, incoming.cadence)
  ) {
    changes.push("exceptional-date");
  }
  return changes;
}

function isNormalProgression(
  previous: string,
  next: string,
  cadence: AmazonSnapshotCadence,
): boolean {
  if (!cadence) return false;
  const [py, pm, pd] = previous.split("-").map(Number);
  const [ny, nm, nd] = next.split("-").map(Number);
  if (!py || !ny) return false;
  if (cadence.unit === "month") {
    const months = (ny - py) * 12 + (nm - pm);
    return months === cadence.n && nd === pd;
  }
  const prevUtc = Date.UTC(py, pm - 1, pd);
  const nextUtc = Date.UTC(ny, nm - 1, nd);
  const days = Math.round((nextUtc - prevUtc) / 86400000);
  return days === cadence.n;
}
