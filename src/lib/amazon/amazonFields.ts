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
  "payment",
  "sns",
  "bill",
  "match",
  "status",
  "channel",
  "orderId",
  "refunded",
] as const;

export const AMAZON_FIELD_IDS = [
  "date",
  "product",
  "qty",
  "paid",
  "unitPrice",
  "discounts",
  "payment",
  "sns",
  "bill",
  "match",
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
  paid: {
    id: "paid",
    filterKind: "number",
    filterValue: (row) =>
      row.itemPaidCents === null ? null : formatUsd(row.itemPaidCents),
    sortValue: (row) => row.itemPaidCents,
  },
  unitPrice: {
    id: "unitPrice",
    filterKind: "number",
    filterValue: (row) =>
      row.unitPriceCents === null ? null : formatUsd(row.unitPriceCents),
    sortValue: (row) => row.unitPriceCents,
  },
  discounts: {
    id: "discounts",
    filterKind: "number",
    filterValue: (row) =>
      row.discountsCents === null ? null : formatUsd(row.discountsCents),
    sortValue: (row) => row.discountsCents,
  },
  payment: {
    id: "payment",
    filterKind: "enum",
    filterValue: (row) => row.paymentLast4,
    sortValue: (row) => row.paymentLast4 ?? "",
  },
  sns: {
    id: "sns",
    filterKind: "enum",
    filterValue: (row) => (row.subscribeAndSave ? "Yes" : "No"),
    sortValue: (row) => (row.subscribeAndSave ? 1 : 0),
  },
  bill: {
    id: "bill",
    filterKind: "text",
    filterValue: (row) => row.billName,
    sortValue: (row) => row.billName ?? "",
  },
  match: {
    id: "match",
    filterKind: "enum",
    filterValue: (row) => row.matchLabel,
    sortValue: (row) => row.matchLabel ?? "",
  },
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
