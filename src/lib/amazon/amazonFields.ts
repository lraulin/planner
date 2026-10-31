/**
 * Filter, search, and sort accessors for every Orders column. Shared by `amazonColumns`
 * and the server-prepared row pipeline so a hidden-column filter cannot mean one thing in
 * the header and another on the server.
 */

import { formatUsd } from "@/lib/finances/money";
import type { FilterKind } from "@/lib/grid/customFilter";
import type { GridFilterValue } from "@/lib/grid/filterValue";
import type { AmazonItemListRow } from "./types";

export const AMAZON_VISIBLE_COLUMN_IDS = [
  "date",
  "product",
  "qty",
  "paid",
  "orderTotal",
  "payment",
  "sns",
  "bill",
  "match",
  "register",
  "status",
  "channel",
  "orderId",
  "refunded",
] as const satisfies readonly AmazonFieldId[];

export const AMAZON_FIELD_IDS = [
  "date",
  "product",
  "qty",
  "paid",
  "orderTotal",
  "unitPrice",
  "discounts",
  "payment",
  "sns",
  "bill",
  "match",
  "register",
  "status",
  "channel",
  "website",
  "orderId",
  "asin",
  "refunded",
] as const;

export type AmazonFieldId = (typeof AMAZON_FIELD_IDS)[number];

export const AMAZON_FIELD_ID_SET: ReadonlySet<string> = new Set(AMAZON_FIELD_IDS);

export type AmazonField = {
  id: AmazonFieldId;
  filterKind: FilterKind;
  filterValue?: (row: AmazonItemListRow) => string | null;
  sortValue?: (row: AmazonItemListRow) => string | number | null | undefined;
};

/** A money column: filtered on its dollar text, sorted by cents, blank when unknown. */
function centsField(
  id: AmazonFieldId,
  cents: (row: AmazonItemListRow) => number | null,
): AmazonField {
  return {
    id,
    filterKind: "number",
    filterValue: (row) => {
      const value = cents(row);
      return value === null ? null : formatUsd(value);
    },
    sortValue: cents,
  };
}

/** A column of optional labels: blank rows filter as empty and sort first. */
function labelField(
  id: AmazonFieldId,
  filterKind: FilterKind,
  label: (row: AmazonItemListRow) => string | null,
): AmazonField {
  return { id, filterKind, filterValue: label, sortValue: (row) => label(row) ?? "" };
}

export const amazonFields: Record<AmazonFieldId, AmazonField> = {
  date: {
    id: "date",
    filterKind: "date",
    filterValue: (row) => row.orderDate || null,
    sortValue: (row) => row.orderDate,
  },
  product: {
    id: "product",
    filterKind: "text",
    filterValue: (row) => row.productName || null,
    sortValue: (row) => row.productName.toLowerCase(),
  },
  qty: {
    id: "qty",
    filterKind: "text",
    filterValue: (row) => String(row.quantity),
    sortValue: (row) => row.quantity,
  },
  paid: centsField("paid", (row) => row.itemPaidCents),
  orderTotal: centsField("orderTotal", (row) => row.orderGrandTotalCents),
  register: labelField("register", "text", (row) => row.registerLabel),
  unitPrice: centsField("unitPrice", (row) => row.unitPriceCents),
  discounts: centsField("discounts", (row) => row.discountsCents),
  payment: labelField("payment", "enum", (row) => row.paymentLast4),
  sns: {
    id: "sns",
    filterKind: "enum",
    filterValue: (row) => (row.subscribeAndSave ? "Yes" : "No"),
    sortValue: (row) => (row.subscribeAndSave ? 1 : 0),
  },
  bill: labelField("bill", "text", (row) => row.billName),
  match: labelField("match", "enum", (row) => row.matchLabel),
  status: {
    id: "status",
    filterKind: "enum",
    filterValue: (row) => row.orderStatus || null,
    sortValue: (row) => row.orderStatus,
  },
  channel: {
    id: "channel",
    filterKind: "enum",
    filterValue: (row) => (row.channel === "digital" ? "Digital" : "Retail"),
    sortValue: (row) => row.channel,
  },
  website: {
    id: "website",
    filterKind: "enum",
    filterValue: (row) => row.website || null,
    sortValue: (row) => row.website,
  },
  orderId: {
    id: "orderId",
    filterKind: "text",
    filterValue: (row) => row.amazonOrderId || null,
    sortValue: (row) => row.amazonOrderId,
  },
  asin: {
    id: "asin",
    filterKind: "text",
    filterValue: (row) => row.asin || null,
    sortValue: (row) => row.asin,
  },
  refunded: {
    id: "refunded",
    filterKind: "enum",
    filterValue: (row) => (row.refundCount > 0 ? "Yes" : "No"),
    sortValue: (row) => row.refundCount,
  },
};

export const AMAZON_FIELDS = AMAZON_FIELD_IDS.map((id) => amazonFields[id]);

export function amazonFilterValues(
  row: AmazonItemListRow,
): Record<string, GridFilterValue> {
  const values: Record<string, GridFilterValue> = {};
  for (const field of AMAZON_FIELDS) {
    if (field.filterValue) values[field.id] = field.filterValue(row);
  }
  return values;
}

export function amazonFieldKinds(): Record<string, FilterKind | undefined> {
  const kinds: Record<string, FilterKind | undefined> = {};
  for (const field of AMAZON_FIELDS) kinds[field.id] = field.filterKind;
  return kinds;
}
