"use client";

import { useEffect, useMemo, useRef } from "react";

import type { Command } from "@/lib/commands/registry";
import { useRegisterCommands } from "@/components/shell/CommandProvider";
import { useDateFormatter } from "@/components/settings/SettingsProvider";
import { downloadTextFile } from "@/components/grid/downloadCsv";
import {
  exportFilename,
  exportMimeType,
  FORMAT_EXTENSION,
  gridCopyCommands,
  gridExportCommands,
  gridExportFormatOf,
} from "@/lib/grid/exportCsv";
import { writeClipboardText } from "@/lib/tree/copyAsText";
import { monthKeyOf, type BudgetMonth } from "@/lib/finances/budget/envelope";
import {
  budgetExportDocument,
  gridExportSection,
  serializeBudgetExport,
  totalsCaption,
  type BudgetExportDocument,
} from "@/lib/finances/budget/export";
import type { BudgetData } from "@/lib/finances/budget/queries";
import type { BudgetRow, BudgetTotals } from "@/lib/finances/budget/rows";
import type { BudgetTables } from "./useBudgetTables";

/**
 * The whole page as one document (`agent-os/specs/2026-08-28-0759-budget-single-export/`).
 *
 * Registered here rather than by the three `DataGrid`s, which pass `exportCommands={false}`:
 * a budget whose parts sum to one figure should not export as three files that do not.
 * Each table contributes the columns it is actually showing, so hiding Assigned on Bills
 * still drops it from that section and only that one.
 */
export function useBudgetExport({
  data,
  month,
  tables,
  income,
  receivedCents,
  expectedIncomeCents,
  totals,
}: {
  data: Pick<BudgetData, "month" | "todayKey" | "accountPoolCents">;
  month: BudgetMonth | null;
  tables: BudgetTables;
  income: readonly BudgetRow[];
  receivedCents: number;
  expectedIncomeCents: number | null;
  totals: Record<"spending" | "envelopes" | "bills" | "savings", BudgetTotals>;
}) {
  // The export writes dates the way the rest of the app does, not a second format.
  const formatDate = useDateFormatter();
  const envelopeColumns = tables.envelopes.grid.columns;
  const billColumns = tables.bills.grid.columns;
  const savingsColumns = tables.savings.grid.columns;
  const envelopeGridRows = tables.envelopes.rows;
  const billGridRows = tables.bills.rows;
  const savingsGridRows = tables.savings.rows;

  const exportDocument = useMemo((): BudgetExportDocument | null => {
    if (!month) return null;
    return budgetExportDocument({
      month,
      accountPoolCents:
        data.month === monthKeyOf(data.todayKey) ? data.accountPoolCents : undefined,
      income,
      receivedCents,
      expectedIncomeCents,
      spendingTotals: totals.spending,
      tables: [
        gridExportSection(
          "Regular spending",
          totalsCaption(totals.envelopes),
          envelopeColumns,
          envelopeGridRows.filter((row) => row.kind === "node"),
        ),
        gridExportSection(
          "Bills",
          totalsCaption(totals.bills),
          billColumns,
          billGridRows.filter((row) => row.kind === "node"),
        ),
        gridExportSection(
          "Savings",
          totalsCaption(totals.savings),
          savingsColumns,
          savingsGridRows.filter((row) => row.kind === "node"),
        ),
      ],
      formatDate,
    });
  }, [
    month,
    data.month,
    data.todayKey,
    data.accountPoolCents,
    income,
    receivedCents,
    expectedIncomeCents,
    totals,
    envelopeColumns,
    billColumns,
    savingsColumns,
    envelopeGridRows,
    billGridRows,
    savingsGridRows,
    formatDate,
  ]);

  /**
   * Identity-stable, with the document read from a ref at run time.
   *
   * Putting the document in this memo's deps re-registers on every render that rebuilds it
   * and trips `useRegisterCommands`' churn guard — the same trap `DataGrid` avoids the same
   * way (`2026-08-14-1021-grid-export-formats` D7).
   */
  const exportRef = useRef(exportDocument);
  useEffect(() => {
    exportRef.current = exportDocument;
  });
  const exportCommands = useMemo((): Command[] => {
    const write = (format: ReturnType<typeof gridExportFormatOf>, toFile: boolean) => {
      const doc = exportRef.current;
      if (!doc || !format) return;
      const exportedAt = new Date();
      const text = serializeBudgetExport(format, doc, exportedAt);
      if (!toFile) {
        void writeClipboardText(text);
        return;
      }
      downloadTextFile(
        exportFilename(doc.title, FORMAT_EXTENSION[format], exportedAt),
        text,
        exportMimeType(format),
      );
    };
    const downloads = gridExportCommands(() => {}).map((command) => {
      const format = gridExportFormatOf(command.id);
      return {
        ...command,
        run: () => write(format, true),
        alternate: {
          label: command.alternate?.label ?? "",
          title: command.alternate?.title,
          run: () => write(format, false),
        },
      };
    });
    const copies = gridCopyCommands(() => {}).map((command) => ({
      ...command,
      run: () => write(gridExportFormatOf(command.id), false),
    }));
    return [...downloads, ...copies];
  }, []);
  useRegisterCommands(exportCommands);
}
