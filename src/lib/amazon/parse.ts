import {
  amazonAmountCents,
  amazonBlank,
  amazonDateKey,
  amazonQuantity,
  csvTable,
  paymentLast4,
  requireHeaders,
} from "./csv";
import { SNS_SHIPPING_OPTION } from "./types";
import type {
  AmazonChannel,
  ParseWarnings,
  SlimItem,
  SlimRefund,
  SlimReplacement,
  SlimReturn,
} from "./types";

const RETAIL_HEADERS = [
  "Order ID",
  "ASIN",
  "Product Name",
  "Order Date",
  "Order Status",
  "Original Quantity",
  "Payment Method Type",
  "Unit Price",
  "Unit Price Tax",
  "Total Amount",
  "Total Discounts",
  "Shipment Item Subtotal Tax",
  "Shipping Charge",
  "Shipping Option",
  "Shipment Status",
  "Ship Date",
  "Website",
  "Currency",
] as const;

const DIGITAL_HEADERS = [
  "Order ID",
  "Digital Order Item ID",
  "ASIN",
  "Product Name",
  "Order Date",
  "Order Status",
  "Quantity Ordered",
  "Component Type",
  "Transaction Amount",
  "Marketplace",
] as const;

const REFUND_HEADERS = [
  "Order ID",
  "Refund Date",
  "Creation Date",
  "Refund Amount",
  "Currency",
  "Reversal Status",
  "Reversal Reason",
  "Disbursement Type",
] as const;

const RETURN_HEADERS = [
  "Order ID",
  "Contract ID",
  "Date of Return",
  "Return Creation Date",
  "Return Amount",
  "Return Amount Currency",
  "Return Resolution",
  "Return Reason",
  "Replacement Order",
] as const;

const REPLACEMENT_HEADERS = ["Order ID", "Replacement Order ID"] as const;

const DIGITAL_RETURN_HEADERS = [
  "Order ID",
  "Digital Order Item ID",
  "ASIN",
  "Product Name",
  "Return Date",
  "Amount Refunded",
  "Return Status",
  "Reason Code",
] as const;

export function parseRetailItems(
  text: string,
): { items: SlimItem[]; error: string | null } & ParseWarnings {
  const table = csvTable(text);
  const error = requireHeaders(table, RETAIL_HEADERS, "Order History.csv");
  if (error) return { items: [], error, errors: [{ row: 1, message: error }] };

  const ordinals = new Map<string, number>();
  const items: SlimItem[] = [];
  const errors: { row: number; message: string }[] = [];

  for (const { row, cells } of table.rows) {
    const amazonOrderId = amazonBlank(cells["Order ID"]);
    if (!amazonOrderId) {
      errors.push({ row, message: "Missing Order ID." });
      continue;
    }
    const asin = amazonBlank(cells.ASIN);
    const key = `${amazonOrderId}:${asin}`;
    const ordinal = ordinals.get(key) ?? 0;
    ordinals.set(key, ordinal + 1);
    const shippingOption = amazonBlank(cells["Shipping Option"]);
    const paymentMethod = amazonBlank(cells["Payment Method Type"]);
    items.push({
      lineId: `${amazonOrderId}:${asin}:${ordinal}`,
      amazonOrderId,
      channel: "retail",
      asin,
      productName: amazonBlank(cells["Product Name"]),
      quantity: amazonQuantity(cells["Original Quantity"]),
      unitPriceCents: amazonAmountCents(cells["Unit Price"]),
      unitPriceTaxCents: amazonAmountCents(cells["Unit Price Tax"]),
      itemPaidCents: amazonAmountCents(cells["Total Amount"]),
      itemTaxCents: amazonAmountCents(cells["Shipment Item Subtotal Tax"]),
      discountsCents: amazonAmountCents(cells["Total Discounts"]),
      shippingChargeCents: amazonAmountCents(cells["Shipping Charge"]),
      shippingOption,
      shipmentStatus: amazonBlank(cells["Shipment Status"]),
      subscribeAndSave: shippingOption === SNS_SHIPPING_OPTION,
      shipDate: amazonDateKey(cells["Ship Date"]),
      orderDate: amazonDateKey(cells["Order Date"]),
      orderStatus: amazonBlank(cells["Order Status"]),
      paymentMethod,
      paymentLast4: paymentLast4(paymentMethod),
      website: amazonBlank(cells.Website),
      currency: amazonBlank(cells.Currency) || "USD",
    });
  }

  return { items, error: null, errors };
}

/**
 * Digital Content Orders is exploded into Price Amount / Tax component rows.
 * Collapse on Digital Order Item ID. Paid is the Price-Amount sum (discounts
 * arrive as extra negative Price rows).
 */
export function parseDigitalItems(
  text: string,
): { items: SlimItem[]; error: string | null } & ParseWarnings {
  const table = csvTable(text);
  const error = requireHeaders(table, DIGITAL_HEADERS, "Digital Content Orders.csv");
  if (error) return { items: [], error, errors: [{ row: 1, message: error }] };

  type Acc = SlimItem & { seenPrice: boolean };
  const byItem = new Map<string, Acc>();
  const errors: { row: number; message: string }[] = [];

  for (const { row, cells } of table.rows) {
    const lineId = amazonBlank(cells["Digital Order Item ID"]);
    const amazonOrderId = amazonBlank(cells["Order ID"]);
    if (!lineId || !amazonOrderId) {
      errors.push({ row, message: "Missing Digital Order Item ID or Order ID." });
      continue;
    }
    const component = amazonBlank(cells["Component Type"]);
    const txn = amazonAmountCents(cells["Transaction Amount"]) ?? 0;
    let acc = byItem.get(lineId);
    if (!acc) {
      const paymentMethod = amazonBlank(cells["Payment Information"]);
      acc = {
        lineId,
        amazonOrderId,
        channel: "digital",
        asin: amazonBlank(cells.ASIN),
        productName: amazonBlank(cells["Product Name"]),
        quantity: amazonQuantity(cells["Quantity Ordered"]),
        unitPriceCents: null,
        unitPriceTaxCents: null,
        itemPaidCents: 0,
        itemTaxCents: 0,
        discountsCents: null,
        shippingChargeCents: null,
        shippingOption: "",
        shipmentStatus: "",
        subscribeAndSave: false,
        shipDate: "",
        orderDate: amazonDateKey(cells["Order Date"]),
        orderStatus: amazonBlank(cells["Order Status"]),
        paymentMethod,
        paymentLast4: paymentLast4(paymentMethod),
        website: amazonBlank(cells.Marketplace),
        currency: "USD",
        seenPrice: false,
      };
      byItem.set(lineId, acc);
    }
    if (component === "Tax") {
      acc.itemTaxCents = (acc.itemTaxCents ?? 0) + txn;
    } else if (component === "Price Amount" || component === "") {
      acc.itemPaidCents = (acc.itemPaidCents ?? 0) + txn;
      acc.seenPrice = true;
    }
    if (!acc.productName) acc.productName = amazonBlank(cells["Product Name"]);
    if (!acc.asin) acc.asin = amazonBlank(cells.ASIN);
  }

  const items = [...byItem.values()].map(({ seenPrice: _seen, ...item }) => item);
  return { items, error: null, errors };
}

export function parseRefunds(
  text: string,
  channel: AmazonChannel = "retail",
): { refunds: SlimRefund[]; error: string | null } & ParseWarnings {
  const table = csvTable(text);
  const error = requireHeaders(table, REFUND_HEADERS, "Refund Details.csv");
  if (error) return { refunds: [], error, errors: [{ row: 1, message: error }] };

  const ordinals = new Map<string, number>();
  const refunds: SlimRefund[] = [];
  const errors: { row: number; message: string }[] = [];

  for (const { row, cells } of table.rows) {
    const amazonOrderId = amazonBlank(cells["Order ID"]);
    if (!amazonOrderId) {
      errors.push({ row, message: "Missing Order ID." });
      continue;
    }
    const refundDate = amazonDateKey(cells["Refund Date"]);
    const amountCents = amazonAmountCents(cells["Refund Amount"]);
    const key = `${amazonOrderId}:${refundDate}:${amountCents ?? ""}`;
    const ordinal = ordinals.get(key) ?? 0;
    ordinals.set(key, ordinal + 1);
    refunds.push({
      lineId: `refund:${key}:${ordinal}`,
      amazonOrderId,
      channel,
      refundDate,
      creationDate: amazonDateKey(cells["Creation Date"]),
      amountCents,
      currency: amazonBlank(cells.Currency) || "USD",
      status: amazonBlank(cells["Reversal Status"]),
      reason: amazonBlank(cells["Reversal Reason"]),
      disbursementType: amazonBlank(cells["Disbursement Type"]),
      productName: "",
      asin: "",
    });
  }
  return { refunds, error: null, errors };
}

export function parseDigitalReturns(
  text: string,
): { refunds: SlimRefund[]; error: string | null } & ParseWarnings {
  const table = csvTable(text);
  const error = requireHeaders(table, DIGITAL_RETURN_HEADERS, "Digital Returns.csv");
  if (error) return { refunds: [], error, errors: [{ row: 1, message: error }] };

  const byItem = new Map<string, SlimRefund>();
  const errors: { row: number; message: string }[] = [];

  for (const { row, cells } of table.rows) {
    const amazonOrderId = amazonBlank(cells["Order ID"]);
    const digitalItemId = amazonBlank(cells["Digital Order Item ID"]);
    if (!amazonOrderId) {
      errors.push({ row, message: "Missing Order ID." });
      continue;
    }
    const lineId = `drefund:${digitalItemId || amazonOrderId}`;
    if (byItem.has(lineId)) continue;
    byItem.set(lineId, {
      lineId,
      amazonOrderId,
      channel: "digital",
      refundDate: amazonDateKey(cells["Return Date"]),
      creationDate: "",
      amountCents: amazonAmountCents(cells["Amount Refunded"]),
      currency: "USD",
      status: amazonBlank(cells["Return Status"]),
      reason: amazonBlank(cells["Reason Code"]),
      disbursementType: "",
      productName: amazonBlank(cells["Product Name"]),
      asin: amazonBlank(cells.ASIN),
    });
  }
  return { refunds: [...byItem.values()], error: null, errors };
}

export function parseReturns(
  text: string,
): { returns: SlimReturn[]; error: string | null } & ParseWarnings {
  const table = csvTable(text);
  const error = requireHeaders(table, RETURN_HEADERS, "Returns Status.csv");
  if (error) return { returns: [], error, errors: [{ row: 1, message: error }] };

  const returns: SlimReturn[] = [];
  const errors: { row: number; message: string }[] = [];
  const ordinals = new Map<string, number>();

  for (const { row, cells } of table.rows) {
    const amazonOrderId = amazonBlank(cells["Order ID"]);
    if (!amazonOrderId) {
      errors.push({ row, message: "Missing Order ID." });
      continue;
    }
    const contractId = amazonBlank(cells["Contract ID"]);
    const baseId =
      contractId || `return:${amazonOrderId}:${amazonDateKey(cells["Date of Return"])}`;
    const ordinal = ordinals.get(baseId) ?? 0;
    ordinals.set(baseId, ordinal + 1);
    returns.push({
      lineId: `${baseId}:${ordinal}`,
      amazonOrderId,
      returnDate: amazonDateKey(cells["Date of Return"]),
      creationDate: amazonDateKey(cells["Return Creation Date"]),
      amountCents: amazonAmountCents(cells["Return Amount"]),
      currency: amazonBlank(cells["Return Amount Currency"]) || "USD",
      resolution: amazonBlank(cells["Return Resolution"]),
      reason: amazonBlank(cells["Return Reason"]),
      replacementOrderId: amazonBlank(cells["Replacement Order"]),
    });
  }
  return { returns, error: null, errors };
}

export function parseReplacements(
  text: string,
): { replacements: SlimReplacement[]; error: string | null } & ParseWarnings {
  const table = csvTable(text);
  const error = requireHeaders(table, REPLACEMENT_HEADERS, "Replacement Orders.csv");
  if (error) return { replacements: [], error, errors: [{ row: 1, message: error }] };

  const replacements: SlimReplacement[] = [];
  const errors: { row: number; message: string }[] = [];

  for (const { row, cells } of table.rows) {
    const amazonOrderId = amazonBlank(cells["Order ID"]);
    if (!amazonOrderId) {
      errors.push({ row, message: "Missing Order ID." });
      continue;
    }
    const raw = amazonBlank(cells["Replacement Order ID"]);
    const replacementOrderId =
      !raw || raw.toLowerCase().startsWith("no replacement") ? null : raw;
    replacements.push({ amazonOrderId, replacementOrderId });
  }
  return { replacements, error: null, errors };
}
