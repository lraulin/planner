"use client";

import type { ColumnDef } from "@/components/grid/columns";
import { DateText } from "@/components/date/DateText";
import { formatUsd } from "@/lib/finances/money";
import type { AmazonItemListRow } from "@/lib/amazon/types";

export type AmazonColumnCtx = Record<string, never>;

export const AMAZON_COLUMN_IDS = [
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

function Text({ value, muted = true }: { value: string; muted?: boolean }) {
  return (
    <span
      className={`truncate text-[0.8125rem] ${muted ? "text-ink-muted" : "text-ink"}`}
      title={value || undefined}
    >
      {value}
    </span>
  );
}

function Amount({ cents }: { cents: number | null }) {
  if (cents === null) return null;
  return (
    <span className="tabular text-[0.8125rem] text-ink-muted">{formatUsd(cents)}</span>
  );
}

export const amazonColumns: ColumnDef<AmazonColumnCtx, AmazonItemListRow>[] = [
  {
    id: "date",
    label: "Date",
    width: "7rem",
    hideable: false,
    filterKind: "date",
    filterValue: (row) => row.node.orderDate || null,
    sortValue: (row) => row.node.orderDate,
    compact: "meta",
    render: (row) =>
      row.node.orderDate ? (
        <DateText
          dateKey={row.node.orderDate}
          className="tabular text-[0.8125rem] text-ink-muted"
        />
      ) : null,
  },
  {
    id: "product",
    label: "Product",
    width: "minmax(14rem,1.8fr)",
    hideable: false,
    filterKind: "text",
    filterValue: (row) => row.node.productName || null,
    sortValue: (row) => row.node.productName.toLowerCase(),
    compact: "primary",
    render: (row) => (
      <span
        className="truncate text-[0.8125rem] font-medium text-ink"
        title={row.node.productName}
      >
        {row.node.productName}
      </span>
    ),
  },
  {
    id: "qty",
    label: "Qty",
    width: "3.5rem",
    align: "right",
    filterKind: "text",
    filterValue: (row) => String(row.node.quantity),
    sortValue: (row) => row.node.quantity,
    compact: "meta",
    render: (row) => (
      <span className="tabular text-[0.8125rem] text-ink-muted">
        {row.node.quantity}
      </span>
    ),
  },
  {
    id: "paid",
    label: "Paid",
    width: "6.5rem",
    align: "right",
    filterKind: "number",
    filterValue: (row) =>
      row.node.itemPaidCents === null ? null : formatUsd(row.node.itemPaidCents),
    sortValue: (row) => row.node.itemPaidCents,
    compact: "meta",
    render: (row) => <Amount cents={row.node.itemPaidCents} />,
  },
  {
    id: "unitPrice",
    label: "Unit price",
    width: "6.5rem",
    align: "right",
    filterKind: "number",
    filterValue: (row) =>
      row.node.unitPriceCents === null ? null : formatUsd(row.node.unitPriceCents),
    sortValue: (row) => row.node.unitPriceCents,
    compact: "meta",
    render: (row) => <Amount cents={row.node.unitPriceCents} />,
  },
  {
    id: "discounts",
    label: "Discounts",
    width: "6.5rem",
    align: "right",
    filterKind: "number",
    filterValue: (row) =>
      row.node.discountsCents === null ? null : formatUsd(row.node.discountsCents),
    sortValue: (row) => row.node.discountsCents,
    compact: "meta",
    render: (row) => <Amount cents={row.node.discountsCents} />,
  },
  {
    id: "payment",
    label: "Payment",
    width: "5.5rem",
    filterKind: "enum",
    filterValue: (row) => row.node.paymentLast4,
    sortValue: (row) => row.node.paymentLast4 ?? "",
    compact: "meta",
    render: (row) => (
      <Text
        value={
          row.node.paymentLast4 ? `••${row.node.paymentLast4}` : row.node.paymentMethod
        }
      />
    ),
  },
  {
    id: "sns",
    label: "S&S",
    fieldLabel: "Subscribe & Save",
    width: "3.5rem",
    filterKind: "enum",
    filterValue: (row) => (row.node.subscribeAndSave ? "Yes" : "No"),
    sortValue: (row) => (row.node.subscribeAndSave ? 1 : 0),
    compact: "meta",
    render: (row) => <Text value={row.node.subscribeAndSave ? "Yes" : ""} />,
  },
  {
    id: "bill",
    label: "Bill",
    width: "10rem",
    filterKind: "text",
    filterValue: (row) => row.node.billName,
    sortValue: (row) => row.node.billName ?? "",
    compact: "meta",
    render: (row) => <Text value={row.node.billName ?? ""} />,
  },
  {
    id: "match",
    label: "Match",
    width: "6rem",
    filterKind: "enum",
    filterValue: (row) => row.node.matchLabel,
    sortValue: (row) => row.node.matchLabel ?? "",
    compact: "meta",
    render: (row) => (
      <Text
        value={row.node.matchLabel ?? ""}
        muted={row.node.matchLabel !== "Review"}
      />
    ),
  },
  {
    id: "status",
    label: "Status",
    width: "7rem",
    filterKind: "enum",
    filterValue: (row) => row.node.orderStatus || null,
    sortValue: (row) => row.node.orderStatus,
    compact: "meta",
    render: (row) => <Text value={row.node.orderStatus} />,
  },
  {
    id: "channel",
    label: "Channel",
    width: "6rem",
    filterKind: "enum",
    filterValue: (row) => (row.node.channel === "digital" ? "Digital" : "Retail"),
    sortValue: (row) => row.node.channel,
    compact: "meta",
    render: (row) => (
      <Text value={row.node.channel === "digital" ? "Digital" : "Retail"} />
    ),
  },
  {
    id: "website",
    label: "Website",
    width: "7rem",
    filterKind: "enum",
    filterValue: (row) => row.node.website || null,
    sortValue: (row) => row.node.website,
    compact: "meta",
    render: (row) => <Text value={row.node.website} />,
  },
  {
    id: "orderId",
    label: "Order",
    width: "10rem",
    filterKind: "text",
    filterValue: (row) => row.node.amazonOrderId || null,
    sortValue: (row) => row.node.amazonOrderId,
    compact: "meta",
    render: (row) => <Text value={row.node.amazonOrderId} />,
  },
  {
    id: "asin",
    label: "ASIN",
    width: "7rem",
    filterKind: "text",
    filterValue: (row) => row.node.asin || null,
    sortValue: (row) => row.node.asin,
    compact: "meta",
    render: (row) => <Text value={row.node.asin} />,
  },
  {
    id: "refunded",
    label: "Refunded",
    width: "5.5rem",
    filterKind: "enum",
    filterValue: (row) => (row.node.refundCount > 0 ? "Yes" : "No"),
    sortValue: (row) => row.node.refundCount,
    compact: "meta",
    render: (row) => <Text value={row.node.refundCount > 0 ? "Yes" : ""} />,
  },
];
