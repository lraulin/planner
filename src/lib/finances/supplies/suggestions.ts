import { daysBetweenKeys } from "@/lib/schedule/geometry";
import type { SupplyRateBasis } from "@/db/schema";
import { parsePackCount } from "./packSize";
import type { AmazonRepeatPurchase } from "./queries";

/**
 * Amazon order history turned into worksheet rows you are expected to correct.
 *
 * A **prefill, never a sync** (spec D6). Nothing here auto-creates an item, and a later
 * import never revises a row you accepted: the inferred rate is
 * `totalUnits ÷ observedSpanDays`, which assumes you consumed everything you bought at a
 * steady pace between the first order and the last. That is a good first guess and a bad
 * fact, so it lands in an editable field with the evidence beside it — how many orders, over
 * what span — rather than in a total.
 *
 * Pure: takes rows, returns prefills. See `suggestions.test.ts`.
 */

export type SupplySuggestion = {
  asin: string;
  name: string;
  orderCount: number;
  firstOrderDate: string;
  lastOrderDate: string;
  spanDays: number;
  subscribeAndSave: boolean;
  /** Null when the title never stated a pack size — see `parsePackCount`. */
  packCount: number | null;
  /** Units in one purchase, defaulting to 1 when the title did not say. */
  qtyPerItem: number;
  costPerOrderCents: number;
  rateBasis: SupplyRateBasis;
  unitsPerDayMilli: number | null;
  daysPerUnitTenths: number | null;
};

/**
 * Shape repeat purchases into prefills, dropping the ones nothing can be inferred from.
 *
 * A row is skipped when its span is zero — several orders on one day say what you bought and
 * nothing about how fast you go through it — and when an ASIN is already on the worksheet, so
 * re-running the dialog offers what is missing rather than duplicating what is there.
 */
export function supplySuggestions(
  purchases: readonly AmazonRepeatPurchase[],
  options: { knownAsins?: ReadonlySet<string> } = {},
): SupplySuggestion[] {
  const known = options.knownAsins ?? new Set<string>();
  const suggestions: SupplySuggestion[] = [];

  for (const purchase of purchases) {
    if (known.has(purchase.asin)) continue;
    const spanDays = daysBetweenKeys(purchase.firstOrderDate, purchase.lastOrderDate);
    if (spanDays <= 0) continue;
    if (purchase.totalQuantity <= 0) continue;

    const packCount = parsePackCount(purchase.productName);
    const qtyPerItem = packCount ?? 1;
    const rate = inferRate(purchase.totalQuantity, packCount, spanDays);

    suggestions.push({
      asin: purchase.asin,
      name: purchase.productName,
      orderCount: purchase.orderCount,
      firstOrderDate: purchase.firstOrderDate,
      lastOrderDate: purchase.lastOrderDate,
      spanDays,
      subscribeAndSave: purchase.subscribeAndSave,
      packCount,
      qtyPerItem,
      costPerOrderCents:
        purchase.latestUnitPriceCents === null
          ? 0
          : Math.round(purchase.latestUnitPriceCents),
      ...rate,
    });
  }

  return suggestions;
}

/**
 * Which end to state the rate from, decided by whether the pack size is known.
 *
 * With a pack size the units are countable, so `units_per_day` is the honest basis. Without
 * one all that can be said is how long a purchase lasted, and calling that "units per day"
 * would state a rate per *unknown thing* — so it falls back to `days_per_unit`, which reads
 * as "one of these lasts about N days" and is exactly what the user will correct.
 */
function inferRate(
  totalQuantity: number,
  packCount: number | null,
  spanDays: number,
): Pick<SupplySuggestion, "rateBasis" | "unitsPerDayMilli" | "daysPerUnitTenths"> {
  if (packCount !== null) {
    const perDay = (totalQuantity * packCount) / spanDays;
    const milli = Math.max(1, Math.round(perDay * 1000));
    return {
      rateBasis: "units_per_day",
      unitsPerDayMilli: milli,
      daysPerUnitTenths: null,
    };
  }
  const tenths = Math.max(1, Math.round((spanDays / totalQuantity) * 10));
  return {
    rateBasis: "days_per_unit",
    unitsPerDayMilli: null,
    daysPerUnitTenths: tenths,
  };
}
