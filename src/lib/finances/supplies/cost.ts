/**
 * What a recurring consumable costs per period.
 *
 * Everything here derives from **one cost-per-day**, which is the correction the worksheet
 * exists to make. The spreadsheet this replaces kept `Cost Biweekly`, `Cost Per Month` and
 * `Cost Per Year` as three independent columns and computed the year as `month × 12`; the
 * supplied rows do not reconcile with themselves — one shows $62.85/mo against a $55.21
 * biweekly, barely half of what doubling implies. Deriving every period from a daily rate
 * is what makes the four columns describe the same fact.
 *
 * Pure: no database, no React, no `Date`. See `cost.test.ts`.
 */

/** A Gregorian year, averaged over the leap cycle. */
export const DAYS_PER_YEAR = 365.25;
/** A month is a twelfth of that year — *not* 30, and not 4 weeks. */
export const DAYS_PER_MONTH = DAYS_PER_YEAR / 12;
/** A pay period. Lee is paid fortnightly, which is why this column exists at all. */
export const DAYS_PER_BIWEEK = 14;

/**
 * How fast an item is consumed, stated from whichever end you can actually estimate.
 *
 * Cat food is countable — four cans a day. Toothpaste is not: "0.022 tubes per day" is a
 * number nobody could have typed, but "a tube lasts about 45 days" is. They are the same
 * fact from opposite ends, and each is derivable from the other.
 *
 * Both live on the **item**, never on an offer, so changing pack size never means re-stating
 * how fast you go through the stuff. `daysPerUnitTenths` is days *one unit* lasts — a 3-pack
 * of 45-day tubes lasts 135 days, and that multiplication belongs to the price side.
 */
export type SupplyRate =
  | { basis: "units_per_day"; unitsPerDayMilli: number }
  | { basis: "days_per_unit"; daysPerUnitTenths: number };

/** One offer: what a purchase contains and what it costs. */
export type SupplyOffer = {
  /** Units in one purchase — 42 cans, 12 drinks, 1 tube. */
  qtyPerItem: number;
  costPerOrderCents: number;
};

export type SupplyTotals = {
  /** Fractional cents on purpose — see {@link costPerUnitCents}. */
  costPerUnitCents: number;
  unitsPerMonth: number;
  daysPerUnit: number;
  biweeklyCents: number;
  monthlyCents: number;
  yearlyCents: number;
};

/** Units consumed per day, whichever end the rate was stated from. */
export function unitsPerDay(rate: SupplyRate): number {
  if (rate.basis === "units_per_day") return rate.unitsPerDayMilli / 1000;
  const days = rate.daysPerUnitTenths / 10;
  return days > 0 ? 1 / days : 0;
}

/** Days one unit lasts — the other end of the same rate. */
export function daysPerUnit(rate: SupplyRate): number {
  if (rate.basis === "days_per_unit") return rate.daysPerUnitTenths / 10;
  const perDay = rate.unitsPerDayMilli / 1000;
  return perDay > 0 ? 1 / perDay : 0;
}

/**
 * What one unit costs, **unrounded**.
 *
 * $38.97 for 42 cans is $0.9279 a can. `src/lib/finances/money.ts` is explicit that a
 * rounded money value is only safe once, at the edge: store or total $0.93 forty-two times
 * and the column comes to $39.06 against a $38.97 receipt. So this is a display figure
 * carried at full precision into every period below, and it is never a database column.
 */
export function costPerUnitCents(offer: SupplyOffer): number {
  if (offer.qtyPerItem <= 0) return 0;
  return offer.costPerOrderCents / offer.qtyPerItem;
}

/** The single figure every period is derived from. */
export function costPerDayCents(rate: SupplyRate, offer: SupplyOffer): number {
  return unitsPerDay(rate) * costPerUnitCents(offer);
}

/**
 * Every period for one item at one price.
 *
 * Each period rounds **independently from the daily rate**, so `monthlyCents × 12` differs
 * from `yearlyCents` by a few cents. That is deliberate and is asserted in the tests: the
 * alternative — deriving the year from the rounded month — is exactly the drift the source
 * spreadsheet had, and it compounds to dollars over a year rather than pennies.
 */
export function supplyTotals(rate: SupplyRate, offer: SupplyOffer): SupplyTotals {
  const perDay = costPerDayCents(rate, offer);
  return {
    costPerUnitCents: costPerUnitCents(offer),
    unitsPerMonth: unitsPerDay(rate) * DAYS_PER_MONTH,
    daysPerUnit: daysPerUnit(rate),
    biweeklyCents: Math.round(perDay * DAYS_PER_BIWEEK),
    monthlyCents: Math.round(perDay * DAYS_PER_MONTH),
    yearlyCents: Math.round(perDay * DAYS_PER_YEAR),
  };
}

export type OfferComparison = {
  /** Negative means the candidate is cheaper per unit. */
  deltaPerUnitCents: number;
  /** Against the in-use unit cost. Zero when the in-use offer is free or unpriced. */
  deltaPercent: number;
  /** What switching would cost or save over a year at the item's own rate. */
  yearlyDeltaCents: number;
};

/**
 * A candidate offer against the one in use.
 *
 * Compared per *unit*, because pack size is the whole reason two offers are hard to read
 * side by side: $38.97 for 42 and $23.66 for 12 say nothing until both are cents per can.
 * The yearly figure takes the item's rate so the comparison lands in money you recognise
 * rather than in a tenth of a cent.
 */
export function offerComparison(
  inUse: SupplyOffer,
  candidate: SupplyOffer,
  rate: SupplyRate,
): OfferComparison {
  const base = costPerUnitCents(inUse);
  const deltaPerUnitCents = costPerUnitCents(candidate) - base;
  return {
    deltaPerUnitCents,
    deltaPercent: base > 0 ? (deltaPerUnitCents / base) * 100 : 0,
    yearlyDeltaCents: Math.round(deltaPerUnitCents * unitsPerDay(rate) * DAYS_PER_YEAR),
  };
}
