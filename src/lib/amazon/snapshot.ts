/**
 * Versioned `# planner-amazon v2` clipboard snapshot.
 *
 * The Tampermonkey script is a thin authenticated-page extractor. This module is the only
 * place that turns that text into calendar days, cents, identifiers and completeness.
 * Unknown keys are dropped on the floor, which is how addresses, customer details and full
 * payment data stay out of Planner even if a later script grows sloppy.
 *
 * **v2** carries two things v1 could not: each order's printed summary block, and charge
 * evidence fetched per order. A charge's identity is minted here from what it *is* —
 * `orderId|date|last4|amountCents|ordinal` — rather than from the page wording the script
 * happened to see, so re-capturing after Amazon rewords a row updates the charge instead of
 * duplicating it.
 *
 * See `agent-os/specs/2026-08-27-1521-amazon-order-totals-register-link/`.
 */

import {
  amazonAmountCents,
  amazonBlank,
  amazonCalendarDay,
  amazonQuantity,
} from "./csv";
import {
  asAmazonSummaryLines,
  asAmazonSummarySource,
  checkAmazonOrderSummary,
  parseAmazonSummaryLines,
  summariseAmazonOrder,
  type AmazonOrderSummary,
  type AmazonSummaryCheck,
} from "./orderSummary";

export const PLANNER_AMAZON_HEADER = "# planner-amazon v2";
export const SNAPSHOT_VERSION = 2;
export const SNAPSHOT_SOURCE = "amazon-browser-capture";

/** Header shapes an older userscript emits, refused with an actionable message. */
const SUPERSEDED_HEADERS = ["# planner-amazon v1"];

export const SNAPSHOT_OUT_OF_DATE =
  "That snapshot came from an older userscript (v1), which never captured order totals " +
  "or per-order charges. Reinstall scripts/amazon-subscribe-save.user.js and capture " +
  "again.";

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
  /**
   * Amazon's own printed money for this order. `null` only when neither the order-history
   * card nor the detail page yielded a figure — never a zero standing in for "unknown".
   */
  summary: AmazonOrderSummary | null;
};

/** Whether an order's stored summary adds up. `null` when there is no summary at all. */
export function amazonSnapshotOrderCheck(
  order: AmazonSnapshotOrder,
): AmazonSummaryCheck | null {
  return order.summary ? checkAmazonOrderSummary(order.summary) : null;
}

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

/**
 * Why this text is not a snapshot we can read, or `null` when it is one.
 *
 * A v1 paste is refused outright rather than imported partially: its orders have no totals
 * and its charges have text-derived ids, so accepting it would write exactly the wrong
 * numbers back over the right ones.
 */
export function amazonSnapshotHeaderProblem(text: string): string | null {
  const header = firstMeaningfulLine(text);
  if (header === PLANNER_AMAZON_HEADER) return null;
  if (SUPERSEDED_HEADERS.includes(header)) return SNAPSHOT_OUT_OF_DATE;
  return "That is not a Planner Amazon snapshot.";
}

export function serializeAmazonSnapshot(snapshot: AmazonSnapshot): string {
  return `${PLANNER_AMAZON_HEADER}\n${JSON.stringify(snapshot)}\n`;
}

/**
 * Parse a tagged snapshot. Partial evidence is accepted; completeness flags say whether a
 * later pass may treat missing subscriptions as cancelled.
 */
export function parseAmazonSnapshot(text: string): ParseAmazonSnapshotResult {
  const headerProblem = amazonSnapshotHeaderProblem(text);
  if (headerProblem) return { ok: false, error: headerProblem, issues: [] };

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
  if (raw.source !== SNAPSHOT_SOURCE) {
    return {
      ok: false,
      error: "That is not a Planner Amazon snapshot.",
      issues: [],
    };
  }
  if (raw.version !== SNAPSHOT_VERSION) {
    return { ok: false, error: SNAPSHOT_OUT_OF_DATE, issues: [] };
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

/**
 * Charge evidence, keyed by what the charge *is*.
 *
 * v1 minted `pay-${orderIds}-${text.slice(0, 24)}` off the page wording, so any Amazon
 * rewording created a second charge for a payment already recorded and already matched. The
 * identity is now `orderId|date|last4|amountCents|ordinal`, every part of it a fact about the
 * payment.
 *
 * Charges are fetched per order, so one charge covering two orders arrives twice — once from
 * each order's transactions page. Those two rows are the same payment and must collapse. Two
 * genuinely separate charges of the same amount on the same day must not. What separates them
 * is how many times *one* order's page listed the row: `sourceOrderId` carries that, and the
 * ordinal count is the largest multiplicity any single source reported.
 */
function parsePayments(raw: unknown, issues: SnapshotIssue[]): AmazonSnapshotPayment[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    issues.push({ path: "payments", message: "Payments must be an array." });
    return [];
  }

  type Candidate = {
    date: string;
    amountCents: number | null;
    status: AmazonPaymentStatus;
    cardLast4: string | null;
    instrumentKind: AmazonInstrumentKind;
    amazonOrderIds: string[];
    sourceOrderId: string;
  };
  const candidates: Candidate[] = [];
  const keyed = new Map<string, AmazonSnapshotPayment>();

  raw.forEach((entry, index) => {
    const path = `payments[${index}]`;
    if (!isRecord(entry)) {
      issues.push({ path, message: "Payment is not an object." });
      return;
    }
    const status = enumOf(entry.status, AMAZON_PAYMENT_STATUSES, "unknown");
    const instrumentKind = enumOf(entry.instrumentKind, AMAZON_INSTRUMENTS, "other");
    const amountCents = moneyField(
      entry.amountCents ?? entry.amount,
      `${path}.amount`,
      issues,
    );
    const cardLast4 = last4Of(entry.cardLast4 ?? entry.last4);
    if (
      entry.cardLast4 !== undefined &&
      asString(entry.cardLast4) !== "" &&
      !cardLast4
    ) {
      issues.push({ path: `${path}.cardLast4`, message: "Malformed card suffix." });
    }
    const amazonOrderIds = orderIdsOf(
      entry.amazonOrderIds,
      `${path}.amazonOrderIds`,
      issues,
    );
    const sourceOrderId = orderIdOf(entry.sourceOrderId) ?? "";
    const mintedId = asString(entry.paymentId);
    if (isAmazonChargeKey(mintedId)) {
      // Already carries a v2 identity — a re-parse of our own snapshot, or of stored
      // evidence. Minting again would renumber an ordinal we already settled.
      keyed.set(mintedId, {
        paymentId: mintedId,
        date: dateField(entry.date, `${path}.date`, issues),
        amountCents: signPaymentAmount(amountCents, status, instrumentKind),
        status,
        cardLast4,
        instrumentKind,
        amazonOrderIds,
      });
      return;
    }
    if (amazonOrderIds.length === 0 && sourceOrderId === "") {
      issues.push({
        path,
        message: "Charge names no order, so it cannot be identified; it was ignored.",
      });
      return;
    }
    if (amountCents === null) {
      issues.push({
        path,
        message: "Charge has no readable amount; it was ignored.",
      });
      return;
    }
    candidates.push({
      date: dateField(entry.date, `${path}.date`, issues),
      amountCents: signPaymentAmount(amountCents, status, instrumentKind),
      status,
      cardLast4,
      instrumentKind,
      amazonOrderIds:
        amazonOrderIds.length > 0
          ? amazonOrderIds
          : sourceOrderId
            ? [sourceOrderId]
            : [],
      sourceOrderId,
    });
  });

  type Group = {
    charge: Candidate;
    orderIds: Set<string>;
    /** How many times each fetched order's page listed this exact row. */
    bySource: Map<string, number>;
  };
  const groups = new Map<string, Group>();
  for (const candidate of candidates) {
    const primary = [...candidate.amazonOrderIds].sort()[0] ?? candidate.sourceOrderId;
    const key = [
      primary,
      candidate.date,
      candidate.cardLast4 ?? "",
      candidate.amountCents ?? "",
    ].join("|");
    const group = groups.get(key) ?? {
      charge: candidate,
      orderIds: new Set<string>(),
      bySource: new Map<string, number>(),
    };
    for (const id of candidate.amazonOrderIds) group.orderIds.add(id);
    // A row with no source order came from the payments-history walk, which lists each
    // charge once; it can never justify a second ordinal.
    const source = candidate.sourceOrderId || "\u0000history";
    group.bySource.set(source, (group.bySource.get(source) ?? 0) + 1);
    // Prefer the most settled reading when two fetches disagree.
    if (candidate.status !== "unknown" && group.charge.status === "unknown") {
      group.charge = { ...candidate };
    }
    groups.set(key, group);
  }

  const rows: AmazonSnapshotPayment[] = [...keyed.values()];
  for (const [key, group] of groups) {
    if (keyed.has(`${key}|0`)) continue;
    const copies = Math.max(...group.bySource.values());
    for (let ordinal = 0; ordinal < copies; ordinal += 1) {
      rows.push({
        paymentId: `${key}|${ordinal}`,
        date: group.charge.date,
        amountCents: group.charge.amountCents,
        status: group.charge.status,
        cardLast4: group.charge.cardLast4,
        instrumentKind: group.charge.instrumentKind,
        amazonOrderIds: [...group.orderIds].sort(),
      });
    }
  }
  return rows;
}

/** True for an id this parser could have minted — anything else predates the v2 contract. */
export function isAmazonChargeKey(paymentId: string): boolean {
  return /^[^|]+\|[^|]*\|\d{0,4}\|-?\d+\|\d+$/.test(paymentId);
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
      summary: orderSummaryOf(entry, path, issues),
    });
  });
  return rows;
}

/**
 * The order's printed money.
 *
 * `summaryLines` is the detail page's breakdown; `total` is the grand total the order-history
 * card printed. The history walk sees every order, the detail fetch only some, so an order
 * can arrive with a total and no breakdown — that is `incomplete`, and the reconciliation
 * check says so rather than any of this pretending otherwise.
 */
function orderSummaryOf(
  entry: Record<string, unknown>,
  path: string,
  issues: SnapshotIssue[],
): AmazonOrderSummary | null {
  // Re-reading our own serialized snapshot must give the same summary back, so an already
  // parsed `summary` object is accepted as-is.
  if (isRecord(entry.summary)) {
    const stored = asAmazonSummaryLines(entry.summary.lines);
    if (stored.length > 0) {
      return summariseAmazonOrder(
        stored,
        asAmazonSummarySource(entry.summary.source) ?? "printed",
      );
    }
  }
  const raw = entry.summaryLines;
  const pairs: { label: string; amount: string }[] = [];
  if (raw !== undefined) {
    if (!Array.isArray(raw)) {
      issues.push({
        path: `${path}.summaryLines`,
        message: "Summary must be an array.",
      });
    } else {
      for (const line of raw) {
        if (!isRecord(line)) continue;
        pairs.push({ label: asString(line.label), amount: asString(line.amount) });
      }
    }
  }
  const lines = parseAmazonSummaryLines(pairs);
  const historyTotal = moneyField(entry.total, `${path}.total`, issues);
  if (historyTotal !== null && !lines.some((line) => line.kind === "grandTotal")) {
    lines.push({ label: "Grand Total", amountCents: historyTotal, kind: "grandTotal" });
  }
  if (lines.length === 0) return null;
  const summary = summariseAmazonOrder(lines, "printed");
  if (
    historyTotal !== null &&
    summary.grandTotalCents !== null &&
    summary.grandTotalCents !== historyTotal
  ) {
    issues.push({
      path: `${path}.total`,
      message: `Order history printed ${historyTotal} but the order page printed ${summary.grandTotalCents}.`,
    });
  }
  return summary;
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
