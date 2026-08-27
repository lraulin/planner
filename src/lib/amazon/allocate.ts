/**
 * Allocate one Amazon charge across its linked order lines, then roll those lines up to
 * Bills. Remainder (tax, shipping, ordinary items) uses the same exact-cent allocator as
 * split children, so mixed charges always balance.
 *
 * **Tax and the subscription saving do not spread the same way.** Tax is charged on every
 * line, so it is proportional across all of them. The Subscribe & Save saving is earned by
 * the S&S lines alone, and smearing it over an unrelated item in a mixed order puts part of
 * a discount on something that never had it — on exactly the number a Bill exists to track.
 *
 * See `agent-os/specs/2026-08-27-1521-amazon-order-totals-register-link/`.
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

/** What Amazon printed as this order's subscription saving, signed as printed. */
export type OrderSavingRef = {
  amazonOrderId: string;
  subscriptionSavingCents: number;
};

/**
 * Spread `total` across `lines` in proportion to what each one cost.
 *
 * `distributeRemainder(total, weights)` returns `wᵢ + (total − Σw)·wᵢ/Σw`, which is exactly
 * `total·wᵢ/Σw` — the proportional share, allocated to the cent by the same largest-remainder
 * allocator split children use. Where nothing has a weight it falls back to an even split
 * rather than refusing, because an unbalanced allocation is a worse answer than an arbitrary
 * exact one.
 */
function shareProportionally(
  total: number,
  lines: readonly ReceiptLine[],
): Map<string, number> {
  const shares = new Map<string, number>();
  if (lines.length === 0 || total === 0) {
    for (const line of lines) shares.set(line.lineId, 0);
    return shares;
  }
  const weights = lines.map((line) => Math.abs(line.itemPaidCents ?? 0));
  const amounts = distributeRemainder(total, weights, "proportional");
  lines.forEach((line, index) => shares.set(line.lineId, amounts[index] ?? 0));
  return shares;
}

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
  /** Order summaries for the orders this charge covers. Omitted means no saving is known. */
  orderSavings?: readonly OrderSavingRef[];
}): ChargeAllocation {
  const amounts = allocateAmounts(input);

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
  const lines: LineAllocation[] = input.lines.map((line) => {
    const mapped = mapLine(line, byAsin, byId);
    const amountCents = amounts.get(line.lineId) ?? 0;
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

/**
 * Per-line amounts summing exactly to the charge.
 *
 * The charge is split into the subscription saving and everything else. `chargeCents` is
 * negative for a card charge and the printed saving is negative too, so the saving's share of
 * the charge is its opposite: −$23.66 charged, −$1.17 saved, and the rest (−$24.83) is the
 * subtotal plus tax. The two buckets are then allocated over different sets of lines and
 * added together.
 *
 * The saving is only separated for an outgoing charge with a mix of lines. For a refund, or
 * when every line or no line is Subscribe & Save, the split is a no-op and the plain
 * proportional allocation is both simpler and identical.
 */
function allocateAmounts(input: {
  chargeCents: number;
  lines: readonly ReceiptLine[];
  orderSavings?: readonly OrderSavingRef[];
}): Map<string, number> {
  const savingByOrder = new Map(
    (input.orderSavings ?? []).map((row) => [
      row.amazonOrderId,
      row.subscriptionSavingCents,
    ]),
  );
  const coveredOrders = new Set(input.lines.map((line) => line.amazonOrderId));
  let savingPrinted = 0;
  for (const orderId of coveredOrders) savingPrinted += savingByOrder.get(orderId) ?? 0;

  const snsLines = input.lines.filter((line) => line.subscribeAndSave);
  const separable =
    savingPrinted !== 0 &&
    input.chargeCents < 0 &&
    snsLines.length > 0 &&
    snsLines.length < input.lines.length;
  if (!separable) return shareProportionally(input.chargeCents, input.lines);

  const savingShare = -savingPrinted;
  const rest = input.chargeCents - savingShare;
  const restByLine = shareProportionally(rest, input.lines);
  const savingByLine = shareProportionally(savingShare, snsLines);
  const amounts = new Map<string, number>();
  for (const line of input.lines) {
    amounts.set(
      line.lineId,
      (restByLine.get(line.lineId) ?? 0) + (savingByLine.get(line.lineId) ?? 0),
    );
  }
  return amounts;
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
