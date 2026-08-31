import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  amazonOrderItems,
  amazonOrders,
  financeBudgetAllocations,
  financeBudgetCategories,
  financeSupplyItems,
  financeSupplyOptions,
  type SupplyRateBasis,
} from "@/db/schema";
import { numericStringToCents } from "@/lib/finances/money";
import { monthKeyOf } from "@/lib/finances/budget/envelope";
import { localDateKey } from "@/lib/schedule/geometry";

export type SupplyOptionRow = {
  id: string;
  itemId: string;
  brand: string;
  vendor: string;
  qtyPerItem: number;
  costPerOrderCents: number;
  inUse: boolean;
  pricedOn: string | null;
  asin: string;
  notes: string;
};

export type SupplyItemRow = {
  id: string;
  name: string;
  groupLabel: string;
  envelopeId: string | null;
  /** The envelope's name, for the group header's "currently funded from" line. */
  envelopeName: string | null;
  /** What that envelope is assigned this month. Null when nothing links to one. */
  envelopeBudgetedCents: number | null;
  unitLabel: string;
  rateBasis: SupplyRateBasis;
  unitsPerDayMilli: number | null;
  daysPerUnitTenths: number | null;
  notes: string;
  options: SupplyOptionRow[];
};

/**
 * The whole worksheet: every item, its offers, and what its envelope is funded this month.
 *
 * The budgeted figure is read for the **current** month only. The worksheet is a "what does
 * this cost me" surface, not a budget month browser, and comparing an estimate against a
 * month the user is not looking at would be worse than showing nothing.
 */
export async function listSupplyItems(userId: string): Promise<SupplyItemRow[]> {
  const month = monthKeyOf(localDateKey(new Date()));

  const [items, options] = await Promise.all([
    db
      .select({
        id: financeSupplyItems.id,
        name: financeSupplyItems.name,
        groupLabel: financeSupplyItems.groupLabel,
        envelopeId: financeSupplyItems.envelopeId,
        envelopeName: financeBudgetCategories.name,
        envelopeBudgetedCents: financeBudgetAllocations.amountCents,
        unitLabel: financeSupplyItems.unitLabel,
        rateBasis: financeSupplyItems.rateBasis,
        unitsPerDayMilli: financeSupplyItems.unitsPerDayMilli,
        daysPerUnitTenths: financeSupplyItems.daysPerUnitTenths,
        notes: financeSupplyItems.notes,
      })
      .from(financeSupplyItems)
      // Left joins throughout: an item need not name an envelope, and an envelope need not
      // have been assigned anything this month — a missing allocation row means zero, never
      // a missing item (`finance_budget_allocations` is sparse by design).
      .leftJoin(
        financeBudgetCategories,
        and(
          eq(financeBudgetCategories.id, financeSupplyItems.envelopeId),
          eq(financeBudgetCategories.userId, userId),
        ),
      )
      .leftJoin(
        financeBudgetAllocations,
        and(
          eq(financeBudgetAllocations.categoryId, financeBudgetCategories.id),
          eq(financeBudgetAllocations.userId, userId),
          eq(financeBudgetAllocations.month, month),
        ),
      )
      .where(eq(financeSupplyItems.userId, userId))
      .orderBy(asc(financeSupplyItems.groupLabel), asc(financeSupplyItems.name)),
    db
      .select()
      .from(financeSupplyOptions)
      .where(eq(financeSupplyOptions.userId, userId))
      // In-use first, so the row that drives the totals leads its own comparison list.
      .orderBy(
        asc(financeSupplyOptions.itemId),
        sql`${financeSupplyOptions.inUse} desc`,
        asc(financeSupplyOptions.vendor),
      ),
  ]);

  const byItem = new Map<string, SupplyOptionRow[]>();
  for (const option of options) {
    const list = byItem.get(option.itemId) ?? [];
    list.push({
      id: option.id,
      itemId: option.itemId,
      brand: option.brand,
      vendor: option.vendor,
      qtyPerItem: option.qtyPerItem,
      costPerOrderCents: option.costPerOrderCents,
      inUse: option.inUse,
      pricedOn: option.pricedOn,
      asin: option.asin,
      notes: option.notes,
    });
    byItem.set(option.itemId, list);
  }

  return items.map((item) => ({
    ...item,
    envelopeBudgetedCents:
      item.envelopeId === null ? null : (item.envelopeBudgetedCents ?? 0),
    options: byItem.get(item.id) ?? [],
  }));
}

export type AmazonRepeatPurchase = {
  asin: string;
  productName: string;
  /** Distinct orders, not line items — two of the same thing in one order is one buy. */
  orderCount: number;
  totalQuantity: number;
  firstOrderDate: string;
  lastOrderDate: string;
  latestUnitPriceCents: number | null;
  subscribeAndSave: boolean;
};

/**
 * What the order history says you rebuy, aggregated by ASIN.
 *
 * Deliberately **not** built on `listAmazonItems`: that loads every line item ever, unpaged,
 * to answer a question Postgres can answer with one `group by`.
 *
 * Subscribe & Save rows come back below `minOrders` as well. A standing subscription is an
 * explicit statement that something is recurring — better evidence than three scattered
 * orders — and waiting for a third delivery to suggest it would be perverse.
 */
export async function listAmazonRepeatPurchases(
  userId: string,
  options: { minOrders?: number; asin?: string } = {},
): Promise<AmazonRepeatPurchase[]> {
  const minOrders = options.minOrders ?? 3;

  const rows = await db
    .select({
      asin: amazonOrderItems.asin,
      productName: sql<string>`(array_agg(${amazonOrderItems.productName} order by ${amazonOrders.orderDate} desc))[1]`,
      orderCount: sql<number>`count(distinct ${amazonOrderItems.amazonOrderId})::int`,
      totalQuantity: sql<number>`sum(${amazonOrderItems.quantity})::int`,
      firstOrderDate: sql<string>`min(${amazonOrders.orderDate})::text`,
      lastOrderDate: sql<string>`max(${amazonOrders.orderDate})::text`,
      latestUnitPrice: sql<
        string | null
      >`(array_agg(${amazonOrderItems.unitPrice} order by ${amazonOrders.orderDate} desc))[1]`,
      subscribeAndSave: sql<boolean>`bool_or(${amazonOrderItems.subscribeAndSave})`,
    })
    .from(amazonOrderItems)
    .innerJoin(
      amazonOrders,
      and(
        eq(amazonOrders.id, amazonOrderItems.orderId),
        eq(amazonOrders.userId, userId),
      ),
    )
    .where(
      and(
        eq(amazonOrderItems.userId, userId),
        eq(amazonOrderItems.channel, "retail"),
        ne(amazonOrderItems.asin, ""),
        ...(options.asin ? [eq(amazonOrderItems.asin, options.asin)] : []),
        sql`${amazonOrders.orderDate} is not null`,
        sql`lower(${amazonOrders.orderStatus}) not like '%cancel%'`,
      ),
    )
    .groupBy(amazonOrderItems.asin)
    .having(
      sql`count(distinct ${amazonOrderItems.amazonOrderId}) >= ${minOrders}
          or bool_or(${amazonOrderItems.subscribeAndSave})`,
    )
    .orderBy(sql`count(distinct ${amazonOrderItems.amazonOrderId}) desc`);

  return rows.map((row) => ({
    asin: row.asin,
    productName: row.productName,
    orderCount: row.orderCount,
    totalQuantity: row.totalQuantity,
    firstOrderDate: row.firstOrderDate,
    lastOrderDate: row.lastOrderDate,
    latestUnitPriceCents: numericStringToCents(row.latestUnitPrice),
    subscribeAndSave: row.subscribeAndSave,
  }));
}
