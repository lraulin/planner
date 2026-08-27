import { describe, expect, it } from "vitest";
import { customFilter, optionsFilter } from "@/lib/grid/customFilter";
import { amazonReviewChargeTitle } from "./grouping";
import type { AmazonItemListRow } from "./types";
import {
  parseAmazonOrdersQuery,
  prepareAmazonOrders,
  sliceAmazonBlock,
  AMAZON_BLOCK_SIZE,
  type AmazonOrdersQuery,
} from "./ordersQuery";

function item(
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

function query(over: Partial<AmazonOrdersQuery> = {}): AmazonOrdersQuery {
  return parseAmazonOrdersQuery({
    search: "",
    filters: {},
    sorts: [{ columnId: "date", direction: "desc" }],
    groupBy: ["year", "month"],
    collapsedGroups: [],
    today: "2026-08-27",
    ...over,
  });
}

describe("amazonReviewChargeTitle", () => {
  it("names a charge by its orders, not by a payment id", () => {
    expect(amazonReviewChargeTitle(["114-aaa"])).toBe("Order 114-aaa");
    expect(amazonReviewChargeTitle(["114-aaa", "114-bbb"])).toBe("2 orders");
  });
});

describe("parseAmazonOrdersQuery", () => {
  it("drops unknown columns, caps search, and ignores a hidden-column sort", () => {
    const parsed = parseAmazonOrdersQuery({
      search: "x".repeat(500),
      filters: {
        product: optionsFilter(["value:Toilet"]),
        invented: optionsFilter(["x"]),
      },
      sorts: [
        { columnId: "asin", direction: "asc" },
        { columnId: "date", direction: "desc" },
      ],
      visibleColumnIds: ["date", "product"],
      groupBy: ["year", "channel", "year", "priority"],
      today: "not-a-date",
    });
    expect(parsed.search).toHaveLength(200);
    expect(parsed.filters).toEqual({ product: optionsFilter(["value:Toilet"]) });
    expect(parsed.sorts).toEqual([{ columnId: "date", direction: "desc" }]);
    expect(parsed.groupBy).toEqual(["year", "channel"]);
    expect(parsed.today).toBeNull();
  });
});

describe("prepareAmazonOrders", () => {
  it("returns only the first block of details, never every line item", () => {
    const items = Array.from({ length: AMAZON_BLOCK_SIZE + 5 }, (_, i) =>
      item({
        id: `row-${i}`,
        orderDate: "2026-08-01",
        productName: `Item ${i}`,
      }),
    );
    const prepared = prepareAmazonOrders(items, query({ groupBy: [] }));
    expect(prepared.index.nodeIds).toHaveLength(AMAZON_BLOCK_SIZE + 5);
    expect(prepared.block.rows).toHaveLength(AMAZON_BLOCK_SIZE);
    expect(prepared.index.shown).toBe(AMAZON_BLOCK_SIZE + 5);
    expect(prepared.index.total).toBe(AMAZON_BLOCK_SIZE + 5);
  });

  it("searches product names across all history", () => {
    const prepared = prepareAmazonOrders(
      [
        item({ id: "tp", orderDate: "2024-03-01", productName: "Toilet paper" }),
        item({ id: "litter", orderDate: "2026-08-01", productName: "Cat litter" }),
      ],
      query({ search: "toilet", groupBy: [] }),
    );
    expect(prepared.index.nodeIds).toEqual(["tp"]);
    expect(prepared.index.shown).toBe(1);
    expect(prepared.index.total).toBe(2);
  });

  it("omits collapsed descendants from the index but not from shown", () => {
    const items = [
      item({ id: "old", orderDate: "2025-06-15", productName: "OLD" }),
      item({ id: "now", orderDate: "2026-08-02", productName: "NOW" }),
    ];
    const expanded = prepareAmazonOrders(items, query({ collapsedGroups: [] }));
    const collapsed = prepareAmazonOrders(
      items,
      query({ collapsedGroups: ["group:year:2025"] }),
    );
    expect(expanded.index.nodeIds.sort()).toEqual(["now", "old"]);
    expect(collapsed.index.nodeIds).toEqual(["now"]);
    expect(collapsed.index.shown).toBe(2);
    expect(
      collapsed.index.entries.some((entry) => entry.id === "group:year:2025"),
    ).toBe(true);
    expect(collapsed.index.entries.some((entry) => entry.id === "old")).toBe(false);
  });

  it("filters Subscribe & Save without emptying the grid on a stale column", () => {
    const items = [
      item({ id: "sns", orderDate: "2026-08-01", subscribeAndSave: true }),
      item({ id: "once", orderDate: "2026-08-02", subscribeAndSave: false }),
    ];
    expect(
      prepareAmazonOrders(
        items,
        query({ groupBy: [], filters: { sns: optionsFilter(["value:Yes"]) } }),
      ).index.nodeIds,
    ).toEqual(["sns"]);
    expect(
      prepareAmazonOrders(items, {
        ...query({ groupBy: [] }),
        filters: { gone: optionsFilter(["nope"]) },
      }).index.nodeIds.sort(),
    ).toEqual(["once", "sns"]);
  });

  it("filters Paid > 0 using the same number parser as the column", () => {
    const items = [
      item({ id: "free", orderDate: "2026-08-01", itemPaidCents: 0 }),
      item({ id: "paid", orderDate: "2026-08-02", itemPaidCents: 1200 }),
    ];
    const greaterThanZero = customFilter("and", [{ op: "gt", value: "0" }]);
    expect(
      prepareAmazonOrders(
        items,
        query({ groupBy: [], filters: { paid: greaterThanZero } }),
      ).index.nodeIds,
    ).toEqual(["paid"]);
  });

  it("puts the order total on the order group, not on each item", () => {
    const prepared = prepareAmazonOrders(
      [
        item({
          id: "a",
          orderDate: "2026-08-01",
          amazonOrderId: "114-aaa",
          itemPaidCents: 1800,
        }),
        item({
          id: "b",
          orderDate: "2026-08-01",
          amazonOrderId: "114-aaa",
          itemPaidCents: 314,
          matchLabel: "Review",
          chargeId: "charge-1",
        }),
        item({
          id: "c",
          orderDate: "2026-08-02",
          amazonOrderId: "114-bbb",
          itemPaidCents: 500,
        }),
      ],
      query({ groupBy: ["order"] }),
    );
    const groups = prepared.index.entries.filter((entry) => entry.kind === "group");
    expect(groups).toHaveLength(2);
    const first = groups.find(
      (entry) => entry.kind === "group" && entry.label === "114-aaa",
    );
    const second = groups.find(
      (entry) => entry.kind === "group" && entry.label === "114-bbb",
    );
    expect(first?.kind === "group" && first.paidCents).toBe(2114);
    expect(first?.kind === "group" && first.matchLabel).toBe("Review");
    expect(first?.kind === "group" && first.chargeId).toBe("charge-1");
    expect(second?.kind === "group" && second.paidCents).toBe(500);
    expect(groups.map((entry) => (entry.kind === "group" ? entry.label : ""))).toEqual([
      "114-bbb",
      "114-aaa",
    ]);
  });
});

describe("sliceAmazonBlock", () => {
  it("preserves requested id order and skips unknown ids", () => {
    const items = [
      item({ id: "a", orderDate: "2026-08-01" }),
      item({ id: "b", orderDate: "2026-08-02" }),
    ];
    expect(
      sliceAmazonBlock(items, ["b", "missing", "a"], 0).map((row) => row.id),
    ).toEqual(["b", "a"]);
  });
});
