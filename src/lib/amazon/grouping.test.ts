import { describe, expect, it } from "vitest";
import {
  amazonGroupOrderTotals,
  amazonGroupPaidCents,
  amazonOrderGroupMatch,
  groupAmazonItems,
} from "./grouping";
import { amazonItem } from "@/lib/testing/amazonItem";

function groupLabels(rows: ReturnType<typeof groupAmazonItems>): string[] {
  return rows.flatMap((row) => (row.kind === "group" ? [row.label] : []));
}

describe("groupAmazonItems", () => {
  it("puts newer orders above older ones, same as year and month", () => {
    const rows = groupAmazonItems(
      [
        amazonItem({
          id: "old",
          orderDate: "2000-09-11",
          amazonOrderId: "002-old",
        }),
        amazonItem({
          id: "new",
          orderDate: "2026-08-13",
          amazonOrderId: "111-new",
        }),
      ],
      ["order"],
    );
    expect(groupLabels(rows)).toEqual(["111-new", "002-old"]);
  });
});

describe("amazonGroupPaidCents", () => {
  it("rolls each item into every enclosing group", () => {
    const rows = groupAmazonItems(
      [
        amazonItem({
          id: "a",
          orderDate: "2026-08-01",
          amazonOrderId: "114-aaa",
          itemPaidCents: 1800,
        }),
        amazonItem({
          id: "b",
          orderDate: "2026-08-01",
          amazonOrderId: "114-aaa",
          itemPaidCents: 314,
        }),
      ],
      ["year", "order"],
    );
    const paid = amazonGroupPaidCents(rows);
    const year = rows.find((row) => row.kind === "group" && row.label === "2026");
    const order = rows.find((row) => row.kind === "group" && row.label === "114-aaa");
    expect(year && paid.get(year.id)).toBe(2114);
    expect(order && paid.get(order.id)).toBe(2114);
  });
});

describe("amazonOrderGroupMatch", () => {
  it("labels an order, not the year or month it sits in", () => {
    const rows = groupAmazonItems(
      [
        amazonItem({
          id: "a",
          orderDate: "2026-08-01",
          amazonOrderId: "114-aaa",
          matchLabel: "Review",
          chargeId: "charge-1",
        }),
        amazonItem({
          id: "b",
          orderDate: "2026-07-02",
          amazonOrderId: "114-bbb",
          matchLabel: "Matched",
          chargeId: "charge-2",
        }),
      ],
      ["year", "month", "order"],
    );
    const match = amazonOrderGroupMatch(rows);
    const year = rows.find((row) => row.kind === "group" && row.label === "2026");
    const august = rows.find((row) => row.kind === "group" && row.label === "August");
    const order = rows.find((row) => row.kind === "group" && row.label === "114-aaa");
    expect(year && match.get(year.id)).toBeUndefined();
    expect(august && match.get(august.id)).toBeUndefined();
    expect(order && match.get(order.id)).toEqual({
      matchLabel: "Review",
      chargeId: "charge-1",
    });
  });
});

describe("amazonGroupOrderTotals", () => {
  it("counts an order's grand total once however many lines it has", () => {
    const grouped = groupAmazonItems(
      [
        amazonItem({
          id: "a",
          orderDate: "2026-08-01",
          amazonOrderId: "o1",
          orderGrandTotalCents: 2366,
          orderSummaryStatus: "reconciled",
        }),
        amazonItem({
          id: "b",
          orderDate: "2026-08-01",
          amazonOrderId: "o1",
          orderGrandTotalCents: 2366,
          orderSummaryStatus: "reconciled",
        }),
      ],
      ["order"],
    );
    const totals = amazonGroupOrderTotals(grouped);
    const [group] = [...totals.values()];
    expect(group.grandTotalCents).toBe(2366);
    // The item sum is what got this wrong in the first place: two lines, one receipt.
    expect([...amazonGroupPaidCents(grouped).values()][0]).toBe(200);
  });

  it("adds up distinct orders in a month and counts the ones that do not reconcile", () => {
    const grouped = groupAmazonItems(
      [
        amazonItem({
          id: "a",
          orderDate: "2026-08-01",
          amazonOrderId: "o1",
          orderGrandTotalCents: 2366,
          orderSummaryStatus: "reconciled",
        }),
        amazonItem({
          id: "b",
          orderDate: "2026-08-02",
          amazonOrderId: "o2",
          orderGrandTotalCents: 1000,
          orderSummaryStatus: "unbalanced",
        }),
      ],
      ["month"],
    );
    const [group] = [...amazonGroupOrderTotals(grouped).values()];
    expect(group.grandTotalCents).toBe(3366);
    expect(group.unreconciledOrders).toBe(1);
  });

  it("leaves a group with no stored total null rather than showing $0.00", () => {
    const grouped = groupAmazonItems(
      [amazonItem({ id: "a", orderDate: "2026-08-01", amazonOrderId: "o1" })],
      ["order"],
    );
    const [group] = [...amazonGroupOrderTotals(grouped).values()];
    expect(group.grandTotalCents).toBeNull();
    expect(group.unreconciledOrders).toBe(0);
  });
});
