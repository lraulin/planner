import {
  offerComparison,
  supplyTotals,
  type OfferComparison,
  type SupplyOffer,
  type SupplyRate,
  type SupplyTotals,
} from "./cost";
import type { SupplyItemRow, SupplyOptionRow } from "./queries";

/**
 * The worksheet as rows: an item, then its offers beneath it, grouped by label.
 *
 * Built here rather than in the view so the arithmetic that decides what a group costs — and
 * which offers are inert — is testable without mounting a grid.
 */

export type SupplyItemGridRow = {
  kind: "item";
  id: string;
  item: SupplyItemRow;
  rate: SupplyRate;
  /** Null until an offer is marked in use; the item then prices at nothing, honestly. */
  inUse: SupplyOptionRow | null;
  totals: SupplyTotals | null;
};

export type SupplyOptionGridRow = {
  kind: "option";
  id: string;
  item: SupplyItemRow;
  rate: SupplyRate;
  option: SupplyOptionRow;
  /** What this item would cost at *this* offer — the point of a comparison row. */
  totals: SupplyTotals;
  /** Null on the in-use row itself, which is what everything else is compared to. */
  comparison: OfferComparison | null;
};

export type SupplyGridRow = SupplyItemGridRow | SupplyOptionGridRow;

export type SupplyPeriodTotals = {
  biweeklyCents: number;
  monthlyCents: number;
  yearlyCents: number;
};

export type SupplyGroup = {
  label: string;
  items: SupplyItemGridRow[];
  totals: SupplyPeriodTotals;
  /** The envelope every item in the group is funded from, when they agree on one. */
  envelopeName: string | null;
  envelopeBudgetedCents: number | null;
};

const ZERO: SupplyPeriodTotals = { biweeklyCents: 0, monthlyCents: 0, yearlyCents: 0 };

/**
 * Item roots of a grid selection: an offer row counts as its parent, and two offers under
 * the same item count once. Selection order is preserved so the first-clicked item is the
 * merge dialog's default survivor.
 */
export function itemIdsOfSelection(
  selectedIds: ReadonlySet<string>,
  items: readonly SupplyItemRow[],
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const id of selectedIds) {
    const itemId = items.some((item) => item.id === id)
      ? id
      : (items.find((item) => item.options.some((option) => option.id === id))?.id ??
        null);
    if (itemId && !seen.has(itemId)) {
      seen.add(itemId);
      ids.push(itemId);
    }
  }
  return ids;
}

/** The two rate columns as the discriminated value the cost math takes. */
export function rateOf(item: SupplyItemRow): SupplyRate {
  return item.rateBasis === "days_per_unit"
    ? { basis: "days_per_unit", daysPerUnitTenths: item.daysPerUnitTenths ?? 0 }
    : { basis: "units_per_day", unitsPerDayMilli: item.unitsPerDayMilli ?? 0 };
}

function offerOf(option: SupplyOptionRow): SupplyOffer {
  return {
    qtyPerItem: option.qtyPerItem,
    costPerOrderCents: option.costPerOrderCents,
  };
}

/** One item and its offers, flattened. Offers never contribute to a total. */
export function supplyItemRows(item: SupplyItemRow): SupplyGridRow[] {
  const rate = rateOf(item);
  const inUse = item.options.find((option) => option.inUse) ?? null;
  const head: SupplyItemGridRow = {
    kind: "item",
    id: item.id,
    item,
    rate,
    inUse,
    totals: inUse ? supplyTotals(rate, offerOf(inUse)) : null,
  };

  const options = item.options.map<SupplyOptionGridRow>((option) => ({
    kind: "option",
    id: option.id,
    item,
    rate,
    option,
    totals: supplyTotals(rate, offerOf(option)),
    comparison:
      inUse && option.id !== inUse.id
        ? offerComparison(offerOf(inUse), offerOf(option), rate)
        : null,
  }));

  return [head, ...options];
}

function addTotals(
  running: SupplyPeriodTotals,
  totals: SupplyTotals | null,
): SupplyPeriodTotals {
  if (!totals) return running;
  return {
    biweeklyCents: running.biweeklyCents + totals.biweeklyCents,
    monthlyCents: running.monthlyCents + totals.monthlyCents,
    yearlyCents: running.yearlyCents + totals.yearlyCents,
  };
}

/**
 * Items grouped by label, each group subtotalled.
 *
 * Subtotals are the **sum of the displayed row values**, not a re-derivation from the daily
 * rates, so the column on screen visibly adds up to its own footer. That is worth a cent of
 * imprecision; a total that disagrees with the rows above it is not a total anyone trusts.
 *
 * A group reports an envelope only when every item in it names the same one. Mixed funding is
 * the interesting case — it is what the page exists to reveal — and printing one of the two
 * would misreport it as settled.
 */
export function supplyGroups(items: readonly SupplyItemRow[]): SupplyGroup[] {
  const byLabel = new Map<string, SupplyItemGridRow[]>();
  for (const item of items) {
    const [head] = supplyItemRows(item) as [SupplyItemGridRow];
    const list = byLabel.get(item.groupLabel) ?? [];
    list.push(head);
    byLabel.set(item.groupLabel, list);
  }

  return [...byLabel.entries()]
    .sort(([a], [b]) => {
      // Ungrouped last: a blank header at the top would read as the page failing to load.
      if (a === "") return 1;
      if (b === "") return -1;
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
    })
    .map(([label, rows]) => {
      const envelopeIds = new Set(rows.map((row) => row.item.envelopeId));
      const shared = envelopeIds.size === 1 ? rows[0].item : null;
      return {
        label,
        items: rows,
        totals: rows.reduce((running, row) => addTotals(running, row.totals), ZERO),
        envelopeName: shared?.envelopeName ?? null,
        envelopeBudgetedCents: shared?.envelopeId ? shared.envelopeBudgetedCents : null,
      };
    });
}

/**
 * Period totals over an arbitrary set of grid rows — the group's own rows, or every row a
 * filter left standing.
 *
 * Offer rows are skipped, not because they have no figures but because theirs are what the
 * item *would* cost on that offer. Only the in-use offer is money the worksheet is
 * spending, and that is what the item head already carries; adding the alternatives would
 * bill the user once per vendor they considered.
 */
export function supplyRowTotals(rows: readonly SupplyGridRow[]): SupplyPeriodTotals {
  return rows.reduce(
    (running, row) => (row.kind === "item" ? addTotals(running, row.totals) : running),
    ZERO,
  );
}
