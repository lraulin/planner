import {
  parseDigitalItems,
  parseDigitalReturns,
  parseRefunds,
  parseReplacements,
  parseRetailItems,
  parseReturns,
} from "./parse";
import {
  SLIM_CSV_FILES,
  SLIM_SOURCE,
  SLIM_VERSION,
  type SlimAmazonOrders,
  type SlimCsvKind,
  type SlimItem,
  type SlimOrder,
} from "./types";

export type SlimTexts = Partial<Record<SlimCsvKind, string>>;

export type SlimBuildResult = {
  document: SlimAmazonOrders;
  warnings: string[];
};

function ordersFromItems(items: SlimItem[]): SlimOrder[] {
  const seen = new Map<string, SlimOrder>();
  for (const item of items) {
    if (seen.has(item.amazonOrderId)) continue;
    seen.set(item.amazonOrderId, {
      amazonOrderId: item.amazonOrderId,
      channel: item.channel,
      orderDate: item.orderDate,
      orderStatus: item.orderStatus,
      paymentMethod: item.paymentMethod,
      paymentLast4: item.paymentLast4,
      website: item.website,
      currency: item.currency,
    });
  }
  return [...seen.values()];
}

/** Build the version-1 slim document from the named CSV texts. Missing files are skipped. */
export function buildSlimFromTexts(
  texts: SlimTexts,
  generatedAt = new Date().toISOString(),
): SlimBuildResult {
  const warnings: string[] = [];
  const items: SlimItem[] = [];

  if (texts.retail) {
    const parsed = parseRetailItems(texts.retail);
    if (parsed.error) warnings.push(parsed.error);
    items.push(...parsed.items);
    for (const err of parsed.errors) {
      warnings.push(`Order History.csv row ${err.row}: ${err.message}`);
    }
  } else {
    warnings.push(`Missing ${SLIM_CSV_FILES.retail}.`);
  }

  if (texts.digital) {
    const parsed = parseDigitalItems(texts.digital);
    if (parsed.error) warnings.push(parsed.error);
    items.push(...parsed.items);
    for (const err of parsed.errors) {
      warnings.push(`Digital Content Orders.csv row ${err.row}: ${err.message}`);
    }
  }

  const refunds = [];
  if (texts.refunds) {
    const parsed = parseRefunds(texts.refunds);
    if (parsed.error) warnings.push(parsed.error);
    refunds.push(...parsed.refunds);
  }
  if (texts.digitalReturns) {
    const parsed = parseDigitalReturns(texts.digitalReturns);
    if (parsed.error) warnings.push(parsed.error);
    refunds.push(...parsed.refunds);
  }

  const returns = [];
  if (texts.returns) {
    const parsed = parseReturns(texts.returns);
    if (parsed.error) warnings.push(parsed.error);
    returns.push(...parsed.returns);
  }

  const replacements = [];
  if (texts.replacements) {
    const parsed = parseReplacements(texts.replacements);
    if (parsed.error) warnings.push(parsed.error);
    replacements.push(...parsed.replacements);
  }

  const document: SlimAmazonOrders = {
    version: SLIM_VERSION,
    source: SLIM_SOURCE,
    generatedAt,
    orders: ordersFromItems(items),
    items,
    refunds,
    returns,
    replacements,
  };
  return { document, warnings };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Accept only a version-1 slim file. The app never parses the zip.
 */
/**
 * The ingest artifact is compact JSON. Pretty-printing this dump is ~4.9 MB, which
 * Vercel Functions reject (4.5 MB request body) before our route runs.
 */
export function serializeSlim(document: SlimAmazonOrders): string {
  return JSON.stringify(document);
}

export function parseSlimJson(
  text: string,
): { ok: true; data: SlimAmazonOrders } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file is not valid JSON." };
  }
  if (!isRecord(raw)) {
    return { ok: false, error: "That file is not an Amazon orders slim document." };
  }
  if (raw.version !== SLIM_VERSION || raw.source !== SLIM_SOURCE) {
    return {
      ok: false,
      error:
        "Not an Amazon orders slim file (expected version 1, source amazon-data-request).",
    };
  }
  if (!Array.isArray(raw.items) || !Array.isArray(raw.orders)) {
    return { ok: false, error: "Slim file is missing orders or items." };
  }
  return { ok: true, data: raw as SlimAmazonOrders };
}
