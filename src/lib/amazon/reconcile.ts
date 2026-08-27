/**
 * Persist a browser snapshot into the canonical Amazon receipt tables plus the
 * subscription/charge evidence the privacy dump never had.
 *
 * Order/item identity stays `orderId:ASIN:ordinal` so a zip import and a capture enrich one
 * line rather than double-count it. Charge↔order links are additive: a partial later paste
 * does not drop a link the first run recorded.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  amazonChargeMatches,
  amazonChargeOrders,
  amazonCharges,
  amazonSubscriptions,
} from "@/db/schema";
import { centsToNumericString, numericStringToCents } from "@/lib/finances/money";
import { persistSlim } from "./import";
import { isAmazonChargeKey } from "./snapshot";
import {
  AMAZON_FEEDS,
  SLIM_SOURCE,
  SLIM_VERSION,
  SNS_SHIPPING_OPTION,
  type AmazonImportResult,
  type SlimAmazonOrders,
  type SlimItem,
  type SlimOrder,
} from "./types";
import type { AmazonSnapshot } from "./snapshot";

export type AmazonSnapshotPersistResult = AmazonImportResult & {
  subscriptionsCreated: number;
  subscriptionsUpdated: number;
  subscriptionsUnchanged: number;
  chargesCreated: number;
  chargesUpdated: number;
  chargesUnchanged: number;
  chargeOrdersCreated: number;
  orderTotalChargesCreated: number;
};

export async function persistAmazonSnapshot(
  userId: string,
  snapshot: AmazonSnapshot,
): Promise<AmazonSnapshotPersistResult> {
  const slim = slimFromSnapshot(snapshot);
  const receipts = await persistSlim(userId, slim, { enrich: true });
  const evidence = await db.transaction(async (tx) => {
    const subscriptions = await upsertSubscriptions(tx, userId, snapshot);
    const charges = await upsertCharges(tx, userId, snapshot);
    const standIns = await ensureOrderTotalCharges(tx, userId, snapshot);
    return { subscriptions, charges, standIns };
  });
  return {
    ...receipts,
    subscriptionsCreated: evidence.subscriptions.created,
    subscriptionsUpdated: evidence.subscriptions.updated,
    subscriptionsUnchanged: evidence.subscriptions.unchanged,
    chargesCreated: evidence.charges.created,
    chargesUpdated: evidence.charges.updated,
    chargesUnchanged: evidence.charges.unchanged,
    chargeOrdersCreated: evidence.charges.linksCreated,
    orderTotalChargesCreated: evidence.standIns,
  };
}

/**
 * A stand-in charge for an order whose grand total is known but whose charge evidence is not.
 *
 * Manual review may link an order to a register row of the same grand total when Amazon gave
 * us no charge to go on. Rather than a second linking mechanism, the order borrows the one
 * that already exists: a charge row carrying the order's own total, which `exactMatchCharge`
 * refuses automatically (its status is not `completed` and its instrument is not a card) and
 * `canManuallyMatch` will approve only against an equal-amount posted Amazon row.
 *
 * A zero total gets nothing. A gift-card-funded order really was charged nothing, and
 * inventing a $0.00 charge for it would be inventing a payment.
 */
async function ensureOrderTotalCharges(
  tx: Executor,
  userId: string,
  snapshot: AmazonSnapshot,
): Promise<number> {
  const charges = await tx
    .select()
    .from(amazonCharges)
    .where(eq(amazonCharges.userId, userId));
  const links = await tx
    .select()
    .from(amazonChargeOrders)
    .where(eq(amazonChargeOrders.userId, userId));
  const matches = await tx
    .select({ chargeId: amazonChargeMatches.chargeId })
    .from(amazonChargeMatches)
    .where(eq(amazonChargeMatches.userId, userId));

  const matched = new Set(matches.map((row) => row.chargeId));
  const chargeById = new Map(charges.map((row) => [row.id, row]));
  const realOrderIds = new Set<string>();
  const standInByOrder = new Map<string, (typeof charges)[number]>();
  for (const link of links) {
    const charge = chargeById.get(link.chargeId);
    if (!charge) continue;
    if (charge.externalSource === AMAZON_FEEDS.orderTotal) {
      standInByOrder.set(link.amazonOrderId, charge);
    } else {
      realOrderIds.add(link.amazonOrderId);
    }
  }

  let created = 0;
  for (const order of snapshot.orders) {
    const grandTotalCents = order.summary?.grandTotalCents ?? null;
    const standIn = standInByOrder.get(order.amazonOrderId);
    if (realOrderIds.has(order.amazonOrderId) || !grandTotalCents) {
      // Amazon told us about the real charge, so the stand-in has done its job. Keep it if
      // the user already approved a link through it; the match is theirs, not ours.
      if (standIn && !matched.has(standIn.id)) {
        await tx
          .delete(amazonCharges)
          .where(
            and(eq(amazonCharges.id, standIn.id), eq(amazonCharges.userId, userId)),
          );
      }
      continue;
    }
    const paymentId = [
      order.amazonOrderId,
      order.orderDate,
      "",
      -grandTotalCents,
      0,
    ].join("|");
    const values = {
      userId,
      amazonPaymentId: paymentId,
      paymentDate: order.orderDate || null,
      amount: centsToNumericString(-grandTotalCents),
      status: "unknown",
      cardLast4: null,
      instrumentKind: "other",
      needsReview: true,
      reviewReason:
        "No Amazon charge evidence for this order. Link it to a register row of the same total.",
      capturedOn: snapshot.capturedOn || null,
      externalSource: AMAZON_FEEDS.orderTotal,
      externalId: paymentId,
    };
    if (!standIn) {
      const [row] = await tx
        .insert(amazonCharges)
        .values(values)
        .returning({ id: amazonCharges.id });
      if (!row) throw new Error("Could not store the Amazon order total.");
      await tx.insert(amazonChargeOrders).values({
        userId,
        chargeId: row.id,
        amazonOrderId: order.amazonOrderId,
      });
      created += 1;
      continue;
    }
    if (standIn.amazonPaymentId === paymentId || matched.has(standIn.id)) continue;
    await tx
      .update(amazonCharges)
      .set({
        amazonPaymentId: paymentId,
        externalId: paymentId,
        paymentDate: values.paymentDate,
        amount: values.amount,
        capturedOn: values.capturedOn,
        updatedAt: new Date(),
      })
      .where(and(eq(amazonCharges.id, standIn.id), eq(amazonCharges.userId, userId)));
  }
  return created;
}

function slimFromSnapshot(snapshot: AmazonSnapshot): SlimAmazonOrders {
  const last4ByOrder = new Map<string, string>();
  for (const payment of snapshot.payments) {
    if (!payment.cardLast4) continue;
    for (const orderId of payment.amazonOrderIds) {
      if (!last4ByOrder.has(orderId)) last4ByOrder.set(orderId, payment.cardLast4);
    }
  }
  const orders: SlimOrder[] = snapshot.orders.map((order) => ({
    amazonOrderId: order.amazonOrderId,
    channel: "retail",
    orderDate: order.orderDate,
    orderStatus: order.orderStatus,
    paymentMethod: last4ByOrder.has(order.amazonOrderId)
      ? `Visa - ${last4ByOrder.get(order.amazonOrderId)}`
      : "",
    paymentLast4: last4ByOrder.get(order.amazonOrderId) ?? null,
    website: "Amazon.com",
    currency: "USD",
    summary: order.summary,
  }));
  const orderById = new Map(
    snapshot.orders.map((order) => [order.amazonOrderId, order]),
  );
  const items: SlimItem[] = snapshot.items.map((item) => {
    const order = orderById.get(item.amazonOrderId);
    const last4 = last4ByOrder.get(item.amazonOrderId) ?? null;
    return {
      lineId: item.lineId,
      amazonOrderId: item.amazonOrderId,
      channel: "retail",
      asin: item.asin,
      productName: item.productName,
      quantity: item.quantity,
      unitPriceCents: null,
      unitPriceTaxCents: null,
      itemPaidCents: item.itemPaidCents,
      itemTaxCents: item.itemTaxCents,
      discountsCents: item.discountsCents,
      shippingChargeCents: item.shippingChargeCents,
      shippingOption: item.subscribeAndSave ? SNS_SHIPPING_OPTION : "",
      shipmentStatus: "",
      subscribeAndSave: item.subscribeAndSave || Boolean(order?.subscribeAndSave),
      shipDate: "",
      orderDate: order?.orderDate ?? "",
      orderStatus: order?.orderStatus ?? "",
      paymentMethod: last4 ? `Visa - ${last4}` : "",
      paymentLast4: last4,
      website: "Amazon.com",
      currency: "USD",
    };
  });
  const missingOrders = new Set(
    items.map((item) => item.amazonOrderId).filter((id) => !orderById.has(id)),
  );
  for (const amazonOrderId of missingOrders) {
    const last4 = last4ByOrder.get(amazonOrderId) ?? null;
    orders.push({
      amazonOrderId,
      channel: "retail",
      orderDate: "",
      orderStatus: "",
      paymentMethod: last4 ? `Visa - ${last4}` : "",
      paymentLast4: last4,
      website: "Amazon.com",
      currency: "USD",
      summary: null,
    });
  }
  return {
    version: SLIM_VERSION,
    source: SLIM_SOURCE,
    generatedAt: snapshot.generatedAt || new Date().toISOString(),
    orders,
    items,
    refunds: [],
    returns: [],
    replacements: [],
  };
}

type Executor = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Counts = { created: number; updated: number; unchanged: number };

async function upsertSubscriptions(
  tx: Executor,
  userId: string,
  snapshot: AmazonSnapshot,
): Promise<Counts> {
  const existing = await tx
    .select()
    .from(amazonSubscriptions)
    .where(eq(amazonSubscriptions.userId, userId));
  const byExt = new Map(existing.map((row) => [row.amazonSubscriptionId, row]));
  const counts: Counts = { created: 0, updated: 0, unchanged: 0 };

  for (const row of snapshot.subscriptions) {
    const values = {
      userId,
      amazonSubscriptionId: row.subscriptionId,
      asin: row.asin,
      productName: row.productName,
      quantity: row.quantity,
      cadenceMonths:
        row.cadence?.unit === "month"
          ? row.cadence.n
          : row.cadence
            ? Math.max(1, Math.round(row.cadence.n / 30))
            : null,
      cadenceDays: row.cadence?.unit === "day" ? row.cadence.n : null,
      cadenceLabel: row.cadenceLabel,
      nextDeliveryDate: row.nextDeliveryDate || null,
      status: row.status,
      capturedOn: snapshot.capturedOn || null,
      externalSource: AMAZON_FEEDS.subscription,
      externalId: row.subscriptionId,
    };
    const found = byExt.get(row.subscriptionId);
    if (!found) {
      await tx.insert(amazonSubscriptions).values(values);
      counts.created += 1;
      continue;
    }
    const asin = values.asin || found.asin;
    const productName = values.productName || found.productName;
    const changed =
      asin !== found.asin ||
      productName !== found.productName ||
      values.quantity !== found.quantity ||
      values.cadenceMonths !== found.cadenceMonths ||
      values.cadenceDays !== found.cadenceDays ||
      values.cadenceLabel !== found.cadenceLabel ||
      (values.nextDeliveryDate ?? "") !== (found.nextDeliveryDate ?? "") ||
      values.status !== found.status;
    if (!changed) {
      counts.unchanged += 1;
      continue;
    }
    await tx
      .update(amazonSubscriptions)
      .set({
        asin,
        productName,
        quantity: values.quantity,
        cadenceMonths: values.cadenceMonths,
        cadenceDays: values.cadenceDays,
        cadenceLabel: values.cadenceLabel,
        nextDeliveryDate: values.nextDeliveryDate,
        status: values.status,
        capturedOn: values.capturedOn,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(amazonSubscriptions.id, found.id),
          eq(amazonSubscriptions.userId, userId),
        ),
      );
    counts.updated += 1;
  }
  return counts;
}

async function upsertCharges(
  tx: Executor,
  userId: string,
  snapshot: AmazonSnapshot,
): Promise<Counts & { linksCreated: number }> {
  const existing = await tx
    .select()
    .from(amazonCharges)
    .where(eq(amazonCharges.userId, userId));
  const byExt = new Map(existing.map((row) => [row.amazonPaymentId, row]));
  const counts: Counts & { linksCreated: number } = {
    created: 0,
    updated: 0,
    unchanged: 0,
    linksCreated: 0,
  };

  for (const row of snapshot.payments) {
    const values = {
      userId,
      amazonPaymentId: row.paymentId,
      paymentDate: row.date || null,
      amount: row.amountCents === null ? null : centsToNumericString(row.amountCents),
      status: row.status,
      cardLast4: row.cardLast4,
      instrumentKind: row.instrumentKind,
      capturedOn: snapshot.capturedOn || null,
      externalSource: AMAZON_FEEDS.charge,
      externalId: row.paymentId,
    };
    let chargeId: string;
    const found = byExt.get(row.paymentId);
    if (!found) {
      const [created] = await tx
        .insert(amazonCharges)
        .values(values)
        .returning({ id: amazonCharges.id });
      if (!created) throw new Error("Could not store the Amazon charge.");
      chargeId = created.id;
      counts.created += 1;
    } else {
      chargeId = found.id;
      const changed =
        (values.paymentDate ?? "") !== (found.paymentDate ?? "") ||
        numericStringToCents(found.amount) !== row.amountCents ||
        values.status !== found.status ||
        values.cardLast4 !== found.cardLast4 ||
        values.instrumentKind !== found.instrumentKind;
      if (!changed) counts.unchanged += 1;
      else {
        await tx
          .update(amazonCharges)
          .set({
            paymentDate: values.paymentDate ?? found.paymentDate,
            amount: row.amountCents === null ? found.amount : values.amount,
            status: values.status,
            cardLast4: values.cardLast4 ?? found.cardLast4,
            instrumentKind: values.instrumentKind,
            capturedOn: values.capturedOn,
            updatedAt: new Date(),
          })
          .where(and(eq(amazonCharges.id, found.id), eq(amazonCharges.userId, userId)));
        counts.updated += 1;
      }
    }
    counts.linksCreated += await addChargeOrders(
      tx,
      userId,
      chargeId,
      row.amazonOrderIds,
    );
  }

  // v1 minted a charge id from the page wording, so those rows can never be produced again
  // and a re-capture would leave them beside the charge they duplicate. Flag rather than
  // delete: some of them carry a match and a split the user already reviewed.
  for (const row of existing) {
    if (isAmazonChargeKey(row.amazonPaymentId)) continue;
    if (row.needsReview) continue;
    await tx
      .update(amazonCharges)
      .set({
        needsReview: true,
        reviewReason:
          "Captured before order totals; re-capture supersedes it. Check for a duplicate.",
        updatedAt: new Date(),
      })
      .where(and(eq(amazonCharges.id, row.id), eq(amazonCharges.userId, userId)));
  }
  return counts;
}

async function addChargeOrders(
  tx: Executor,
  userId: string,
  chargeId: string,
  amazonOrderIds: readonly string[],
): Promise<number> {
  if (amazonOrderIds.length === 0) return 0;
  const existing = await tx
    .select({ amazonOrderId: amazonChargeOrders.amazonOrderId })
    .from(amazonChargeOrders)
    .where(
      and(
        eq(amazonChargeOrders.userId, userId),
        eq(amazonChargeOrders.chargeId, chargeId),
      ),
    );
  const have = new Set(existing.map((row) => row.amazonOrderId));
  let created = 0;
  for (const amazonOrderId of amazonOrderIds) {
    if (have.has(amazonOrderId)) continue;
    await tx.insert(amazonChargeOrders).values({ userId, chargeId, amazonOrderId });
    have.add(amazonOrderId);
    created += 1;
  }
  return created;
}
