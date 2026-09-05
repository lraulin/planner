"use client";

import type { ColumnDef, NodeGridRow } from "@/components/grid/columns";
import { DateText } from "@/components/date/DateText";
import { formatUsd } from "@/lib/finances/money";
import {
  AMAZON_VISIBLE_COLUMN_IDS,
  amazonFields,
  type AmazonFieldId,
} from "@/lib/amazon/amazonFields";
import type { AmazonItemListRow } from "@/lib/amazon/types";

export type AmazonColumnCtx = {
  onReview: (row: AmazonItemListRow) => void;
};

export const AMAZON_COLUMN_IDS = AMAZON_VISIBLE_COLUMN_IDS;

function accessors(id: AmazonFieldId) {
  const field = amazonFields[id];
  return {
    filterKind: field.filterKind,
    filterValue: field.filterValue
      ? (row: NodeGridRow<AmazonItemListRow>) => field.filterValue!(row.node)
      : undefined,
    sortValue: field.sortValue
      ? (row: NodeGridRow<AmazonItemListRow>) => field.sortValue!(row.node)
      : undefined,
  };
}

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
    ...accessors("date"),
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
    width: "25rem",
    hideable: false,
    ...accessors("product"),
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
    ...accessors("qty"),
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
    ...accessors("paid"),
    compact: "meta",
    render: (row) => <Amount cents={row.node.itemPaidCents} />,
  },
  {
    id: "orderTotal",
    label: "Order total",
    fieldLabel: "Order total (Amazon's)",
    width: "7rem",
    align: "right",
    ...accessors("orderTotal"),
    compact: "meta",
    render: (row) =>
      row.node.orderGrandTotalCents === null ? null : (
        <span className="tabular text-[0.8125rem] text-ink">
          {formatUsd(row.node.orderGrandTotalCents)}
          {row.node.orderSummaryStatus !== null &&
          row.node.orderSummaryStatus !== "reconciled" ? (
            <span
              className="ml-1 text-[var(--chart-spend)]"
              title={
                row.node.orderSummaryStatus === "unbalanced"
                  ? "Amazon's summary lines do not add up to this total."
                  : "Amazon printed a total but no breakdown to check it against."
              }
            >
              !
            </span>
          ) : null}
        </span>
      ),
  },
  {
    id: "register",
    label: "Register",
    width: "6.5rem",
    ...accessors("register"),
    compact: "meta",
    render: (row) => <Text value={row.node.registerLabel ?? ""} />,
  },
  {
    id: "unitPrice",
    label: "Unit price",
    width: "6.5rem",
    align: "right",
    ...accessors("unitPrice"),
    compact: "meta",
    render: (row) => <Amount cents={row.node.unitPriceCents} />,
  },
  {
    id: "discounts",
    label: "Discounts",
    width: "6.5rem",
    align: "right",
    ...accessors("discounts"),
    compact: "meta",
    render: (row) => <Amount cents={row.node.discountsCents} />,
  },
  {
    id: "payment",
    label: "Payment",
    width: "5.5rem",
    ...accessors("payment"),
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
    ...accessors("sns"),
    compact: "meta",
    render: (row) => <Text value={row.node.subscribeAndSave ? "Yes" : ""} />,
  },
  {
    id: "bill",
    label: "Bill",
    width: "10rem",
    ...accessors("bill"),
    compact: "meta",
    render: (row) => <Text value={row.node.billName ?? ""} />,
  },
  {
    id: "match",
    label: "Match",
    width: "6rem",
    ...accessors("match"),
    compact: "meta",
    render: (row, ctx) =>
      row.node.matchLabel === "Review" ? (
        <button
          type="button"
          className="min-h-tap text-left text-[0.8125rem] text-[var(--select-edge)] underline-offset-2 hover:underline md:min-h-0"
          onClick={(event) => {
            event.stopPropagation();
            ctx.onReview(row.node);
          }}
        >
          Review
        </button>
      ) : (
        <Text value={row.node.matchLabel ?? ""} />
      ),
  },
  {
    id: "status",
    label: "Status",
    width: "7rem",
    ...accessors("status"),
    compact: "meta",
    render: (row) => <Text value={row.node.orderStatus} />,
  },
  {
    id: "channel",
    label: "Channel",
    width: "6rem",
    ...accessors("channel"),
    compact: "meta",
    render: (row) => (
      <Text value={row.node.channel === "digital" ? "Digital" : "Retail"} />
    ),
  },
  {
    id: "website",
    label: "Website",
    width: "7rem",
    ...accessors("website"),
    compact: "meta",
    render: (row) => <Text value={row.node.website} />,
  },
  {
    id: "orderId",
    label: "Order",
    width: "10rem",
    ...accessors("orderId"),
    compact: "meta",
    render: (row) => <Text value={row.node.amazonOrderId} />,
  },
  {
    id: "asin",
    label: "ASIN",
    width: "7rem",
    ...accessors("asin"),
    compact: "meta",
    render: (row) => <Text value={row.node.asin} />,
  },
  {
    id: "refunded",
    label: "Refunded",
    width: "5.5rem",
    ...accessors("refunded"),
    compact: "meta",
    render: (row) => <Text value={row.node.refundCount > 0 ? "Yes" : ""} />,
  },
];
