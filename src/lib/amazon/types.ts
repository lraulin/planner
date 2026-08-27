/**
 * Slim Amazon order-history document and the row shapes the importer persists.
 *
 * The browser never sees the privacy-request zip. A local script strips it to this
 * versioned JSON; the app only knows this format.
 */

import { VERCEL_BODY_MAX_BYTES } from "@/lib/http/uploadLimits";
import type { AmazonOrderSummary } from "./orderSummary";

export const SLIM_VERSION = 1;
export const SLIM_SOURCE = "amazon-data-request";

export const SNS_SHIPPING_OPTION = "std-sns-us";

export type AmazonChannel = "retail" | "digital";

export type SlimOrder = {
  amazonOrderId: string;
  channel: AmazonChannel;
  /** Calendar day `YYYY-MM-DD`, or "" when Amazon omitted the instant. */
  orderDate: string;
  orderStatus: string;
  paymentMethod: string;
  paymentLast4: string | null;
  website: string;
  currency: string;
  /**
   * Amazon's printed order summary. The browser capture carries one; a privacy-zip document
   * has none on disk and gets a `derived` one at persist time. Optional because slim files
   * written before this existed are still valid.
   */
  summary?: AmazonOrderSummary | null;
};

export type SlimItem = {
  /** Dedup key. Retail: `orderId:asin:ordinal`. Digital: Amazon's item id. */
  lineId: string;
  amazonOrderId: string;
  channel: AmazonChannel;
  asin: string;
  productName: string;
  quantity: number;
  unitPriceCents: number | null;
  unitPriceTaxCents: number | null;
  /** Per-item paid (`Total Amount` / summed digital Price Amount). */
  itemPaidCents: number | null;
  itemTaxCents: number | null;
  discountsCents: number | null;
  /** As Amazon printed it — often shipment-level, not item-level. */
  shippingChargeCents: number | null;
  shippingOption: string;
  shipmentStatus: string;
  subscribeAndSave: boolean;
  shipDate: string;
  orderDate: string;
  orderStatus: string;
  paymentMethod: string;
  paymentLast4: string | null;
  website: string;
  currency: string;
};

export type SlimRefund = {
  lineId: string;
  amazonOrderId: string;
  channel: AmazonChannel;
  refundDate: string;
  creationDate: string;
  amountCents: number | null;
  currency: string;
  status: string;
  reason: string;
  disbursementType: string;
  productName: string;
  asin: string;
};

export type SlimReturn = {
  lineId: string;
  amazonOrderId: string;
  returnDate: string;
  creationDate: string;
  amountCents: number | null;
  currency: string;
  resolution: string;
  reason: string;
  replacementOrderId: string;
};

export type SlimReplacement = {
  amazonOrderId: string;
  replacementOrderId: string | null;
};

export type SlimAmazonOrders = {
  version: typeof SLIM_VERSION;
  source: typeof SLIM_SOURCE;
  generatedAt: string;
  orders: SlimOrder[];
  items: SlimItem[];
  refunds: SlimRefund[];
  returns: SlimReturn[];
  replacements: SlimReplacement[];
};

export type RowError = { row: number; message: string };

export type ParseWarnings = {
  errors: RowError[];
};

/** Basenames the preprocess step looks for inside the zip or a folder. */
export const SLIM_CSV_FILES = {
  retail: "Order History.csv",
  digital: "Digital Content Orders.csv",
  digitalReturns: "Digital Returns.csv",
  refunds: "Refund Details.csv",
  returns: "Returns Status.csv",
  replacements: "Replacement Orders.csv",
} as const;

export type SlimCsvKind = keyof typeof SLIM_CSV_FILES;

/**
 * Vercel Functions reject a request body over 4.5 MB with a 413. The slim file
 * must stay under this so Settings import can reach the route. Pretty-printed
 * dumps of the real order history do not.
 */
export const AMAZON_UPLOAD_MAX_BYTES = VERCEL_BODY_MAX_BYTES;

export function amazonFileTooLargeForUpload(byteLength: number): boolean {
  return byteLength > AMAZON_UPLOAD_MAX_BYTES;
}

export const AMAZON_FEEDS = {
  order: "amazon:order",
  item: "amazon:item",
  refund: "amazon:refund",
  return: "amazon:return",
  replacement: "amazon:replacement",
  subscription: "amazon:subscription",
  charge: "amazon:charge",
} as const;

export type AmazonImportResult = {
  ordersCreated: number;
  ordersUpdated: number;
  ordersUnchanged: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsUnchanged: number;
  refundsCreated: number;
  refundsUpdated: number;
  refundsUnchanged: number;
  returnsCreated: number;
  returnsUpdated: number;
  returnsUnchanged: number;
  replacementsCreated: number;
  replacementsUpdated: number;
  replacementsUnchanged: number;
};

export type AmazonItemListRow = {
  id: string;
  orderId: string;
  amazonOrderId: string;
  channel: AmazonChannel;
  orderDate: string;
  orderStatus: string;
  productName: string;
  asin: string;
  quantity: number;
  unitPriceCents: number | null;
  itemPaidCents: number | null;
  discountsCents: number | null;
  paymentLast4: string | null;
  paymentMethod: string;
  subscribeAndSave: boolean;
  shipmentStatus: string;
  shippingOption: string;
  website: string;
  currency: string;
  refundCount: number;
  billName: string | null;
  matchLabel: string | null;
  /** The Amazon charge this order is waiting on or already matched to. */
  chargeId: string | null;
};
