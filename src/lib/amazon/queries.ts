import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  amazonChargeMatches,
  amazonChargeOrders,
  amazonCharges,
  amazonOrderItems,
  amazonOrders,
  amazonReceiptAllocations,
  amazonRefunds,
  amazonSubscriptions,
  financeBudgetCategories,
  financeTransactions,
} from "@/db/schema";
import { numericStringToCents } from "@/lib/finances/money";
import { amazonReviewChargeTitle } from "./grouping";
import {
  asAmazonSummaryLines,
  asAmazonSummarySource,
  checkAmazonOrderSummary,
  type AmazonOrderSummaryLine,
  type AmazonSummaryCheck,
  type AmazonSummarySource,
} from "./orderSummary";
import {
  AMAZON_BLOCK_SIZE,
  parseAmazonOrdersQuery,
  prepareAmazonOrders,
  type AmazonOrdersPrepared,
  type AmazonOrdersRowBlock,
} from "./ordersQuery";
import type { AmazonChannel, AmazonItemListRow } from "./types";

const ITEM_LIST_COLUMNS = {
  id: amazonOrderItems.id,
  orderId: amazonOrderItems.orderId,
  amazonOrderId: amazonOrderItems.amazonOrderId,
  channel: amazonOrderItems.channel,
  orderDate: amazonOrders.orderDate,
  orderStatus: amazonOrders.orderStatus,
  productName: amazonOrderItems.productName,
  asin: amazonOrderItems.asin,
  quantity: amazonOrderItems.quantity,
  unitPrice: amazonOrderItems.unitPrice,
  itemPaid: amazonOrderItems.itemPaid,
  discounts: amazonOrderItems.discounts,
  paymentLast4: amazonOrders.paymentLast4,
  paymentMethod: amazonOrders.paymentMethod,
  subscribeAndSave: amazonOrderItems.subscribeAndSave,
  shipmentStatus: amazonOrderItems.shipmentStatus,
  shippingOption: amazonOrderItems.shippingOption,
  website: amazonOrders.website,
  currency: amazonOrders.currency,
  grandTotal: amazonOrders.grandTotal,
  summaryLines: amazonOrders.summaryLines,
  externalId: amazonOrderItems.externalId,
};

/**
 * Every Amazon line item for the user, newest order first. Refund count is per order
 * so a cancelled/refunded purchase is visible on the row.
 *
 * The Orders page does not send this whole list to the browser — it prepares an index
 * and a 100-row window (`loadAmazonPrepared`). Tests and the server pipeline still need
 * the full set.
 */
export async function listAmazonItems(userId: string): Promise<AmazonItemListRow[]> {
  const rows = await db
    .select(ITEM_LIST_COLUMNS)
    .from(amazonOrderItems)
    .innerJoin(
      amazonOrders,
      and(
        eq(amazonOrders.id, amazonOrderItems.orderId),
        eq(amazonOrders.userId, userId),
      ),
    )
    .where(eq(amazonOrderItems.userId, userId))
    .orderBy(desc(amazonOrders.orderDate), desc(amazonOrderItems.amazonOrderId));
  const refunds = await refundCountsByOrder(userId);
  return stampItemEvidence(
    userId,
    rows.map((row) => toListRow(row, refunds)),
  );
}

/** User-scoped detail rows for an Orders block, preserving the requested order. */
export async function listAmazonItemsByIds(
  userId: string,
  ids: readonly string[],
): Promise<AmazonItemListRow[]> {
  const wanted = [...new Set(ids)].slice(0, AMAZON_BLOCK_SIZE);
  if (wanted.length === 0) return [];
  const rows = await db
    .select(ITEM_LIST_COLUMNS)
    .from(amazonOrderItems)
    .innerJoin(
      amazonOrders,
      and(
        eq(amazonOrders.id, amazonOrderItems.orderId),
        eq(amazonOrders.userId, userId),
      ),
    )
    .where(
      and(eq(amazonOrderItems.userId, userId), inArray(amazonOrderItems.id, wanted)),
    );
  const refunds = await refundCountsByOrder(
    userId,
    rows.map((row) => row.amazonOrderId),
  );
  const stamped = await stampItemEvidence(
    userId,
    rows.map((row) => toListRow(row, refunds)),
  );
  const byId = new Map(stamped.map((row) => [row.id, row]));
  return wanted.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

export async function loadAmazonPrepared(
  userId: string,
  rawQuery: unknown,
): Promise<AmazonOrdersPrepared> {
  const items = await listAmazonItems(userId);
  return prepareAmazonOrders(items, parseAmazonOrdersQuery(rawQuery));
}

export async function loadAmazonBlock(
  userId: string,
  ids: readonly string[],
): Promise<AmazonOrdersRowBlock> {
  const rows = await listAmazonItemsByIds(userId, ids.slice(0, AMAZON_BLOCK_SIZE));
  return { queryKey: "", offset: 0, rows };
}

export async function loadAmazonExportRows(
  userId: string,
  rawQuery: unknown,
): Promise<AmazonItemListRow[]> {
  const items = await listAmazonItems(userId);
  const prepared = prepareAmazonOrders(items, parseAmazonOrdersQuery(rawQuery));
  const byId = new Map(items.map((row) => [row.id, row]));
  return prepared.index.nodeIds.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

async function refundCountsByOrder(
  userId: string,
  amazonOrderIds?: readonly string[],
): Promise<Map<string, number>> {
  if (amazonOrderIds && amazonOrderIds.length === 0) return new Map();
  const rows = await db
    .select({
      amazonOrderId: amazonRefunds.amazonOrderId,
      n: sql<number>`count(*)::int`,
    })
    .from(amazonRefunds)
    .where(
      amazonOrderIds
        ? and(
            eq(amazonRefunds.userId, userId),
            inArray(amazonRefunds.amazonOrderId, [...new Set(amazonOrderIds)]),
          )
        : eq(amazonRefunds.userId, userId),
    )
    .groupBy(amazonRefunds.amazonOrderId);
  return new Map(rows.map((row) => [row.amazonOrderId, row.n]));
}

function toListRow(
  row: {
    id: string;
    orderId: string;
    amazonOrderId: string;
    channel: string;
    orderDate: string | null;
    orderStatus: string;
    productName: string;
    asin: string;
    quantity: number;
    unitPrice: string | null;
    itemPaid: string | null;
    discounts: string | null;
    paymentLast4: string | null;
    paymentMethod: string;
    subscribeAndSave: boolean;
    shipmentStatus: string;
    shippingOption: string;
    website: string;
    currency: string;
    grandTotal: string | null;
    summaryLines: unknown;
    externalId: string;
  },
  refunds: Map<string, number>,
): AmazonItemListRow & { lineId: string } {
  const grandTotalCents = numericStringToCents(row.grandTotal);
  const lines = asAmazonSummaryLines(row.summaryLines);
  return {
    id: row.id,
    orderId: row.orderId,
    amazonOrderId: row.amazonOrderId,
    channel: row.channel as AmazonChannel,
    orderDate: row.orderDate ?? "",
    orderStatus: row.orderStatus,
    productName: row.productName,
    asin: row.asin,
    quantity: row.quantity,
    unitPriceCents: numericStringToCents(row.unitPrice),
    itemPaidCents: numericStringToCents(row.itemPaid),
    discountsCents: numericStringToCents(row.discounts),
    paymentLast4: row.paymentLast4,
    paymentMethod: row.paymentMethod,
    subscribeAndSave: row.subscribeAndSave,
    shipmentStatus: row.shipmentStatus,
    shippingOption: row.shippingOption,
    website: row.website,
    currency: row.currency,
    refundCount: refunds.get(row.amazonOrderId) ?? 0,
    billName: null,
    matchLabel: null,
    chargeId: null,
    orderGrandTotalCents: grandTotalCents,
    orderSummaryStatus:
      grandTotalCents === null && lines.length === 0
        ? null
        : checkAmazonOrderSummary({ lines, grandTotalCents }).status,
    registerLabel: null,
    registerTransactionId: null,
    lineId: row.externalId,
  };
}

async function stampItemEvidence(
  userId: string,
  rows: (AmazonItemListRow & { lineId: string })[],
): Promise<AmazonItemListRow[]> {
  if (rows.length === 0) return rows;
  const [subscriptions, charges, links, matches, allocations, bills] =
    await Promise.all([
      db
        .select({
          asin: amazonSubscriptions.asin,
          billId: amazonSubscriptions.billId,
          subscriptionId: amazonSubscriptions.amazonSubscriptionId,
        })
        .from(amazonSubscriptions)
        .where(eq(amazonSubscriptions.userId, userId)),
      db
        .select({
          id: amazonCharges.id,
          needsReview: amazonCharges.needsReview,
        })
        .from(amazonCharges)
        .where(eq(amazonCharges.userId, userId)),
      db
        .select({
          chargeId: amazonChargeOrders.chargeId,
          amazonOrderId: amazonChargeOrders.amazonOrderId,
        })
        .from(amazonChargeOrders)
        .where(eq(amazonChargeOrders.userId, userId)),
      db
        .select({
          chargeId: amazonChargeMatches.chargeId,
          transactionId: amazonChargeMatches.transactionId,
          transactionDate: financeTransactions.transactionDate,
        })
        .from(amazonChargeMatches)
        .innerJoin(
          financeTransactions,
          and(
            eq(financeTransactions.id, amazonChargeMatches.transactionId),
            eq(financeTransactions.userId, userId),
          ),
        )
        .where(eq(amazonChargeMatches.userId, userId)),
      db
        .select({
          lineId: amazonReceiptAllocations.lineId,
          billId: amazonReceiptAllocations.billId,
        })
        .from(amazonReceiptAllocations)
        .where(eq(amazonReceiptAllocations.userId, userId)),
      db
        .select({
          id: financeBudgetCategories.id,
          name: financeBudgetCategories.name,
        })
        .from(financeBudgetCategories)
        .where(eq(financeBudgetCategories.userId, userId)),
    ]);
  const billNameById = new Map(bills.map((row) => [row.id, row.name]));
  const billByAsin = new Map<string, string>();
  const asinCounts = new Map<string, number>();
  for (const row of subscriptions) {
    if (!row.asin || !row.billId) continue;
    asinCounts.set(row.asin, (asinCounts.get(row.asin) ?? 0) + 1);
    billByAsin.set(row.asin, row.billId);
  }
  const uniqueBillByAsin = new Map<string, string>();
  for (const [asin, billId] of billByAsin) {
    if (asinCounts.get(asin) === 1) uniqueBillByAsin.set(asin, billId);
  }
  const billByLine = new Map(
    allocations.flatMap((row) =>
      row.billId ? [[row.lineId, row.billId] as const] : [],
    ),
  );
  const matchedCharges = new Set(matches.map((row) => row.chargeId));
  const matchByCharge = new Map(matches.map((row) => [row.chargeId, row]));
  const reviewCharges = new Set(
    charges.filter((row) => row.needsReview).map((row) => row.id),
  );
  const chargesByOrder = new Map<string, string[]>();
  for (const link of links) {
    const list = chargesByOrder.get(link.amazonOrderId) ?? [];
    list.push(link.chargeId);
    chargesByOrder.set(link.amazonOrderId, list);
  }
  return rows.map((row) => {
    const billId = billByLine.get(row.lineId) ?? uniqueBillByAsin.get(row.asin) ?? null;
    const chargeIds = chargesByOrder.get(row.amazonOrderId) ?? [];
    const reviewId = chargeIds.find((id) => reviewCharges.has(id)) ?? null;
    const matchedId = chargeIds.find((id) => matchedCharges.has(id)) ?? null;
    let matchLabel: string | null = null;
    if (reviewId) matchLabel = "Review";
    else if (matchedId) matchLabel = "Matched";
    // The order's register link is derived: order → its charges → their matched rows. A
    // multi-shipment order reaches one row per charge, so the count is shown rather than a
    // single date pretending to be the whole story.
    const linked = chargeIds.flatMap((id) => {
      const match = matchByCharge.get(id);
      return match ? [match] : [];
    });
    const { lineId: _lineId, ...rest } = row;
    return {
      ...rest,
      billName: billId ? (billNameById.get(billId) ?? null) : null,
      matchLabel,
      chargeId: reviewId ?? matchedId,
      registerLabel:
        linked.length === 0
          ? null
          : linked.length === 1
            ? linked[0].transactionDate
            : `${linked.length} rows`,
      registerTransactionId: linked.length === 1 ? linked[0].transactionId : null,
    };
  });
}

export type AmazonOrderSummaryRow = {
  amazonOrderId: string;
  orderDate: string;
  itemsSubtotalCents: number | null;
  shippingHandlingCents: number | null;
  promotionCents: number | null;
  taxCents: number | null;
  grandTotalCents: number | null;
  source: AmazonSummarySource | null;
  lines: AmazonOrderSummaryLine[];
  check: AmazonSummaryCheck;
};

/**
 * Amazon's printed money for the named orders, with the reconciliation check attached.
 *
 * The check travels with the row rather than being recomputed by each caller, so the grid
 * header and the review drawer cannot disagree about whether an order adds up.
 */
export async function listAmazonOrderSummaries(
  userId: string,
  amazonOrderIds?: readonly string[],
): Promise<AmazonOrderSummaryRow[]> {
  if (amazonOrderIds && amazonOrderIds.length === 0) return [];
  const rows = await db
    .select({
      amazonOrderId: amazonOrders.amazonOrderId,
      orderDate: amazonOrders.orderDate,
      itemsSubtotal: amazonOrders.itemsSubtotal,
      shippingHandling: amazonOrders.shippingHandling,
      promotion: amazonOrders.promotion,
      tax: amazonOrders.tax,
      grandTotal: amazonOrders.grandTotal,
      summaryLines: amazonOrders.summaryLines,
      summarySource: amazonOrders.summarySource,
    })
    .from(amazonOrders)
    .where(
      amazonOrderIds
        ? and(
            eq(amazonOrders.userId, userId),
            inArray(amazonOrders.amazonOrderId, [...new Set(amazonOrderIds)]),
          )
        : eq(amazonOrders.userId, userId),
    );
  return rows.map((row) => {
    const lines = asAmazonSummaryLines(row.summaryLines);
    const grandTotalCents = numericStringToCents(row.grandTotal);
    return {
      amazonOrderId: row.amazonOrderId,
      orderDate: row.orderDate ?? "",
      itemsSubtotalCents: numericStringToCents(row.itemsSubtotal),
      shippingHandlingCents: numericStringToCents(row.shippingHandling),
      promotionCents: numericStringToCents(row.promotion),
      taxCents: numericStringToCents(row.tax),
      grandTotalCents,
      source: asAmazonSummarySource(row.summarySource),
      lines,
      check: checkAmazonOrderSummary({ lines, grandTotalCents }),
    };
  });
}

export type AmazonReviewLine = {
  amazonOrderId: string;
  productName: string;
  itemPaidCents: number | null;
};

export type AmazonReviewRow = {
  kind: "charge" | "subscription";
  id: string;
  title: string;
  reason: string;
  date: string;
  amountCents: number | null;
  amazonOrderIds: string[];
  lines: AmazonReviewLine[];
  /**
   * Amazon's printed summary for each order the charge covers, verbatim. Shown beside the
   * item allocations so an unexplained amount is visible rather than smeared across lines.
   */
  summaries: AmazonOrderSummaryRow[];
};

export async function listAmazonReviewItems(
  userId: string,
): Promise<AmazonReviewRow[]> {
  const [charges, subscriptions] = await Promise.all([
    db
      .select()
      .from(amazonCharges)
      .where(
        and(eq(amazonCharges.userId, userId), eq(amazonCharges.needsReview, true)),
      ),
    db
      .select()
      .from(amazonSubscriptions)
      .where(
        and(
          eq(amazonSubscriptions.userId, userId),
          eq(amazonSubscriptions.needsReview, true),
        ),
      ),
  ]);
  const chargeIds = charges.map((row) => row.id);
  const links =
    chargeIds.length === 0
      ? []
      : await db
          .select({
            chargeId: amazonChargeOrders.chargeId,
            amazonOrderId: amazonChargeOrders.amazonOrderId,
          })
          .from(amazonChargeOrders)
          .where(
            and(
              eq(amazonChargeOrders.userId, userId),
              inArray(amazonChargeOrders.chargeId, chargeIds),
            ),
          );
  const orderIds = [...new Set(links.map((row) => row.amazonOrderId))];
  const itemRows =
    orderIds.length === 0
      ? []
      : await db
          .select({
            amazonOrderId: amazonOrderItems.amazonOrderId,
            productName: amazonOrderItems.productName,
            itemPaid: amazonOrderItems.itemPaid,
          })
          .from(amazonOrderItems)
          .where(
            and(
              eq(amazonOrderItems.userId, userId),
              inArray(amazonOrderItems.amazonOrderId, orderIds),
            ),
          );
  const ordersByCharge = new Map<string, string[]>();
  for (const link of links) {
    const list = ordersByCharge.get(link.chargeId) ?? [];
    list.push(link.amazonOrderId);
    ordersByCharge.set(link.chargeId, list);
  }
  const summaries = await listAmazonOrderSummaries(userId, orderIds);
  const summaryByOrder = new Map(summaries.map((row) => [row.amazonOrderId, row]));
  const linesByOrder = new Map<string, AmazonReviewLine[]>();
  for (const row of itemRows) {
    const list = linesByOrder.get(row.amazonOrderId) ?? [];
    list.push({
      amazonOrderId: row.amazonOrderId,
      productName: row.productName,
      itemPaidCents: numericStringToCents(row.itemPaid),
    });
    linesByOrder.set(row.amazonOrderId, list);
  }

  return [
    ...charges.map((row) => {
      const amazonOrderIds = [...new Set(ordersByCharge.get(row.id) ?? [])];
      return {
        kind: "charge" as const,
        id: row.id,
        title: amazonReviewChargeTitle(amazonOrderIds),
        reason: row.reviewReason,
        date: row.paymentDate ?? "",
        amountCents: numericStringToCents(row.amount),
        amazonOrderIds,
        lines: amazonOrderIds.flatMap((orderId) => linesByOrder.get(orderId) ?? []),
        summaries: amazonOrderIds.flatMap((orderId) => {
          const summary = summaryByOrder.get(orderId);
          return summary ? [summary] : [];
        }),
      };
    }),
    ...subscriptions.map((row) => ({
      kind: "subscription" as const,
      id: row.id,
      title: row.productName || row.amazonSubscriptionId,
      reason: row.reviewReason,
      date: row.nextDeliveryDate ?? "",
      amountCents: null,
      amazonOrderIds: [] as string[],
      lines: [] as AmazonReviewLine[],
      summaries: [] as AmazonOrderSummaryRow[],
    })),
  ];
}

export async function getAmazonItem(
  userId: string,
  id: string,
): Promise<AmazonItemListRow | null> {
  const [row] = await listAmazonItemsByIds(userId, [id]);
  return row ?? null;
}

export async function countAmazonItems(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(amazonOrderItems)
    .where(eq(amazonOrderItems.userId, userId));
  return row?.n ?? 0;
}

export async function listAmazonSubscriptions(userId: string) {
  return db
    .select()
    .from(amazonSubscriptions)
    .where(eq(amazonSubscriptions.userId, userId))
    .orderBy(desc(amazonSubscriptions.capturedOn), amazonSubscriptions.productName);
}

export async function getAmazonSubscription(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(amazonSubscriptions)
    .where(and(eq(amazonSubscriptions.userId, userId), eq(amazonSubscriptions.id, id)))
    .limit(1);
  return row ?? null;
}

export async function listAmazonCharges(userId: string) {
  return db
    .select()
    .from(amazonCharges)
    .where(eq(amazonCharges.userId, userId))
    .orderBy(desc(amazonCharges.paymentDate), amazonCharges.amazonPaymentId);
}

export async function getAmazonCharge(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(amazonCharges)
    .where(and(eq(amazonCharges.userId, userId), eq(amazonCharges.id, id)))
    .limit(1);
  return row ?? null;
}

export async function listAmazonChargeOrders(userId: string, chargeId: string) {
  return db
    .select()
    .from(amazonChargeOrders)
    .where(
      and(
        eq(amazonChargeOrders.userId, userId),
        eq(amazonChargeOrders.chargeId, chargeId),
      ),
    );
}

export async function getAmazonChargeMatch(userId: string, chargeId: string) {
  const [row] = await db
    .select()
    .from(amazonChargeMatches)
    .where(
      and(
        eq(amazonChargeMatches.userId, userId),
        eq(amazonChargeMatches.chargeId, chargeId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listAmazonReceiptAllocations(userId: string, chargeId: string) {
  return db
    .select()
    .from(amazonReceiptAllocations)
    .where(
      and(
        eq(amazonReceiptAllocations.userId, userId),
        eq(amazonReceiptAllocations.chargeId, chargeId),
      ),
    );
}
