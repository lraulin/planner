import type { AmazonItemListRow } from "@/lib/amazon/types";

/** A closed retail order line for a pure test; `id` and `orderDate` are the test's to choose. */
export function amazonItem(
  over: Partial<AmazonItemListRow> & Pick<AmazonItemListRow, "id" | "orderDate">,
): AmazonItemListRow {
  return {
    orderId: over.id,
    amazonOrderId: over.amazonOrderId ?? `order-${over.id}`,
    channel: "retail",
    orderStatus: "Closed",
    productName: over.productName ?? over.id,
    asin: "B00TEST000",
    quantity: 1,
    unitPriceCents: 100,
    itemPaidCents: 100,
    discountsCents: 0,
    paymentLast4: "3448",
    paymentMethod: "Visa - 3448",
    subscribeAndSave: false,
    shipmentStatus: "Shipped",
    shippingOption: "",
    website: "Amazon.com",
    currency: "USD",
    refundCount: 0,
    billName: null,
    matchLabel: null,
    chargeId: null,
    orderGrandTotalCents: null,
    orderSummaryStatus: null,
    registerLabel: null,
    registerTransactionId: null,
    ...over,
  };
}
