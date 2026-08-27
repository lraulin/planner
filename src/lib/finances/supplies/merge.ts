/**
 * Pure rules for folding supply items together.
 *
 * The write lives in `mutations.ts`. This file is only "target wins, carry in-use if the
 * target has none" and the discarded-field list the preview names so the user picks the
 * survivor whose rate they trust.
 */

import type { SupplyRate } from "./cost";
import { formatRate } from "./format";

export type SupplyMergeIdentity = {
  id: string;
  name: string;
  groupLabel: string;
  envelopeName: string | null;
  rateKey: string;
  rateLabel: string;
  optionCount: number;
  hasInUse: boolean;
};

export type SupplyMergeItem = {
  id: string;
  name: string;
  groupLabel: string;
  envelopeName: string | null;
  unitLabel: string;
  rateBasis: "units_per_day" | "days_per_unit";
  unitsPerDayMilli: number | null;
  daysPerUnitTenths: number | null;
  options: readonly { id: string; inUse: boolean }[];
};

export function supplyMergeIdentity(item: SupplyMergeItem): SupplyMergeIdentity {
  const rate: SupplyRate =
    item.rateBasis === "days_per_unit"
      ? { basis: "days_per_unit", daysPerUnitTenths: item.daysPerUnitTenths ?? 0 }
      : { basis: "units_per_day", unitsPerDayMilli: item.unitsPerDayMilli ?? 0 };
  return {
    id: item.id,
    name: item.name,
    groupLabel: item.groupLabel,
    envelopeName: item.envelopeName,
    rateKey:
      rate.basis === "units_per_day"
        ? `units_per_day:${rate.unitsPerDayMilli}`
        : `days_per_unit:${rate.daysPerUnitTenths}`,
    rateLabel: formatRate(rate, item.unitLabel),
    optionCount: item.options.length,
    hasInUse: item.options.some((option) => option.inUse),
  };
}

export type SupplyMergeDecision = {
  /** Option id to mark in use after reparent, or null when the target already has one. */
  promoteOptionId: string | null;
  discardedRates: string[];
  discardedGroups: string[];
  discardedEnvelopes: string[];
};

/**
 * What the preview should warn about, and which source in-use offer (if any) to keep.
 *
 * `sourceInUseOptionIds` is already in source-id order, one entry per source that had an
 * in-use offer, so the first one is "the first source's in-use offer".
 */
export function supplyMergeDecision(
  target: SupplyMergeIdentity,
  sources: readonly SupplyMergeIdentity[],
  sourceInUseOptionIds: readonly string[],
): SupplyMergeDecision {
  const discardedRates = unique(
    sources
      .filter((source) => source.rateKey !== target.rateKey)
      .map((source) => `${source.name}: ${source.rateLabel}`),
  );
  const discardedGroups = unique(
    sources
      .filter((source) => source.groupLabel !== target.groupLabel)
      .map((source) => source.groupLabel || "(ungrouped)"),
  );
  const discardedEnvelopes = unique(
    sources
      .filter((source) => source.envelopeName !== target.envelopeName)
      .map((source) => source.envelopeName ?? "(none)"),
  );

  return {
    promoteOptionId: target.hasInUse ? null : (sourceInUseOptionIds[0] ?? null),
    discardedRates,
    discardedGroups,
    discardedEnvelopes,
  };
}

/**
 * Specific product names live on the offer line (`brand`), not only on the item.
 *
 * Amazon create used to write the product title onto the item and leave brand empty, so a
 * merge that deleted the source item also deleted the only copy of "C4 24ct". An empty
 * brand takes the item name; a brand that is already set (Fancy Feast Grilled) is left
 * alone. The generic label — Energy Drink, Cat Food — is the group the user types.
 */
export function preservedOptionBrand(brand: string, itemName: string): string {
  return brand.trim() === "" ? itemName : brand;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
