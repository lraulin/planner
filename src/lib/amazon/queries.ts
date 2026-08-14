import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { amazonOrderItems, amazonOrders, amazonRefunds } from "@/db/schema";
import { numericStringToCents } from "@/lib/finances/money";
import type { AmazonChannel, AmazonItemListRow } from "./types";

/**
 * Every Amazon line item for the user, newest order first. Refund count is per order
 * so a cancelled/refunded purchase is visible on the row.
 */
export async function listAmazonItems(userId: string): Promise<AmazonItemListRow[]> {
  const refundCount = sql<number>`coalesce((
    select count(*)::int from ${amazonRefunds}
    where ${amazonRefunds.userId} = ${userId}
      and ${amazonRefunds.amazonOrderId} = ${amazonOrders.amazonOrderId}
  ), 0)`;

  const rows = await db
    .select({
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
      refundCount,
    })
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

  return rows.map((row) => ({
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
    refundCount: row.refundCount,
  }));
}

export async function getAmazonItem(
  userId: string,
  id: string,
): Promise<AmazonItemListRow | null> {
  const rows = await listAmazonItems(userId);
  return rows.find((row) => row.id === id) ?? null;
}

export async function countAmazonItems(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(amazonOrderItems)
    .where(eq(amazonOrderItems.userId, userId));
  return row?.n ?? 0;
}
