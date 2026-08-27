/**
 * Allocate one Amazon charge across its linked order lines, then roll those lines up to
 * Bills. Remainder (tax, shipping, ordinary items) uses the same exact-cent allocator as
 * split children, so mixed charges always balance.
 */

import { distributeRemainder } from "@/lib/finances/splitRemainder";

export type ReceiptLine = {
  lineId: string;
  amazonOrderId: string;
  asin: string;
  itemPaidCents: number | null;
  subscribeAndSave: boolean;
  subscriptionId: string | null;
};

export type LineAllocation = {
  lineId: string;
  amazonOrderId: string;
  asin: string;
  amazonSubscriptionId: string | null;
  billId: string | null;
  amountCents: number;
  kind: "subscription" | "remainder" | "unassigned";
};

export type ChargeAllocation = {
  lines: LineAllocation[];
  /** Recognised active subscription amounts, keyed by bill id. */
  byBill: Map<string, number>;
  remainderCents: number;
};

export type SubscriptionRef = {
  subscriptionId: string;
  asin: string;
  status: string;
  billId: string | null;
};

/**
 * Spread `chargeCents` across the linked lines in proportion to their item paid amounts,
 * then tag each line as a Bill, the ordinary remainder, or unassigned.
 *
 * Historical S&S lines map by ASIN only when exactly one active-or-known subscription fits.
 */
export function allocateCharge(input: {
  chargeCents: number;
  lines: readonly ReceiptLine[];
  subscriptions: readonly SubscriptionRef[];
}): ChargeAllocation {
  const weights = input.lines.map((line) => line.itemPaidCents ?? 0);
  const amounts =
    input.lines.length === 0
      ? []
      : distributeRemainder(input.chargeCents, weights, "proportional");

  const byAsin = new Map<string, SubscriptionRef[]>();
  for (const subscription of input.subscriptions) {
    if (!subscription.asin) continue;
    const list = byAsin.get(subscription.asin) ?? [];
    list.push(subscription);
    byAsin.set(subscription.asin, list);
  }

  const byId = new Map(
    input.subscriptions.map((subscription) => [
      subscription.subscriptionId,
      subscription,
    ]),
  );
  const lines: LineAllocation[] = input.lines.map((line, index) => {
    const mapped = mapLine(line, byAsin, byId);
    const amountCents = amounts[index] ?? 0;
    return {
      lineId: line.lineId,
      amazonOrderId: line.amazonOrderId,
      asin: line.asin,
      amazonSubscriptionId: mapped.amazonSubscriptionId,
      billId: mapped.billId,
      amountCents,
      kind: mapped.billId ? "subscription" : "remainder",
    };
  });

  if (input.lines.length === 0 && input.chargeCents !== 0) {
    lines.push({
      lineId: "remainder",
      amazonOrderId: "",
      asin: "",
      amazonSubscriptionId: null,
      billId: null,
      amountCents: input.chargeCents,
      kind: "unassigned",
    });
  }

  const byBill = new Map<string, number>();
  let remainderCents = 0;
  for (const line of lines) {
    if (line.billId) {
      byBill.set(line.billId, (byBill.get(line.billId) ?? 0) + line.amountCents);
    } else {
      remainderCents += line.amountCents;
    }
  }

  return { lines, byBill, remainderCents };
}

function mapLine(
  line: ReceiptLine,
  byAsin: Map<string, SubscriptionRef[]>,
  byId: Map<string, SubscriptionRef>,
): { amazonSubscriptionId: string | null; billId: string | null } {
  if (line.subscriptionId) {
    const known = byId.get(line.subscriptionId);
    return {
      amazonSubscriptionId: line.subscriptionId,
      billId: known?.billId ?? null,
    };
  }
  if (!line.asin) return { amazonSubscriptionId: null, billId: null };
  const matches = byAsin.get(line.asin) ?? [];
  if (matches.length === 1) {
    return {
      amazonSubscriptionId: matches[0].subscriptionId,
      billId: matches[0].billId,
    };
  }
  return { amazonSubscriptionId: null, billId: null };
}

/**
 * After bills have ids, stamp the allocation lines that pointed at a subscription.
 */
export function stampBillIds(
  allocation: ChargeAllocation,
  billBySubscription: ReadonlyMap<string, string>,
): ChargeAllocation {
  const lines = allocation.lines.map((line) => {
    if (line.billId || !line.amazonSubscriptionId) return line;
    const billId = billBySubscription.get(line.amazonSubscriptionId) ?? null;
    return billId ? { ...line, billId, kind: "subscription" as const } : line;
  });
  const byBill = new Map<string, number>();
  let remainderCents = 0;
  for (const line of lines) {
    if (line.billId) {
      byBill.set(line.billId, (byBill.get(line.billId) ?? 0) + line.amountCents);
    } else remainderCents += line.amountCents;
  }
  return { lines, byBill, remainderCents };
}

export function splitChildrenFromAllocation(
  allocation: ChargeAllocation,
  remainderCategoryId: string | null,
): { billId: string | null; amountCents: number }[] {
  const children: { billId: string | null; amountCents: number }[] = [];
  for (const [billId, amountCents] of allocation.byBill) {
    if (amountCents === 0) continue;
    children.push({ billId, amountCents });
  }
  if (allocation.remainderCents !== 0) {
    children.push({
      billId: remainderCategoryId,
      amountCents: allocation.remainderCents,
    });
  }
  return children;
}
