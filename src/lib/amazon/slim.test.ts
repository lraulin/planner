import { describe, expect, it } from "vitest";
import { zipListingName } from "./files";
import {
  parseDigitalItems,
  parseDigitalReturns,
  parseRefunds,
  parseReplacements,
  parseRetailItems,
  parseReturns,
} from "./parse";
import { amazonDateKey, paymentLast4 } from "./csv";
import { buildSlimFromTexts, parseSlimJson } from "./slim";

const RETAIL_HEADER = [
  "ASIN",
  "Billing Address",
  "Carrier Name & Tracking Number",
  "Currency",
  "Gift Message",
  "Order Date",
  "Order ID",
  "Order Status",
  "Original Quantity",
  "Payment Method Type",
  "Product Condition",
  "Product Name",
  "Ship Date",
  "Shipment Item Subtotal",
  "Shipment Item Subtotal Tax",
  "Shipment Status",
  "Shipping Address",
  "Shipping Charge",
  "Shipping Option",
  "Total Amount",
  "Total Discounts",
  "Unit Price",
  "Unit Price Tax",
  "Website",
].join(",");

function retailRow(overrides: Record<string, string>): string {
  const cells: Record<string, string> = {
    ASIN: "B00TEST",
    "Billing Address": "Lee Somewhere",
    "Carrier Name & Tracking Number": "USPS(123)",
    Currency: "USD",
    "Gift Message": "Not Available",
    "Order Date": "2026-03-30T21:04:32Z",
    "Order ID": "114-1111111-1111111",
    "Order Status": "Closed",
    "Original Quantity": "1",
    "Payment Method Type": "Visa - 9910",
    "Product Condition": "New",
    "Product Name": "Toilet paper",
    "Ship Date": "2026-03-31T08:00:00Z",
    "Shipment Item Subtotal": "20.00",
    "Shipment Item Subtotal Tax": "0",
    "Shipment Status": "Shipped",
    "Shipping Address": "Lee Somewhere",
    "Shipping Charge": "0",
    "Shipping Option": "next-1dc",
    "Total Amount": "20.00",
    "Total Discounts": "0",
    "Unit Price": "20.00",
    "Unit Price Tax": "0",
    Website: "Amazon.com",
    ...overrides,
  };
  return RETAIL_HEADER.split(",")
    .map((name) => {
      const value = cells[name] ?? "";
      return /[",]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    })
    .join(",");
}

describe("amazonDateKey / paymentLast4", () => {
  it("takes the UTC calendar day from an Amazon instant", () => {
    expect(amazonDateKey("2018-12-27T11:10:19Z")).toBe("2018-12-27");
    expect(amazonDateKey("Not Available")).toBe("");
  });

  it("reads the last four from a mixed gift-card payment string", () => {
    expect(paymentLast4("Visa - 9910")).toBe("9910");
    expect(paymentLast4("Gift Certificate/Card and Visa - 4903")).toBe("4903");
    expect(paymentLast4("Not Available")).toBeNull();
  });
});

describe("parseRetailItems", () => {
  it("keeps two items that share a shipment-level subtotal and quoted commas", () => {
    const csv = [
      RETAIL_HEADER,
      retailRow({
        ASIN: "B001",
        "Product Name": "Papablic, Soft Changing Pad",
        "Shipment Item Subtotal": "176.47",
        "Total Amount": "54.06",
        "Total Discounts": "-8.99",
        "Unit Price": "59.99",
      }),
      retailRow({
        ASIN: "B002",
        "Product Name": "Ubbi Steel Diaper Pail",
        "Shipment Item Subtotal": "176.47",
        "Total Amount": "59.91",
        "Total Discounts": "-9.97",
        "Unit Price": "66.49",
      }),
    ].join("\n");

    const { items, error } = parseRetailItems(csv);
    expect(error).toBeNull();
    expect(items).toHaveLength(2);
    expect(items[0].productName).toBe("Papablic, Soft Changing Pad");
    expect(items[0].itemPaidCents).toBe(5406);
    expect(items[0].discountsCents).toBe(-899);
    expect(items[0].lineId).toBe("114-1111111-1111111:B001:0");
    expect(items[1].lineId).toBe("114-1111111-1111111:B002:0");
    expect(items[0].paymentLast4).toBe("9910");
  });

  it("flags Subscribe & Save from std-sns-us and keeps cancelled rows", () => {
    const csv = [
      RETAIL_HEADER,
      retailRow({
        "Shipping Option": "std-sns-us",
        "Product Name": "Amazon Basics Toilet Paper",
        "Total Amount": "6.30",
      }),
      retailRow({
        "Order ID": "111-cancelled",
        "Order Status": "Cancelled",
        "Shipment Status": "Not Available",
        "Product Name": "Something cancelled",
      }),
    ].join("\n");

    const { items } = parseRetailItems(csv);
    expect(items[0].subscribeAndSave).toBe(true);
    expect(items[1].orderStatus).toBe("Cancelled");
    expect(items[1].subscribeAndSave).toBe(false);
  });

  it("gives the same ASIN in one order distinct ordinals", () => {
    const csv = [
      RETAIL_HEADER,
      retailRow({ ASIN: "B00SAME" }),
      retailRow({ ASIN: "B00SAME" }),
    ].join("\n");
    const { items } = parseRetailItems(csv);
    expect(items.map((item) => item.lineId)).toEqual([
      "114-1111111-1111111:B00SAME:0",
      "114-1111111-1111111:B00SAME:1",
    ]);
  });
});

describe("parseDigitalItems", () => {
  const header = [
    "ASIN",
    "Component Type",
    "Digital Order Item ID",
    "Marketplace",
    "Order Date",
    "Order ID",
    "Order Status",
    "Payment Information",
    "Product Name",
    "Quantity Ordered",
    "Transaction Amount",
  ].join(",");

  it("collapses Price + Tax + a negative Price discount into one item", () => {
    const csv = [
      header,
      [
        "B00BOOK",
        "Tax",
        "ITEM1",
        "www.amazon.com",
        "2024-12-06T21:10:00Z",
        "D01-1",
        "SUCCESS",
        "Not Applicable",
        "Hackers",
        "1",
        "0",
      ].join(","),
      [
        "B00BOOK",
        "Price Amount",
        "ITEM1",
        "www.amazon.com",
        "2024-12-06T21:10:00Z",
        "D01-1",
        "SUCCESS",
        "Not Applicable",
        "Hackers",
        "1",
        "29.95",
      ].join(","),
      [
        "B00BOOK",
        "Price Amount",
        "ITEM1",
        "www.amazon.com",
        "2024-12-06T21:10:00Z",
        "D01-1",
        "SUCCESS",
        "Not Applicable",
        "Hackers",
        "1",
        "-8.99",
      ].join(","),
      [
        "B00BOOK",
        "Tax",
        "ITEM1",
        "www.amazon.com",
        "2024-12-06T21:10:00Z",
        "D01-1",
        "SUCCESS",
        "Not Applicable",
        "Hackers",
        "1",
        "1.20",
      ].join(","),
    ].join("\n");

    const { items, error } = parseDigitalItems(csv);
    expect(error).toBeNull();
    expect(items).toHaveLength(1);
    expect(items[0].lineId).toBe("ITEM1");
    expect(items[0].channel).toBe("digital");
    expect(items[0].itemPaidCents).toBe(2096);
    expect(items[0].itemTaxCents).toBe(120);
    expect(items[0].productName).toBe("Hackers");
  });
});

describe("refunds / returns / replacements", () => {
  it("parses a retail refund", () => {
    const csv = [
      "Creation Date,Currency,Disbursement Type,Order ID,Payment Status,Quantity,Refund Amount,Refund Date,Reversal Amount State,Reversal Reason,Reversal Status,Website",
      "2023-01-02T00:00:00Z,USD,Refund,113-abc,Completed,1,14.31,2023-01-03T00:00:00Z,Final,Too large,Completed,Amazon.com",
    ].join("\n");
    const { refunds, error } = parseRefunds(csv);
    expect(error).toBeNull();
    expect(refunds[0]).toMatchObject({
      amazonOrderId: "113-abc",
      channel: "retail",
      amountCents: 1431,
      reason: "Too large",
      refundDate: "2023-01-03",
    });
  });

  it("parses a digital return as a digital refund and collapses Price/Tax rows", () => {
    const csv = [
      "ASIN,Amount Refunded,Digital Order Item ID,Order ID,Product Name,Reason Code,Return Date,Return Status",
      "B00X,5.29,DIG1,D01-2,Prime Video Ultra,Unwanted,2026-07-30T21:45:00Z,Customer Return Complete",
      "B00X,5.29,DIG1,D01-2,Prime Video Ultra,Unwanted,2026-07-30T21:45:00Z,Customer Return Complete",
    ].join("\n");
    const { refunds } = parseDigitalReturns(csv);
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({
      channel: "digital",
      lineId: "drefund:DIG1",
      amountCents: 529,
      productName: "Prime Video Ultra",
    });
  });

  it("parses a return and a missing replacement", () => {
    const returnsCsv = [
      "Carrier Package ID,Contract ID,Date of Return,Order ID,Replacement Order,Return Amount,Return Amount Currency,Return Creation Date,Return Reason,Return Resolution",
      "x,CONTRACT-1,2021-03-04T13:01:12Z,113-ret,Not Applicable,14.31,USD,2021-03-04T13:04:47Z,Too large,Refund",
    ].join("\n");
    const { returns } = parseReturns(returnsCsv);
    expect(returns[0].lineId).toBe("CONTRACT-1:0");
    expect(returns[0].resolution).toBe("Refund");

    const replacementsCsv = [
      "Order ID,Replacement Order ID",
      '112-old,"No Replacement Order ID"',
      "112-orig,113-new",
    ].join("\n");
    const { replacements } = parseReplacements(replacementsCsv);
    expect(replacements[0].replacementOrderId).toBeNull();
    expect(replacements[1].replacementOrderId).toBe("113-new");
  });
});

describe("buildSlimFromTexts / parseSlimJson", () => {
  it("assembles a version-1 document and rejects a random JSON file", () => {
    const retail = [RETAIL_HEADER, retailRow({ "Shipping Option": "std-sns-us" })].join(
      "\n",
    );
    const { document, warnings } = buildSlimFromTexts(
      { retail },
      "2026-08-14T18:00:00.000Z",
    );
    expect(warnings.some((w) => w.includes("Missing"))).toBe(false);
    expect(document.version).toBe(1);
    expect(document.source).toBe("amazon-data-request");
    expect(document.orders).toHaveLength(1);
    expect(document.items[0].subscribeAndSave).toBe(true);

    const parsed = parseSlimJson(JSON.stringify(document));
    expect(parsed.ok).toBe(true);

    expect(parseSlimJson('{"version":1,"source":"nope"}').ok).toBe(false);
    expect(parseSlimJson("not json").ok).toBe(false);
  });
});

describe("zipListingName", () => {
  it("reads the path from an unzip -l line and ignores directories", () => {
    expect(
      zipListingName(
        "  1828026  08-14-2026 17:53   Your Amazon Orders/Order History.csv",
      ),
    ).toBe("Your Amazon Orders/Order History.csv");
    expect(zipListingName("        0  08-14-2026 17:53   Additional Data/")).toBeNull();
  });
});
