/**
 * Amazon's printed order summary, read as money rather than re-derived from item lines.
 *
 * An order is a receipt, and a receipt has a total. Amazon prints tax and the Subscribe &
 * Save saving at **order** level only, so summing the item rows silently drops both — order
 * `111-7959899-2189857` reads as $23.49 when the card was charged $23.66, the $0.17 gap
 * being a −$1.17 subscription saving netted against $1.34 of tax.
 *
 * Nothing here touches the database. Everything is integer cents, every label Amazon printed
 * is kept verbatim, and the grand total is checked against the lines rather than trusted.
 *
 * See `agent-os/specs/2026-08-27-1521-amazon-order-totals-register-link/`.
 */

import { parseAmountCents } from "@/lib/finances/money";

export const AMAZON_SUMMARY_KINDS = [
  "itemsSubtotal",
  "shippingHandling",
  "promotion",
  "subscriptionSaving",
  "tax",
  "runningSubtotal",
  "grandTotal",
  "unknown",
] as const;

export type AmazonSummaryKind = (typeof AMAZON_SUMMARY_KINDS)[number];

/**
 * The lines that add up to the grand total. `runningSubtotal` ("Total before tax") is a
 * restatement of the lines above it, and `grandTotal` is the target — counting either would
 * double-count. `unknown` is excluded on purpose: if the line was really additive, leaving
 * it out is exactly what makes the order fail to reconcile and get flagged.
 */
const ADDITIVE_KINDS: ReadonlySet<AmazonSummaryKind> = new Set([
  "itemsSubtotal",
  "shippingHandling",
  "promotion",
  "subscriptionSaving",
  "tax",
]);

export type AmazonOrderSummaryLine = {
  /** Exactly as Amazon printed it, minus whitespace runs and a trailing colon. */
  label: string;
  amountCents: number;
  kind: AmazonSummaryKind;
};

export const AMAZON_SUMMARY_SOURCES = ["printed", "derived"] as const;
export type AmazonSummarySource = (typeof AMAZON_SUMMARY_SOURCES)[number];

export type AmazonOrderSummary = {
  lines: AmazonOrderSummaryLine[];
  itemsSubtotalCents: number | null;
  shippingHandlingCents: number | null;
  /** Every promotion and subscription saving, signed as printed (normally negative). */
  promotionCents: number | null;
  taxCents: number | null;
  grandTotalCents: number | null;
  source: AmazonSummarySource;
};

export type AmazonSummaryStatus =
  /** Grand total equals the sum of the recognised lines. */
  | "reconciled"
  /** No grand total, or no breakdown to check it against. */
  | "incomplete"
  /** There is a breakdown and it does not add up. */
  | "unbalanced";

export type AmazonSummaryCheck = {
  status: AmazonSummaryStatus;
  reconciles: boolean;
  /** Sum of the recognised additive lines. */
  recognisedCents: number;
  /** `grandTotal − recognised`, or `null` when there is nothing to compare. */
  differenceCents: number | null;
  /** Labels Amazon printed that we did not classify, in order. */
  unknownLabels: string[];
};

/** A `label: amount` pair as scraped, before either half has been trusted. */
export type RawSummaryLine = { label: string; amount: string | number };

const UNICODE_MINUS = /[−–—]/g;

export function normaliseSummaryLabel(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/[:\s]+$/, "")
    .trim();
}

/**
 * Which of Amazon's summary lines this is.
 *
 * Order matters. "Total before tax" contains both "total" and "tax", and "Free Shipping" is
 * a discount rather than a shipping charge, so the specific tests run before the general
 * ones.
 */
export function classifyAmazonSummaryLabel(raw: string): AmazonSummaryKind {
  const label = normaliseSummaryLabel(raw).toLowerCase();
  if (label === "") return "unknown";
  if (/^total before\b/.test(label)) return "runningSubtotal";
  if (/^(grand total|order total|total for this order)\b/.test(label)) {
    return "grandTotal";
  }
  if (/item.*subtotal|^subtotal$/.test(label)) return "itemsSubtotal";
  if (/subscribe\s*(?:&|and)\s*save|subscription saving/.test(label)) {
    return "subscriptionSaving";
  }
  if (
    /free shipping|promotion|discount|coupon|saving|rebate|price adjustment/.test(label)
  ) {
    return "promotion";
  }
  if (/shipping|handling|delivery/.test(label)) return "shippingHandling";
  if (/tax/.test(label)) return "tax";
  return "unknown";
}

/** Read one printed amount into cents. Amazon prints an en dash for minus often enough. */
export function summaryAmountCents(raw: string | number): number | null {
  if (typeof raw === "number") return Number.isInteger(raw) ? raw : null;
  const text = raw.replace(UNICODE_MINUS, "-").trim();
  if (text === "") return null;
  return parseAmountCents(text);
}

/**
 * Turn scraped label/amount pairs into classified summary lines.
 *
 * A pair whose amount will not parse is dropped rather than guessed at — a fabricated zero
 * would make an unbalanced order look reconciled, which is the failure this whole module
 * exists to prevent.
 */
export function parseAmazonSummaryLines(
  raw: readonly RawSummaryLine[],
): AmazonOrderSummaryLine[] {
  const lines: AmazonOrderSummaryLine[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const label = normaliseSummaryLabel(String(entry.label ?? ""));
    if (label === "" || label.length > 120) continue;
    const amountCents = summaryAmountCents(entry.amount);
    if (amountCents === null) continue;
    // Amazon renders the summary block twice on some order pages (once for the shipment,
    // once for the order). A repeated label and amount is that echo, not a second charge.
    const key = `${label.toLowerCase()}|${amountCents}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push({ label, amountCents, kind: classifyAmazonSummaryLabel(label) });
  }
  return lines;
}

function totalOf(
  lines: readonly AmazonOrderSummaryLine[],
  ...kinds: readonly AmazonSummaryKind[]
): number | null {
  const wanted = new Set(kinds);
  const matching = lines.filter((line) => wanted.has(line.kind));
  if (matching.length === 0) return null;
  return matching.reduce((sum, line) => sum + line.amountCents, 0);
}

/** Roll classified lines up into the five stored columns. */
export function summariseAmazonOrder(
  lines: readonly AmazonOrderSummaryLine[],
  source: AmazonSummarySource = "printed",
): AmazonOrderSummary {
  return {
    lines: [...lines],
    itemsSubtotalCents: totalOf(lines, "itemsSubtotal"),
    shippingHandlingCents: totalOf(lines, "shippingHandling"),
    promotionCents: totalOf(lines, "promotion", "subscriptionSaving"),
    taxCents: totalOf(lines, "tax"),
    grandTotalCents: totalOf(lines, "grandTotal"),
    source,
  };
}

export function parseAmazonOrderSummary(
  raw: readonly RawSummaryLine[],
  source: AmazonSummarySource = "printed",
): AmazonOrderSummary {
  return summariseAmazonOrder(parseAmazonSummaryLines(raw), source);
}

/**
 * The invariant: the grand total equals the sum of the recognised lines.
 *
 * An order that does not reconcile is flagged, never quietly trusted. This is the check that
 * would have caught the $23.49-vs-$23.66 defect the day it shipped.
 */
export function checkAmazonOrderSummary(
  summary: Pick<AmazonOrderSummary, "lines" | "grandTotalCents">,
): AmazonSummaryCheck {
  const additive = summary.lines.filter((line) => ADDITIVE_KINDS.has(line.kind));
  const recognisedCents = additive.reduce((sum, line) => sum + line.amountCents, 0);
  const unknownLabels = summary.lines
    .filter((line) => line.kind === "unknown")
    .map((line) => line.label);
  if (summary.grandTotalCents === null || additive.length === 0) {
    return {
      status: "incomplete",
      reconciles: false,
      recognisedCents,
      differenceCents: null,
      unknownLabels,
    };
  }
  const differenceCents = summary.grandTotalCents - recognisedCents;
  return {
    status: differenceCents === 0 ? "reconciled" : "unbalanced",
    reconciles: differenceCents === 0,
    recognisedCents,
    differenceCents,
    unknownLabels,
  };
}

/** The Subscribe & Save saving alone, which allocates only across S&S lines. */
export function subscriptionSavingCents(
  lines: readonly AmazonOrderSummaryLine[],
): number {
  return totalOf(lines, "subscriptionSaving") ?? 0;
}

/** Every promotion that is *not* the subscription saving, which spreads across all lines. */
export function otherPromotionCents(lines: readonly AmazonOrderSummaryLine[]): number {
  return totalOf(lines, "promotion") ?? 0;
}

export type DerivableItem = {
  itemPaidCents: number | null;
  itemTaxCents: number | null;
  discountsCents: number | null;
  shippingChargeCents: number | null;
};

/**
 * A privacy-request zip has no printed summary block, so derive one from the item columns
 * and mark it `derived`. Derived is never presented as printed.
 *
 * `Total Discounts` is printed as a magnitude in the export, so it is subtracted by absolute
 * value and stored back with the negative sign the printed summary uses.
 */
export function deriveAmazonOrderSummary(
  items: readonly DerivableItem[],
): AmazonOrderSummary {
  const sum = (pick: (item: DerivableItem) => number | null) =>
    items.reduce((total, item) => total + (pick(item) ?? 0), 0);
  const itemsSubtotalCents = sum((item) => item.itemPaidCents);
  const taxCents = sum((item) => item.itemTaxCents);
  const shippingHandlingCents = sum((item) => item.shippingChargeCents);
  const promotionCents = -Math.abs(sum((item) => item.discountsCents));
  const grandTotalCents =
    itemsSubtotalCents + taxCents + shippingHandlingCents + promotionCents;

  const lines: AmazonOrderSummaryLine[] = [
    {
      label: "Item(s) Subtotal",
      amountCents: itemsSubtotalCents,
      kind: "itemsSubtotal",
    },
  ];
  if (shippingHandlingCents !== 0) {
    lines.push({
      label: "Shipping & Handling",
      amountCents: shippingHandlingCents,
      kind: "shippingHandling",
    });
  }
  if (promotionCents !== 0) {
    lines.push({ label: "Discounts", amountCents: promotionCents, kind: "promotion" });
  }
  if (taxCents !== 0) {
    lines.push({ label: "Tax", amountCents: taxCents, kind: "tax" });
  }
  lines.push({
    label: "Grand Total",
    amountCents: grandTotalCents,
    kind: "grandTotal",
  });

  return {
    lines,
    itemsSubtotalCents,
    shippingHandlingCents: shippingHandlingCents === 0 ? null : shippingHandlingCents,
    promotionCents: promotionCents === 0 ? null : promotionCents,
    taxCents: taxCents === 0 ? null : taxCents,
    grandTotalCents,
    source: "derived",
  };
}

export function asAmazonSummarySource(value: unknown): AmazonSummarySource | null {
  return value === "printed" || value === "derived" ? value : null;
}

/** Read a `summary_lines` jsonb payload back without trusting what is in the column. */
export function asAmazonSummaryLines(value: unknown): AmazonOrderSummaryLine[] {
  if (!Array.isArray(value)) return [];
  const kinds = new Set<string>(AMAZON_SUMMARY_KINDS);
  const lines: AmazonOrderSummaryLine[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.label !== "string") continue;
    if (
      typeof record.amountCents !== "number" ||
      !Number.isInteger(record.amountCents)
    ) {
      continue;
    }
    const kind =
      typeof record.kind === "string" && kinds.has(record.kind)
        ? (record.kind as AmazonSummaryKind)
        : classifyAmazonSummaryLabel(record.label);
    lines.push({ label: record.label, amountCents: record.amountCents, kind });
  }
  return lines;
}
