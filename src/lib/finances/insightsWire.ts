/**
 * The Insights rows as they cross to the browser (`src/lib/rowTable.ts` says why and how).
 *
 * The page's components keep reading `EnvelopeReportRow` objects; only the transport
 * changes. `COLUMNS` is keyed by the row type, so a field added to `EnvelopeReportRow` that
 * is not listed here fails the typecheck instead of arriving as `undefined`.
 */

import { packRows, unpackRows, type RowTable } from "@/lib/rowTable";
import type { EnvelopeReportRow } from "./reports";

/** `derivedCategory` is a test-fixture stand-in that no loaded row carries. */
type WireRow = Required<Omit<EnvelopeReportRow, "derivedCategory">>;

const COLUMNS: { readonly [K in keyof WireRow]: true } = {
  id: true,
  accountId: true,
  accountName: true,
  accountKind: true,
  transactionDate: true,
  description: true,
  amountCents: true,
  sourceCategory: true,
  derivedFlow: true,
  flowOverride: true,
  transferGroupId: true,
  payeeId: true,
  payeeName: true,
  budgetCategoryName: true,
  budgetCategoryId: true,
  groupId: true,
  envelopeKind: true,
  incomeRole: true,
  accountOffBudget: true,
  contributesToBudget: true,
};

const KEYS = Object.keys(COLUMNS) as (keyof WireRow)[];

export type InsightsRowsWire = RowTable<keyof WireRow>;

export function packInsightsRows(rows: readonly EnvelopeReportRow[]): InsightsRowsWire {
  return packRows(
    // The type lets a fixture leave the envelope name off; on the wire, as everywhere it is
    // read, absent and null are both Uncategorized.
    rows.map((row) => ({ ...row, budgetCategoryName: row.budgetCategoryName ?? null })),
    KEYS,
  );
}

export function unpackInsightsRows(wire: InsightsRowsWire): EnvelopeReportRow[] {
  // The codec carries scalars and knows nothing of the unions they belong to; what it
  // returns is what `packInsightsRows` was handed (`insightsWire.test.ts`).
  return unpackRows(wire) as EnvelopeReportRow[];
}
