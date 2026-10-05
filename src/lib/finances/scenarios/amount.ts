import { annualCents, type Cadence } from "../recurringBills";

/**
 * Where a scenario line's amount comes from. A leaf has exactly one of these (or none, once
 * the supply item or group it followed is deleted); a roll-up has none and shows the sum of
 * its sub-lines instead. The `sources` check on `finance_scenario_lines` is this type's twin.
 */
export type LineAmountSource =
  | { type: "manual"; amountCents: number; cadence: Cadence }
  | { type: "supplyItem"; supplyItemId: string }
  | { type: "supplyGroup"; supplyGroupId: string }
  | { type: "none" };

/** The row columns a source is stored in. */
export type LineSourceColumns = {
  amountCents: number | null;
  cadenceUnit: "month" | "day" | null;
  cadenceN: number | null;
  supplyItemId: string | null;
  supplyGroupId: string | null;
};

export function lineSourceOf(columns: LineSourceColumns): LineAmountSource {
  if (columns.supplyItemId !== null) {
    return { type: "supplyItem", supplyItemId: columns.supplyItemId };
  }
  if (columns.supplyGroupId !== null) {
    return { type: "supplyGroup", supplyGroupId: columns.supplyGroupId };
  }
  if (
    columns.amountCents !== null &&
    columns.cadenceUnit &&
    columns.cadenceN !== null
  ) {
    return {
      type: "manual",
      amountCents: columns.amountCents,
      cadence: { unit: columns.cadenceUnit, n: columns.cadenceN },
    };
  }
  return { type: "none" };
}

export function sourceColumns(source: LineAmountSource): LineSourceColumns {
  switch (source.type) {
    case "manual":
      return {
        amountCents: source.amountCents,
        cadenceUnit: source.cadence.unit,
        cadenceN: source.cadence.n,
        supplyItemId: null,
        supplyGroupId: null,
      };
    case "supplyItem":
      return { ...NO_MANUAL, supplyItemId: source.supplyItemId, supplyGroupId: null };
    case "supplyGroup":
      return { ...NO_MANUAL, supplyItemId: null, supplyGroupId: source.supplyGroupId };
    case "none":
      return { ...NO_MANUAL, supplyItemId: null, supplyGroupId: null };
  }
}

const NO_MANUAL = { amountCents: null, cadenceUnit: null, cadenceN: null } as const;

/** The live monthly figures Supplies currently reports, by item id and by group id. */
export type SupplyAmounts = {
  itemMonthlyCents: ReadonlyMap<string, number>;
  groupMonthlyCents: ReadonlyMap<string, number>;
};

/** A monthly equivalent, rounded once: `annual ÷ 12`, the comparison the Bills page uses. */
export function manualMonthlyCents(amountCents: number, cadence: Cadence): number {
  return Math.round(annualCents(amountCents, cadence) / 12);
}

/**
 * A leaf's monthly cents. A manual line goes through the same `annualCents` bills use, so
 * "32.99 every week" is `× 365.25 ÷ 7 ÷ 12` and not `× 4`. A supply source that no longer
 * resolves (its item was deleted) reads as zero rather than throwing: the line still exists
 * and the page shows it empty.
 */
export function leafMonthlyCents(
  source: LineAmountSource,
  supply: SupplyAmounts,
): number {
  switch (source.type) {
    case "manual":
      return manualMonthlyCents(source.amountCents, source.cadence);
    case "supplyItem":
      return supply.itemMonthlyCents.get(source.supplyItemId) ?? 0;
    case "supplyGroup":
      return supply.groupMonthlyCents.get(source.supplyGroupId) ?? 0;
    case "none":
      return 0;
  }
}

/** Pay periods in a year, for the optional Pay period column. Lee is paid fortnightly. */
export const PAY_PERIODS_PER_YEAR = 26;

export type PeriodAmounts = {
  monthlyCents: number;
  payPeriodCents: number;
  yearlyCents: number;
};

/** The other two columns, derived from the monthly figure the worksheet is built on. */
export function periodAmounts(monthlyCents: number): PeriodAmounts {
  const yearlyCents = monthlyCents * 12;
  return {
    monthlyCents,
    payPeriodCents: Math.round(yearlyCents / PAY_PERIODS_PER_YEAR),
    yearlyCents,
  };
}
