import { describe, expect, it } from "vitest";

import { commandOrder } from "@/lib/commands/menus";
import { scopeCommand, scopedFormatLabel } from "@/lib/commands/scope";
import { gridCopyCommands, gridExportCommands } from "@/lib/grid/exportCsv";

import {
  BUDGET_TABLE_IDS,
  BUDGET_TABLE_SCOPES,
  budgetGridExportPlan,
  type BudgetTableId,
} from "./gridScopes";

/**
 * What the three Budget DataGrids publish, in mount order, after `commandOrder`
 * last-wins. Mirrors `DataGrid`'s `scopedExportCommands` so a missing `commandScope`
 * or a second `exportFocused` shows up as a missing id rather than a green test.
 */
function catalogFor(focused: BudgetTableId) {
  const plan = budgetGridExportPlan(focused);
  const commands = BUDGET_TABLE_IDS.flatMap((table) => {
    const { commandScope, exportFocused } = plan[table];
    const base = [...gridExportCommands(() => {}), ...gridCopyCommands(() => {})];
    const scoped = base.map((command) =>
      scopeCommand(
        command,
        commandScope,
        scopedFormatLabel(command.label, commandScope),
      ),
    );
    return exportFocused ? [...base, ...scoped] : scoped;
  });
  return commandOrder(commands);
}

describe("budgetGridExportPlan", () => {
  it("gives each table a unique scope so last-wins cannot steal another grid", () => {
    const plan = budgetGridExportPlan("envelopes");
    const ids = BUDGET_TABLE_IDS.map((table) => plan[table].commandScope.id);
    expect(ids).toEqual(["envelopes", "bills", "savings"]);
    expect(new Set(ids).size).toBe(3);
    expect(plan.envelopes.commandScope.label).toBe("Regular spending");
    expect(BUDGET_TABLE_SCOPES.bills.label).toBe("Bills");
    expect(BUDGET_TABLE_SCOPES.savings.label).toBe("Savings");
  });

  it("keeps the unscoped File ▸ Export rows on the focused table, not last-mounted Savings", () => {
    // Default / top table. Three unscoped `grid.export-csv` would collapse to
    // Savings — the bug this helper exists to make unrepresentable.
    const envelopes = catalogFor("envelopes");
    expect(
      envelopes
        .map((command) => command.id)
        .filter((id) => id.startsWith("grid.export-csv")),
    ).toEqual([
      "grid.export-csv",
      "grid.export-csv.envelopes",
      "grid.export-csv.bills",
      "grid.export-csv.savings",
    ]);
    expect(envelopes.find((command) => command.id === "grid.export-csv")?.label).toBe(
      "CSV",
    );
    expect(
      envelopes.find((command) => command.id === "grid.export-csv.savings")?.label,
    ).toBe("CSV — Savings");

    const bills = catalogFor("bills");
    const focused = budgetGridExportPlan("bills");
    expect(BUDGET_TABLE_IDS.filter((table) => focused[table].exportFocused)).toEqual([
      "bills",
    ]);
    expect(bills.some((command) => command.id === "grid.copy-json")).toBe(true);
    expect(bills.some((command) => command.id === "grid.copy-json.envelopes")).toBe(
      true,
    );

    expect(
      BUDGET_TABLE_IDS.filter(
        (table) => budgetGridExportPlan("savings")[table].exportFocused,
      ),
    ).toEqual(["savings"]);
  });
});
