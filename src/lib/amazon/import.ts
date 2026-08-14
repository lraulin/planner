import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  amazonOrderItems,
  amazonOrders,
  amazonRefunds,
  amazonReplacements,
  amazonReturns,
} from "@/db/schema";
import { centsToNumericString, numericStringToCents } from "@/lib/finances/money";
import { parseSlimJson } from "./slim";
import { AMAZON_FEEDS, type AmazonImportResult, type SlimAmazonOrders } from "./types";

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Db | Tx;

const INSERT_CHUNK = 400;

function dateOrNull(value: string | undefined): string | null {
  return value ? value : null;
}

function money(cents: number | null | undefined): string | null {
  return cents === null || cents === undefined ? null : centsToNumericString(cents);
}

function sameText(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  return (left ?? "") === (right ?? "");
}

function sameMoney(stored: string | null, cents: number | null | undefined): boolean {
  return numericStringToCents(stored) === (cents ?? null);
}

function sameDate(stored: string | null, incoming: string | undefined): boolean {
  return (stored ?? "") === (incoming ?? "");
}

export type AmazonImportInput = { userId: string; text: string };

/**
 * Persist a slim Amazon document. Upserts Amazon-owned fields; never writes
 * `finance_transactions`.
 */
export async function importAmazonSlim(
  input: AmazonImportInput,
): Promise<AmazonImportResult> {
  const parsed = parseSlimJson(input.text);
  if (!parsed.ok) throw new Error(parsed.error);
  return persistSlim(input.userId, parsed.data);
}

export async function persistSlim(
  userId: string,
  document: SlimAmazonOrders,
): Promise<AmazonImportResult> {
  return db.transaction(async (tx) => {
    const orders = await upsertOrders(tx, userId, document);
    const items = await upsertItems(tx, userId, document);
    const refunds = await upsertRefunds(tx, userId, document);
    const returns = await upsertReturns(tx, userId, document);
    const replacements = await upsertReplacements(tx, userId, document);
    return {
      ordersCreated: orders.created,
      ordersUpdated: orders.updated,
      ordersUnchanged: orders.unchanged,
      itemsCreated: items.created,
      itemsUpdated: items.updated,
      itemsUnchanged: items.unchanged,
      refundsCreated: refunds.created,
      refundsUpdated: refunds.updated,
      refundsUnchanged: refunds.unchanged,
      returnsCreated: returns.created,
      returnsUpdated: returns.updated,
      returnsUnchanged: returns.unchanged,
      replacementsCreated: replacements.created,
      replacementsUpdated: replacements.updated,
      replacementsUnchanged: replacements.unchanged,
    };
  });
}

type Counts = { created: number; updated: number; unchanged: number };

async function upsertOrders(
  tx: Executor,
  userId: string,
  document: SlimAmazonOrders,
): Promise<Counts> {
  const existing = await tx
    .select()
    .from(amazonOrders)
    .where(eq(amazonOrders.userId, userId));
  const byExt = new Map(existing.map((row) => [row.externalId, row]));
  const counts: Counts = { created: 0, updated: 0, unchanged: 0 };
  const toInsert: (typeof amazonOrders.$inferInsert)[] = [];

  for (const order of document.orders) {
    const values = {
      userId,
      amazonOrderId: order.amazonOrderId,
      channel: order.channel,
      orderDate: dateOrNull(order.orderDate),
      orderStatus: order.orderStatus,
      paymentMethod: order.paymentMethod,
      paymentLast4: order.paymentLast4,
      website: order.website,
      currency: order.currency || "USD",
      externalSource: AMAZON_FEEDS.order,
      externalId: order.amazonOrderId,
    };
    const found = byExt.get(order.amazonOrderId);
    if (!found) {
      toInsert.push(values);
      continue;
    }
    const changed =
      found.channel !== values.channel ||
      !sameDate(found.orderDate, order.orderDate) ||
      !sameText(found.orderStatus, values.orderStatus) ||
      !sameText(found.paymentMethod, values.paymentMethod) ||
      !sameText(found.paymentLast4, values.paymentLast4) ||
      !sameText(found.website, values.website) ||
      !sameText(found.currency, values.currency);
    if (!changed) {
      counts.unchanged += 1;
      continue;
    }
    await tx
      .update(amazonOrders)
      .set({
        channel: values.channel,
        orderDate: values.orderDate,
        orderStatus: values.orderStatus,
        paymentMethod: values.paymentMethod,
        paymentLast4: values.paymentLast4,
        website: values.website,
        currency: values.currency,
        updatedAt: new Date(),
      })
      .where(and(eq(amazonOrders.id, found.id), eq(amazonOrders.userId, userId)));
    counts.updated += 1;
  }

  await insertChunks(tx, amazonOrders, toInsert);
  counts.created += toInsert.length;
  return counts;
}

async function upsertItems(
  tx: Executor,
  userId: string,
  document: SlimAmazonOrders,
): Promise<Counts> {
  const orders = await tx
    .select({ id: amazonOrders.id, amazonOrderId: amazonOrders.amazonOrderId })
    .from(amazonOrders)
    .where(eq(amazonOrders.userId, userId));
  const orderIdByAmazon = new Map(orders.map((row) => [row.amazonOrderId, row.id]));

  const existing = await tx
    .select()
    .from(amazonOrderItems)
    .where(eq(amazonOrderItems.userId, userId));
  const byExt = new Map(existing.map((row) => [row.externalId, row]));
  const counts: Counts = { created: 0, updated: 0, unchanged: 0 };
  const toInsert: (typeof amazonOrderItems.$inferInsert)[] = [];

  for (const item of document.items) {
    const orderId = orderIdByAmazon.get(item.amazonOrderId);
    if (!orderId) {
      throw new Error(`Item ${item.lineId} has no order ${item.amazonOrderId}.`);
    }
    const values = {
      userId,
      orderId,
      amazonOrderId: item.amazonOrderId,
      channel: item.channel,
      asin: item.asin,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: money(item.unitPriceCents),
      unitPriceTax: money(item.unitPriceTaxCents),
      itemPaid: money(item.itemPaidCents),
      itemTax: money(item.itemTaxCents),
      discounts: money(item.discountsCents),
      shippingCharge: money(item.shippingChargeCents),
      shippingOption: item.shippingOption,
      shipmentStatus: item.shipmentStatus,
      subscribeAndSave: item.subscribeAndSave,
      shipDate: dateOrNull(item.shipDate),
      externalSource: AMAZON_FEEDS.item,
      externalId: item.lineId,
    };
    const found = byExt.get(item.lineId);
    if (!found) {
      toInsert.push(values);
      continue;
    }
    const changed =
      found.channel !== values.channel ||
      !sameText(found.asin, values.asin) ||
      !sameText(found.productName, values.productName) ||
      found.quantity !== values.quantity ||
      !sameMoney(found.unitPrice, item.unitPriceCents) ||
      !sameMoney(found.unitPriceTax, item.unitPriceTaxCents) ||
      !sameMoney(found.itemPaid, item.itemPaidCents) ||
      !sameMoney(found.itemTax, item.itemTaxCents) ||
      !sameMoney(found.discounts, item.discountsCents) ||
      !sameMoney(found.shippingCharge, item.shippingChargeCents) ||
      !sameText(found.shippingOption, values.shippingOption) ||
      !sameText(found.shipmentStatus, values.shipmentStatus) ||
      found.subscribeAndSave !== values.subscribeAndSave ||
      !sameDate(found.shipDate, item.shipDate);
    if (!changed) {
      counts.unchanged += 1;
      continue;
    }
    await tx
      .update(amazonOrderItems)
      .set({
        channel: values.channel,
        asin: values.asin,
        productName: values.productName,
        quantity: values.quantity,
        unitPrice: values.unitPrice,
        unitPriceTax: values.unitPriceTax,
        itemPaid: values.itemPaid,
        itemTax: values.itemTax,
        discounts: values.discounts,
        shippingCharge: values.shippingCharge,
        shippingOption: values.shippingOption,
        shipmentStatus: values.shipmentStatus,
        subscribeAndSave: values.subscribeAndSave,
        shipDate: values.shipDate,
        updatedAt: new Date(),
      })
      .where(
        and(eq(amazonOrderItems.id, found.id), eq(amazonOrderItems.userId, userId)),
      );
    counts.updated += 1;
  }

  await insertChunks(tx, amazonOrderItems, toInsert);
  counts.created += toInsert.length;
  return counts;
}

async function upsertRefunds(
  tx: Executor,
  userId: string,
  document: SlimAmazonOrders,
): Promise<Counts> {
  const existing = await tx
    .select()
    .from(amazonRefunds)
    .where(eq(amazonRefunds.userId, userId));
  const byExt = new Map(existing.map((row) => [row.externalId, row]));
  const counts: Counts = { created: 0, updated: 0, unchanged: 0 };
  const toInsert: (typeof amazonRefunds.$inferInsert)[] = [];

  for (const refund of document.refunds) {
    const values = {
      userId,
      amazonOrderId: refund.amazonOrderId,
      channel: refund.channel,
      refundDate: dateOrNull(refund.refundDate),
      creationDate: dateOrNull(refund.creationDate),
      amount: money(refund.amountCents),
      currency: refund.currency || "USD",
      status: refund.status,
      reason: refund.reason,
      disbursementType: refund.disbursementType,
      productName: refund.productName,
      asin: refund.asin,
      externalSource: AMAZON_FEEDS.refund,
      externalId: refund.lineId,
    };
    const found = byExt.get(refund.lineId);
    if (!found) {
      toInsert.push(values);
      continue;
    }
    const changed =
      !sameText(found.status, values.status) ||
      !sameText(found.reason, values.reason) ||
      !sameMoney(found.amount, refund.amountCents) ||
      !sameDate(found.refundDate, refund.refundDate);
    if (!changed) {
      counts.unchanged += 1;
      continue;
    }
    await tx
      .update(amazonRefunds)
      .set({
        channel: values.channel,
        refundDate: values.refundDate,
        creationDate: values.creationDate,
        amount: values.amount,
        currency: values.currency,
        status: values.status,
        reason: values.reason,
        disbursementType: values.disbursementType,
        productName: values.productName,
        asin: values.asin,
        updatedAt: new Date(),
      })
      .where(and(eq(amazonRefunds.id, found.id), eq(amazonRefunds.userId, userId)));
    counts.updated += 1;
  }

  await insertChunks(tx, amazonRefunds, toInsert);
  counts.created += toInsert.length;
  return counts;
}

async function upsertReturns(
  tx: Executor,
  userId: string,
  document: SlimAmazonOrders,
): Promise<Counts> {
  const existing = await tx
    .select()
    .from(amazonReturns)
    .where(eq(amazonReturns.userId, userId));
  const byExt = new Map(existing.map((row) => [row.externalId, row]));
  const counts: Counts = { created: 0, updated: 0, unchanged: 0 };
  const toInsert: (typeof amazonReturns.$inferInsert)[] = [];

  const seen = new Set<string>();
  for (const row of document.returns) {
    if (seen.has(row.lineId)) continue;
    seen.add(row.lineId);
    const values = {
      userId,
      amazonOrderId: row.amazonOrderId,
      returnDate: dateOrNull(row.returnDate),
      creationDate: dateOrNull(row.creationDate),
      amount: money(row.amountCents),
      currency: row.currency || "USD",
      resolution: row.resolution,
      reason: row.reason,
      replacementOrderId: row.replacementOrderId,
      externalSource: AMAZON_FEEDS.return,
      externalId: row.lineId,
    };
    const found = byExt.get(row.lineId);
    if (!found) {
      toInsert.push(values);
      continue;
    }
    const changed =
      !sameText(found.resolution, values.resolution) ||
      !sameText(found.reason, values.reason) ||
      !sameMoney(found.amount, row.amountCents) ||
      !sameDate(found.returnDate, row.returnDate);
    if (!changed) {
      counts.unchanged += 1;
      continue;
    }
    await tx
      .update(amazonReturns)
      .set({
        returnDate: values.returnDate,
        creationDate: values.creationDate,
        amount: values.amount,
        currency: values.currency,
        resolution: values.resolution,
        reason: values.reason,
        replacementOrderId: values.replacementOrderId,
        updatedAt: new Date(),
      })
      .where(and(eq(amazonReturns.id, found.id), eq(amazonReturns.userId, userId)));
    counts.updated += 1;
  }

  await insertChunks(tx, amazonReturns, toInsert);
  counts.created += toInsert.length;
  return counts;
}

async function upsertReplacements(
  tx: Executor,
  userId: string,
  document: SlimAmazonOrders,
): Promise<Counts> {
  const existing = await tx
    .select()
    .from(amazonReplacements)
    .where(eq(amazonReplacements.userId, userId));
  const byExt = new Map(existing.map((row) => [row.externalId, row]));
  const counts: Counts = { created: 0, updated: 0, unchanged: 0 };
  const toInsert: (typeof amazonReplacements.$inferInsert)[] = [];

  for (const row of document.replacements) {
    const values = {
      userId,
      amazonOrderId: row.amazonOrderId,
      replacementOrderId: row.replacementOrderId,
      externalSource: AMAZON_FEEDS.replacement,
      externalId: row.amazonOrderId,
    };
    const found = byExt.get(row.amazonOrderId);
    if (!found) {
      toInsert.push(values);
      continue;
    }
    if (sameText(found.replacementOrderId, values.replacementOrderId)) {
      counts.unchanged += 1;
      continue;
    }
    await tx
      .update(amazonReplacements)
      .set({
        replacementOrderId: values.replacementOrderId,
        updatedAt: new Date(),
      })
      .where(
        and(eq(amazonReplacements.id, found.id), eq(amazonReplacements.userId, userId)),
      );
    counts.updated += 1;
  }

  await insertChunks(tx, amazonReplacements, toInsert);
  counts.created += toInsert.length;
  return counts;
}

async function insertChunks<T extends { externalId?: string }>(
  tx: Executor,
  table: Parameters<Executor["insert"]>[0],
  rows: T[],
): Promise<void> {
  const unique: T[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const key = row.externalId ?? "";
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    unique.push(row);
  }
  for (let i = 0; i < unique.length; i += INSERT_CHUNK) {
    const chunk = unique.slice(i, i + INSERT_CHUNK);
    if (chunk.length === 0) continue;
    await tx.insert(table).values(chunk);
  }
}
