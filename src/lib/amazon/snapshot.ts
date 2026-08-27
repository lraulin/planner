/**
 * Versioned `# planner-amazon v1` clipboard snapshot.
 *
 * The Tampermonkey script is a thin authenticated-page extractor. This module is the only
 * place that turns that text into calendar days, cents, identifiers and completeness.
 * Unknown keys are dropped on the floor, which is how addresses, customer details and full
 * payment data stay out of Planner even if a later script grows sloppy.
 */

import {
  amazonAmountCents,
  amazonBlank,
  amazonCalendarDay,
  amazonQuantity,
} from "./csv";

export const PLANNER_AMAZON_HEADER = "# planner-amazon v1";
export const SNAPSHOT_VERSION = 1;
export const SNAPSHOT_SOURCE = "amazon-browser-capture";

export const AMAZON_SUBSCRIPTION_STATUSES = [
  "active",
  "attention",
  "cancelled",
  "unknown",
] as const;
export type AmazonSubscriptionStatus = (typeof AMAZON_SUBSCRIPTION_STATUSES)[number];

export const AMAZON_PAYMENT_STATUSES = [
  "completed",
  "pending",
  "refunded",
  "unknown",
] as const;
export type AmazonPaymentStatus = (typeof AMAZON_PAYMENT_STATUSES)[number];

export const AMAZON_INSTRUMENTS = ["card", "rewards", "gift", "other"] as const;
export type AmazonInstrumentKind = (typeof AMAZON_INSTRUMENTS)[number];

export type AmazonSnapshotCompleteness = {
  /** True only when the current subscription list was fetched to the last page. */
  subscriptions: boolean;
  /** True only when payment history was scanned to the last available page. */
  payments: boolean;
  /** True only when every linked order's details were fetched. */
  orders: boolean;
};

export type AmazonSnapshotCadence = {
  unit: "month" | "day";
  n: number;
} | null;

export type AmazonSnapshotSubscription = {
  subscriptionId: string;
  asin: string;
  productName: string;
  quantity: number;
  cadence: AmazonSnapshotCadence;
  cadenceLabel: string;
  nextDeliveryDate: string;
  status: AmazonSubscriptionStatus;
};

export type AmazonSnapshotPayment = {
  paymentId: string;
  date: string;
  /** Register sign: card charges negative, refunds positive. */
  amountCents: number | null;
  status: AmazonPaymentStatus;
  cardLast4: string | null;
  instrumentKind: AmazonInstrumentKind;
  amazonOrderIds: string[];
};

export type AmazonSnapshotOrder = {
  amazonOrderId: string;
  orderDate: string;
  orderStatus: string;
  subscribeAndSave: boolean;
};

export type AmazonSnapshotItem = {
  /** Retail identity `orderId:ASIN:ordinal`. */
  lineId: string;
  amazonOrderId: string;
  asin: string;
  productName: string;
  quantity: number;
  itemPaidCents: number | null;
  itemTaxCents: number | null;
  discountsCents: number | null;
  shippingChargeCents: number | null;
  subscribeAndSave: boolean;
  subscriptionId: string | null;
};

export type AmazonSnapshot = {
  version: typeof SNAPSHOT_VERSION;
  source: typeof SNAPSHOT_SOURCE;
  generatedAt: string;
  capturedOn: string;
  completeness: AmazonSnapshotCompleteness;
  subscriptions: AmazonSnapshotSubscription[];
  payments: AmazonSnapshotPayment[];
  orders: AmazonSnapshotOrder[];
  items: AmazonSnapshotItem[];
};

export type SnapshotIssue = { path: string; message: string };

export type ParseAmazonSnapshotResult =
  | { ok: true; snapshot: AmazonSnapshot; issues: SnapshotIssue[] }
  | { ok: false; error: string; issues: SnapshotIssue[] };

export function looksLikePlannerAmazon(text: string): boolean {
  return firstMeaningfulLine(text) === PLANNER_AMAZON_HEADER;
}

export function serializeAmazonSnapshot(snapshot: AmazonSnapshot): string {
  return `${PLANNER_AMAZON_HEADER}\n${JSON.stringify(snapshot)}\n`;
}

/**
 * Parse a tagged snapshot. Partial evidence is accepted; completeness flags say whether a
 * later pass may treat missing subscriptions as cancelled.
 */
export function parseAmazonSnapshot(text: string): ParseAmazonSnapshotResult {
  if (!looksLikePlannerAmazon(text)) {
    return {
      ok: false,
      error: "That is not a Planner Amazon snapshot.",
      issues: [],
    };
  }

  const jsonText = snapshotJsonBody(text);
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: "The snapshot is not valid JSON.", issues: [] };
  }
  if (!isRecord(raw)) {
    return { ok: false, error: "The snapshot is not a JSON object.", issues: [] };
  }
  if (raw.version !== SNAPSHOT_VERSION || raw.source !== SNAPSHOT_SOURCE) {
    return {
      ok: false,
      error:
        "Not a Planner Amazon snapshot (expected version 1, amazon-browser-capture).",
      issues: [],
    };
  }

  const issues: SnapshotIssue[] = [];
  const capturedOn = amazonCalendarDay(asString(raw.capturedOn)) || "";
  const generatedAt =
    typeof raw.generatedAt === "string" && raw.generatedAt.trim() !== ""
      ? raw.generatedAt.trim()
      : "";

  const completeness = parseCompleteness(raw.completeness, issues);
  const subscriptions = parseSubscriptions(raw.subscriptions, issues);
  const payments = parsePayments(raw.payments, issues);
  const orders = parseOrders(raw.orders, issues);
  const items = parseItems(raw.items, issues);

  return {
    ok: true,
    snapshot: {
      version: SNAPSHOT_VERSION,
      source: SNAPSHOT_SOURCE,
      generatedAt,
      capturedOn,
      completeness,
      subscriptions,
      payments,
      orders,
      items,
    },
    issues,
  };
}

function snapshotJsonBody(text: string): string {
  const lines = text.split(/\r?\n/);
  const body: string[] = [];
  let seenHeader = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!seenHeader) {
      if (trimmed === "") continue;
      if (trimmed === PLANNER_AMAZON_HEADER) {
        seenHeader = true;
        continue;
      }
    }
    if (!seenHeader) continue;
    if (trimmed.startsWith("#")) continue;
    body.push(line);
  }
  return body.join("\n").trim();
}

function parseCompleteness(
  raw: unknown,
  issues: SnapshotIssue[],
): AmazonSnapshotCompleteness {
  if (raw === undefined) {
    issues.push({
      path: "completeness",
      message: "Completeness was omitted; treating the capture as incomplete.",
    });
    return { subscriptions: false, payments: false, orders: false };
  }
  if (!isRecord(raw)) {
    issues.push({
      path: "completeness",
      message: "Completeness was not an object; treating the capture as incomplete.",
    });
    return { subscriptions: false, payments: false, orders: false };
  }
  return {
    subscriptions: raw.subscriptions === true,
    payments: raw.payments === true,
    orders: raw.orders === true,
  };
}

function parseSubscriptions(
  raw: unknown,
  issues: SnapshotIssue[],
): AmazonSnapshotSubscription[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    issues.push({ path: "subscriptions", message: "Subscriptions must be an array." });
    return [];
  }
  const seen = new Set<string>();
  const rows: AmazonSnapshotSubscription[] = [];
  raw.forEach((entry, index) => {
    const path = `subscriptions[${index}]`;
    if (!isRecord(entry)) {
      issues.push({ path, message: "Subscription is not an object." });
      return;
    }
    const subscriptionId = identifier(entry.subscriptionId, "subscription");
    if (!subscriptionId) {
      issues.push({ path, message: "Missing or malformed subscription id." });
      return;
    }
    if (seen.has(subscriptionId)) {
      issues.push({
        path,
        message: `Duplicate subscription id ${subscriptionId} was ignored.`,
      });
      return;
    }
    seen.add(subscriptionId);
    const asin = asinOf(entry.asin);
    if (entry.asin !== undefined && asString(entry.asin) !== "" && asin === "") {
      issues.push({ path: `${path}.asin`, message: "Malformed ASIN." });
    }
    const cadence = cadenceOf(
      entry.cadence,
      entry.cadenceLabel,
      `${path}.cadence`,
      issues,
    );
    rows.push({
      subscriptionId,
      asin,
      productName: asString(entry.productName),
      quantity: amazonQuantity(asString(entry.quantity) || "1"),
      cadence,
      cadenceLabel: asString(entry.cadenceLabel),
      nextDeliveryDate: dateField(
        entry.nextDeliveryDate,
        `${path}.nextDeliveryDate`,
        issues,
      ),
      status: enumOf(entry.status, AMAZON_SUBSCRIPTION_STATUSES, "unknown"),
    });
  });
  return rows;
}

function parsePayments(raw: unknown, issues: SnapshotIssue[]): AmazonSnapshotPayment[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    issues.push({ path: "payments", message: "Payments must be an array." });
    return [];
  }
  const seen = new Set<string>();
  const rows: AmazonSnapshotPayment[] = [];
  raw.forEach((entry, index) => {
    const path = `payments[${index}]`;
    if (!isRecord(entry)) {
      issues.push({ path, message: "Payment is not an object." });
      return;
    }
    const paymentId = identifier(entry.paymentId, "payment");
    if (!paymentId) {
      issues.push({ path, message: "Missing or malformed payment id." });
      return;
    }
    if (seen.has(paymentId)) {
      issues.push({ path, message: `Duplicate payment id ${paymentId} was ignored.` });
      return;
    }
    seen.add(paymentId);
    const status = enumOf(entry.status, AMAZON_PAYMENT_STATUSES, "unknown");
    const instrumentKind = enumOf(entry.instrumentKind, AMAZON_INSTRUMENTS, "other");
    const amountCents = moneyField(
      entry.amountCents ?? entry.amount,
      `${path}.amount`,
      issues,
    );
    const signed = signPaymentAmount(amountCents, status, instrumentKind);
    const cardLast4 = last4Of(entry.cardLast4 ?? entry.last4);
    if (
      entry.cardLast4 !== undefined &&
      asString(entry.cardLast4) !== "" &&
      !cardLast4
    ) {
      issues.push({ path: `${path}.cardLast4`, message: "Malformed card suffix." });
    }
    rows.push({
      paymentId,
      date: dateField(entry.date, `${path}.date`, issues),
      amountCents: signed,
      status,
      cardLast4,
      instrumentKind,
      amazonOrderIds: orderIdsOf(
        entry.amazonOrderIds,
        `${path}.amazonOrderIds`,
        issues,
      ),
    });
  });
  return rows;
}

function parseOrders(raw: unknown, issues: SnapshotIssue[]): AmazonSnapshotOrder[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    issues.push({ path: "orders", message: "Orders must be an array." });
    return [];
  }
  const seen = new Set<string>();
  const rows: AmazonSnapshotOrder[] = [];
  raw.forEach((entry, index) => {
    const path = `orders[${index}]`;
    if (!isRecord(entry)) {
      issues.push({ path, message: "Order is not an object." });
      return;
    }
    const amazonOrderId = orderIdOf(entry.amazonOrderId);
    if (!amazonOrderId) {
      issues.push({ path, message: "Missing or malformed order id." });
      return;
    }
    if (seen.has(amazonOrderId)) {
      issues.push({
        path,
        message: `Duplicate order id ${amazonOrderId} was ignored.`,
      });
      return;
    }
    seen.add(amazonOrderId);
    rows.push({
      amazonOrderId,
      orderDate: dateField(entry.orderDate, `${path}.orderDate`, issues),
      orderStatus: asString(entry.orderStatus),
      subscribeAndSave: entry.subscribeAndSave === true,
    });
  });
  return rows;
}

function parseItems(raw: unknown, issues: SnapshotIssue[]): AmazonSnapshotItem[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    issues.push({ path: "items", message: "Items must be an array." });
    return [];
  }
  const ordinals = new Map<string, number>();
  const seenLine = new Set<string>();
  const rows: AmazonSnapshotItem[] = [];
  raw.forEach((entry, index) => {
    const path = `items[${index}]`;
    if (!isRecord(entry)) {
      issues.push({ path, message: "Item is not an object." });
      return;
    }
    const amazonOrderId = orderIdOf(entry.amazonOrderId);
    if (!amazonOrderId) {
      issues.push({ path, message: "Missing or malformed order id." });
      return;
    }
    const asin = asinOf(entry.asin);
    if (entry.asin !== undefined && asString(entry.asin) !== "" && asin === "") {
      issues.push({ path: `${path}.asin`, message: "Malformed ASIN." });
    }
    const stem = `${amazonOrderId}:${asin}`;
    const ordinal = ordinals.get(stem) ?? 0;
    ordinals.set(stem, ordinal + 1);
    const computed = `${stem}:${ordinal}`;
    const given = asString(entry.lineId);
    const lineId = given || computed;
    if (given && given !== computed) {
      // The script may already have numbered; keep it if unique, otherwise fall back.
      if (seenLine.has(given)) {
        issues.push({
          path: `${path}.lineId`,
          message: `Duplicate line id ${given}; using ${computed}.`,
        });
      }
    }
    const uniqueId = seenLine.has(lineId) ? computed : lineId;
    if (seenLine.has(uniqueId)) {
      issues.push({
        path,
        message: `Duplicate line item ${uniqueId} was ignored.`,
      });
      return;
    }
    seenLine.add(uniqueId);
    const subscriptionId = identifier(entry.subscriptionId, "subscription");
    rows.push({
      lineId: uniqueId,
      amazonOrderId,
      asin,
      productName: asString(entry.productName),
      quantity: amazonQuantity(asString(entry.quantity) || "1"),
      itemPaidCents: moneyField(
        entry.itemPaidCents ?? entry.itemPaid,
        `${path}.itemPaid`,
        issues,
      ),
      itemTaxCents: moneyField(
        entry.itemTaxCents ?? entry.itemTax,
        `${path}.itemTax`,
        issues,
      ),
      discountsCents: moneyField(
        entry.discountsCents ?? entry.discounts,
        `${path}.discounts`,
        issues,
      ),
      shippingChargeCents: moneyField(
        entry.shippingChargeCents ?? entry.shippingCharge,
        `${path}.shippingCharge`,
        issues,
      ),
      subscribeAndSave: entry.subscribeAndSave === true,
      subscriptionId,
    });
  });
  return rows;
}

function cadenceOf(
  raw: unknown,
  label: unknown,
  path: string,
  issues: SnapshotIssue[],
): AmazonSnapshotCadence {
  if (isRecord(raw)) {
    const unit = raw.unit === "day" ? "day" : raw.unit === "month" ? "month" : null;
    const n = Number(raw.n);
    if (unit && Number.isInteger(n) && n > 0) {
      if (unit === "month" && (n < 1 || n > 24)) {
        issues.push({ path, message: "Cadence in months must be from 1 to 24." });
        return null;
      }
      if (unit === "day" && (n < 2 || n > 200)) {
        issues.push({ path, message: "Cadence in days must be from 2 to 200." });
        return null;
      }
      return { unit, n };
    }
    if (raw.unit !== undefined || raw.n !== undefined) {
      issues.push({ path, message: "Malformed cadence." });
    }
  }
  return cadenceFromLabel(asString(label));
}

export function cadenceFromLabel(label: string): AmazonSnapshotCadence {
  const text = label.trim().toLowerCase();
  if (text === "") return null;
  const months = /(?:every|deliver every)\s+(\d+)\s+months?/.exec(text);
  if (months) {
    const n = Number(months[1]);
    return n >= 1 && n <= 24 ? { unit: "month", n } : null;
  }
  const weeks = /(?:every|deliver every)\s+(\d+)\s+weeks?/.exec(text);
  if (weeks) {
    const n = Number(weeks[1]) * 7;
    return n >= 2 && n <= 200 ? { unit: "day", n } : null;
  }
  const days = /(?:every|deliver every)\s+(\d+)\s+days?/.exec(text);
  if (days) {
    const n = Number(days[1]);
    return n >= 2 && n <= 200 ? { unit: "day", n } : null;
  }
  if (/every month|monthly/.test(text)) return { unit: "month", n: 1 };
  return null;
}

/**
 * Amazon prints charges as `$12.34`. The register stores card charges negative. A payload
 * that is already signed is left alone so a later script that copies the register convention
 * does not get flipped twice. Rewards and refunds stay as evidence without becoming a match.
 */
function signPaymentAmount(
  amountCents: number | null,
  status: AmazonPaymentStatus,
  instrumentKind: AmazonInstrumentKind,
): number | null {
  if (amountCents === null) return null;
  if (status === "refunded") return amountCents < 0 ? -amountCents : amountCents;
  if (instrumentKind === "rewards" || instrumentKind === "gift") return amountCents;
  return amountCents > 0 ? -amountCents : amountCents;
}

function dateField(raw: unknown, path: string, issues: SnapshotIssue[]): string {
  const value = asString(raw);
  if (value === "") return "";
  const day = amazonCalendarDay(value);
  if (day === "") {
    issues.push({ path, message: `Malformed date ${value}.` });
    return "";
  }
  return day;
}

function moneyField(
  raw: unknown,
  path: string,
  issues: SnapshotIssue[],
): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") {
    if (!Number.isInteger(raw)) {
      issues.push({
        path,
        message: "Money must be integer cents or a printed amount.",
      });
      return null;
    }
    return raw;
  }
  const cents = amazonAmountCents(asString(raw));
  if (cents === null) {
    issues.push({ path, message: `Malformed amount ${asString(raw)}.` });
    return null;
  }
  return cents;
}

function orderIdsOf(raw: unknown, path: string, issues: SnapshotIssue[]): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    issues.push({ path, message: "Linked orders must be an array." });
    return [];
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  raw.forEach((entry, index) => {
    const id = orderIdOf(entry);
    if (!id) {
      issues.push({ path: `${path}[${index}]`, message: "Malformed order id." });
      return;
    }
    if (seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  });
  return ids;
}

function identifier(raw: unknown, kind: "subscription" | "payment"): string | null {
  const value = asString(raw);
  if (value === "") return null;
  if (/\s/.test(value)) return null;
  if (kind === "subscription" && value.length > 80) return null;
  if (kind === "payment" && value.length > 120) return null;
  if (looksLikePii(value)) return null;
  return value;
}

function orderIdOf(raw: unknown): string | null {
  const value = asString(raw);
  if (value === "") return null;
  if (looksLikePii(value)) return null;
  // Amazon retail ids are `###-#######-#######`. Digital and older ids are looser.
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{5,40}$/.test(value)) return null;
  return value;
}

function asinOf(raw: unknown): string {
  const value = asString(raw).toUpperCase();
  if (value === "") return "";
  return /^[A-Z0-9]{10}$/.test(value) ? value : "";
}

function last4Of(raw: unknown): string | null {
  const digits = asString(raw).replace(/\D/g, "");
  if (digits === "") return null;
  if (digits.length < 4) return null;
  return digits.slice(-4);
}

function looksLikePii(value: string): boolean {
  if (value.includes("@")) return true;
  if (/\d{12,}/.test(value.replace(/\s/g, ""))) return true;
  return false;
}

function enumOf<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  const value = asString(raw).toLowerCase();
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function asString(raw: unknown): string {
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  return amazonBlank(typeof raw === "string" ? raw : "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstMeaningfulLine(text: string): string {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed !== "") return trimmed;
  }
  return "";
}
