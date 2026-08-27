import { describe, expect, it } from "vitest";
import {
  checkAmazonOrderSummary,
  classifyAmazonSummaryLabel,
  deriveAmazonOrderSummary,
  parseAmazonOrderSummary,
  parseAmazonSummaryLines,
  subscriptionSavingCents,
  asAmazonSummaryLines,
} from "./orderSummary";

/** Order 111-7959899-2189857 exactly as Amazon prints it. */
const C4_ORDER = [
  { label: "Item(s) Subtotal:", amount: "$23.49" },
  { label: "Shipping & Handling:", amount: "$0.00" },
  { label: "Subscription saving:", amount: "-$1.17" },
  { label: "Total before tax:", amount: "$22.32" },
  { label: "Estimated tax to be collected:", amount: "$1.34" },
  { label: "Grand Total:", amount: "$23.66" },
];

describe("classifyAmazonSummaryLabel", () => {
  it("reads the labels Amazon actually prints", () => {
    expect(classifyAmazonSummaryLabel("Item(s) Subtotal:")).toBe("itemsSubtotal");
    expect(classifyAmazonSummaryLabel("Shipping & Handling:")).toBe("shippingHandling");
    expect(classifyAmazonSummaryLabel("Subscription saving:")).toBe(
      "subscriptionSaving",
    );
    expect(classifyAmazonSummaryLabel("Estimated tax to be collected:")).toBe("tax");
    expect(classifyAmazonSummaryLabel("Grand Total:")).toBe("grandTotal");
  });

  it("does not read 'Total before tax' as a total or as tax", () => {
    // It restates the lines above it. Counting it either way double-counts the order.
    expect(classifyAmazonSummaryLabel("Total before tax:")).toBe("runningSubtotal");
  });

  it("reads Free Shipping as the discount it is, not as a shipping charge", () => {
    expect(classifyAmazonSummaryLabel("Free Shipping:")).toBe("promotion");
  });

  it("leaves a line it does not know as unknown", () => {
    expect(classifyAmazonSummaryLabel("Gift Card Amount:")).toBe("unknown");
    expect(classifyAmazonSummaryLabel("Driver tip:")).toBe("unknown");
  });
});

describe("parseAmazonOrderSummary", () => {
  it("stores Amazon's own money for the C4 order", () => {
    const summary = parseAmazonOrderSummary(C4_ORDER);
    expect(summary.itemsSubtotalCents).toBe(2349);
    expect(summary.shippingHandlingCents).toBe(0);
    expect(summary.promotionCents).toBe(-117);
    expect(summary.taxCents).toBe(134);
    expect(summary.grandTotalCents).toBe(2366);
    expect(summary.source).toBe("printed");
  });

  it("reconciles the C4 order the item sum gets wrong", () => {
    const check = checkAmazonOrderSummary(parseAmazonOrderSummary(C4_ORDER));
    expect(check.status).toBe("reconciled");
    expect(check.differenceCents).toBe(0);
    // Summing the item lines alone is $23.49 — the defect this spec exists to fix.
    expect(check.recognisedCents).toBe(2366);
  });

  it("keeps the subscription saving separable from other promotions", () => {
    const summary = parseAmazonOrderSummary([
      ...C4_ORDER,
      { label: "Promotion Applied:", amount: "-$2.00" },
    ]);
    expect(summary.promotionCents).toBe(-317);
    expect(subscriptionSavingCents(summary.lines)).toBe(-117);
  });

  it("drops the duplicate summary block Amazon renders per shipment", () => {
    const lines = parseAmazonSummaryLines([...C4_ORDER, ...C4_ORDER]);
    expect(lines).toHaveLength(C4_ORDER.length);
  });

  it("drops a line whose amount will not parse rather than calling it zero", () => {
    const lines = parseAmazonSummaryLines([
      { label: "Item(s) Subtotal:", amount: "$23.49" },
      { label: "Estimated tax to be collected:", amount: "See below" },
    ]);
    expect(lines.map((line) => line.kind)).toEqual(["itemsSubtotal"]);
  });

  it("reads an en dash as a minus", () => {
    const summary = parseAmazonOrderSummary([
      { label: "Subscription saving:", amount: "–$1.17" },
    ]);
    expect(summary.promotionCents).toBe(-117);
  });
});

describe("checkAmazonOrderSummary", () => {
  it("flags an order whose lines do not add up to its grand total", () => {
    const check = checkAmazonOrderSummary(
      parseAmazonOrderSummary([
        { label: "Item(s) Subtotal:", amount: "$23.49" },
        { label: "Estimated tax to be collected:", amount: "$1.34" },
        { label: "Grand Total:", amount: "$23.66" },
      ]),
    );
    expect(check.status).toBe("unbalanced");
    // The missing −$1.17 saving is exactly the gap.
    expect(check.differenceCents).toBe(-117);
  });

  it("reports an unrecognised line without letting it hide in the total", () => {
    const check = checkAmazonOrderSummary(
      parseAmazonOrderSummary([
        { label: "Item(s) Subtotal:", amount: "$23.49" },
        { label: "Regulatory fee:", amount: "$0.50" },
        { label: "Grand Total:", amount: "$23.99" },
      ]),
    );
    expect(check.unknownLabels).toEqual(["Regulatory fee"]);
    expect(check.status).toBe("unbalanced");
    expect(check.differenceCents).toBe(50);
  });

  it("reconciles a gift-card order whose instrument line follows the grand total", () => {
    const check = checkAmazonOrderSummary(
      parseAmazonOrderSummary([
        { label: "Item(s) Subtotal:", amount: "$23.49" },
        { label: "Estimated tax to be collected:", amount: "$1.34" },
        { label: "Grand Total:", amount: "$24.83" },
        { label: "Gift Card Amount:", amount: "-$24.83" },
      ]),
    );
    expect(check.status).toBe("reconciled");
    expect(check.unknownLabels).toEqual(["Gift Card Amount"]);
  });

  it("calls a grand total with no breakdown incomplete, not reconciled", () => {
    const check = checkAmazonOrderSummary(
      parseAmazonOrderSummary([{ label: "TOTAL", amount: "$23.66" }]),
    );
    expect(check.status).toBe("incomplete");
    expect(check.reconciles).toBe(false);
    expect(check.differenceCents).toBeNull();
  });

  it("calls a $0.00 order reconciled when Amazon printed a $0.00 breakdown", () => {
    const check = checkAmazonOrderSummary(
      parseAmazonOrderSummary([
        { label: "Item(s) Subtotal:", amount: "$0.00" },
        { label: "Grand Total:", amount: "$0.00" },
      ]),
    );
    expect(check.status).toBe("reconciled");
  });
});

describe("deriveAmazonOrderSummary", () => {
  it("derives a summary from the privacy zip's item columns", () => {
    const summary = deriveAmazonOrderSummary([
      {
        itemPaidCents: 2349,
        itemTaxCents: 134,
        discountsCents: 117,
        shippingChargeCents: 0,
      },
    ]);
    expect(summary.source).toBe("derived");
    expect(summary.grandTotalCents).toBe(2366);
    expect(summary.promotionCents).toBe(-117);
    expect(checkAmazonOrderSummary(summary).status).toBe("reconciled");
  });

  it("subtracts a discount however the export signed it", () => {
    const positive = deriveAmazonOrderSummary([
      {
        itemPaidCents: 1000,
        itemTaxCents: null,
        discountsCents: 250,
        shippingChargeCents: null,
      },
    ]);
    const negative = deriveAmazonOrderSummary([
      {
        itemPaidCents: 1000,
        itemTaxCents: null,
        discountsCents: -250,
        shippingChargeCents: null,
      },
    ]);
    expect(positive.grandTotalCents).toBe(750);
    expect(negative.grandTotalCents).toBe(750);
  });
});

describe("asAmazonSummaryLines", () => {
  it("re-reads a stored payload and reclassifies a line missing its kind", () => {
    const lines = asAmazonSummaryLines([
      { label: "Grand Total", amountCents: 2366 },
      { label: "broken", amountCents: "2366" },
      "nonsense",
    ]);
    expect(lines).toEqual([
      { label: "Grand Total", amountCents: 2366, kind: "grandTotal" },
    ]);
  });
});
