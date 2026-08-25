/**
 * File ▸ Export / Copy targeting for the three Budget tables.
 *
 * Command ids are unique across the merged catalog. Three DataGrids all publishing
 * `grid.export-csv` is last-wins, which silently exports only the grid that mounted
 * last (Savings). Each table gets a `CommandScope`; exactly one also keeps the
 * unscoped CSV / JSON / YAML rows — the focused shortcut in `navigation.md`.
 */

import type { CommandScope } from "@/lib/commands/scope";

export const BUDGET_TABLE_SCOPES = {
  envelopes: { id: "envelopes", label: "Regular spending" },
  bills: { id: "bills", label: "Bills" },
  savings: { id: "savings", label: "Savings" },
} as const satisfies Record<string, CommandScope>;

export type BudgetTableId = keyof typeof BUDGET_TABLE_SCOPES;

export const BUDGET_TABLE_IDS = ["envelopes", "bills", "savings"] as const;

export type BudgetGridExportPlan = Record<
  BudgetTableId,
  { commandScope: CommandScope; exportFocused: boolean }
>;

/** Props each Budget DataGrid must pass so File ▸ Export cannot last-wins Savings. */
export function budgetGridExportPlan(focused: BudgetTableId): BudgetGridExportPlan {
  return {
    envelopes: {
      commandScope: BUDGET_TABLE_SCOPES.envelopes,
      exportFocused: focused === "envelopes",
    },
    bills: {
      commandScope: BUDGET_TABLE_SCOPES.bills,
      exportFocused: focused === "bills",
    },
    savings: {
      commandScope: BUDGET_TABLE_SCOPES.savings,
      exportFocused: focused === "savings",
    },
  };
}
