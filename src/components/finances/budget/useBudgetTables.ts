"use client";

import { useEffect, useMemo, useState } from "react";

import { useGridState } from "@/components/grid/useGridState";
import { useMultiSelect } from "@/components/grid/useMultiSelect";
import { useNavigableIds } from "@/components/grid/useNavigableIds";
import type { BudgetGroupRow } from "@/lib/finances/budget/queries";
import type { budgetReturnContext } from "@/lib/finances/budget/returnContext";
import {
  sectionGridRows,
  type budgetSections,
  type BudgetRow,
} from "@/lib/finances/budget/rows";
import { billColumns, envelopeColumns } from "./budgetColumns";

/**
 * Which table last had the focus ring. Selection and the inspector read it; export no
 * longer does — the page exports one document, so there is nothing left to disambiguate.
 */
export type BudgetTable = "envelopes" | "bills" | "savings";

type ReturnContext = ReturnType<typeof budgetReturnContext>;

/**
 * The three tables' layout, rows, selection and focus — Regular spending, Bills, Savings —
 * and the inspector that shows whichever row is selected in the focused one.
 */
export function useBudgetTables({
  groups,
  rows,
  sections,
  returnContext,
}: {
  groups: readonly BudgetGroupRow[];
  rows: readonly BudgetRow[];
  sections: ReturnType<typeof budgetSections>;
  returnContext: ReturnContext;
}) {
  const [inspecting, setInspecting] = useState(Boolean(returnContext));
  const [focusedTable, setFocusedTable] = useState<BudgetTable>(
    returnContext?.table ?? "envelopes",
  );

  // One saved layout per table. Keys stay distinct so a width tweak on Bills does not
  // rewrite Regular spending. Unknown persisted ids (the old cadence columns) are dropped
  // by `useGridState`.
  const billGrid = useGridState("budget-bills", billColumns, {
    order: billColumns.map((column) => column.id),
    switches: { "show-hidden": false },
  });
  const envelopeGrid = useGridState("budget-envelopes", envelopeColumns, {
    order: envelopeColumns.map((column) => column.id),
    switches: { "show-hidden": false },
  });
  const savingsGrid = useGridState("budget-savings", envelopeColumns, {
    order: envelopeColumns.map((column) => column.id),
    switches: { "show-hidden": false },
  });
  const showHidden =
    (billGrid.switches["show-hidden"] ?? false) ||
    (envelopeGrid.switches["show-hidden"] ?? false) ||
    (savingsGrid.switches["show-hidden"] ?? false);

  function setShowHidden(next: boolean) {
    billGrid.setSwitch("show-hidden", next);
    envelopeGrid.setSwitch("show-hidden", next);
    savingsGrid.setSwitch("show-hidden", next);
  }

  const revealIds = useMemo(
    () =>
      returnContext
        ? new Set([returnContext.id, ...returnContext.ancestors])
        : new Set<string>(),
    [returnContext],
  );
  const billGridRows = useMemo(
    () => sectionGridRows(groups, "bill", sections.bills, { showHidden, revealIds }),
    [groups, sections.bills, showHidden, revealIds],
  );
  const envelopeGridRows = useMemo(
    () =>
      sectionGridRows(groups, "spending", sections.envelopes, {
        showHidden,
        revealIds,
      }),
    [groups, sections.envelopes, showHidden, revealIds],
  );
  const savingsGridRows = useMemo(
    () =>
      sectionGridRows(groups, "savings", sections.savings, {
        showHidden,
        revealIds,
      }),
    [groups, sections.savings, showHidden, revealIds],
  );
  const billRowIds = useMemo(() => billGridRows.map((row) => row.id), [billGridRows]);
  const envelopeRowIds = useMemo(
    () => envelopeGridRows.map((row) => row.id),
    [envelopeGridRows],
  );
  const savingsRowIds = useMemo(
    () => savingsGridRows.map((row) => row.id),
    [savingsGridRows],
  );
  // Each grid narrows its own rows by collapsing groups, so the list the arrows walk and the
  // selection is pruned against has to come back *from* the grid — `useNavigableIds`. The
  // row ids built above are only the first-render fallback. Selecting against the input list
  // let a collapsed group keep its envelopes selected, and Assign scopes to the selection.
  const billNav = useNavigableIds(billRowIds);
  const envelopeNav = useNavigableIds(envelopeRowIds);
  const savingsNav = useNavigableIds(savingsRowIds);
  const billSelect = useMultiSelect(
    billNav.order,
    returnContext?.table === "bills" ? returnContext.id : null,
    { allowEmpty: true },
  );
  const envelopeSelect = useMultiSelect(
    envelopeNav.order,
    returnContext?.table === "envelopes" ? returnContext.id : null,
    { allowEmpty: true },
  );
  const savingsSelect = useMultiSelect(
    savingsNav.order,
    returnContext?.table === "savings" ? returnContext.id : null,
    { allowEmpty: true },
  );

  const [seenReturnId, setSeenReturnId] = useState(returnContext?.id ?? null);
  if ((returnContext?.id ?? null) !== seenReturnId) {
    setSeenReturnId(returnContext?.id ?? null);
    if (returnContext) {
      setFocusedTable(returnContext.table);
      setInspecting(true);
      (returnContext.table === "bills"
        ? billSelect
        : returnContext.table === "savings"
          ? savingsSelect
          : envelopeSelect
      ).select(returnContext.id);
    }
  }

  const selectedRow = useMemo(() => {
    const id =
      focusedTable === "bills"
        ? billSelect.selectedId
        : focusedTable === "envelopes"
          ? envelopeSelect.selectedId
          : savingsSelect.selectedId;
    if (!id) return null;
    return rows.find((row) => row.id === id) ?? null;
  }, [
    focusedTable,
    billSelect.selectedId,
    envelopeSelect.selectedId,
    savingsSelect.selectedId,
    rows,
  ]);

  return {
    inspecting,
    setInspecting,
    focusedTable,
    setFocusedTable,
    showHidden,
    setShowHidden,
    bills: { grid: billGrid, rows: billGridRows, nav: billNav, select: billSelect },
    envelopes: {
      grid: envelopeGrid,
      rows: envelopeGridRows,
      nav: envelopeNav,
      select: envelopeSelect,
    },
    savings: {
      grid: savingsGrid,
      rows: savingsGridRows,
      nav: savingsNav,
      select: savingsSelect,
    },
    selectedRow,
  };
}

export type BudgetTables = ReturnType<typeof useBudgetTables>;

/**
 * Enter opens the inspector on a phone; Escape clears every table's selection — unless a
 * dialog, a menu or the inspector is open, which own Escape for themselves.
 */
export function useBudgetKeys(
  tables: BudgetTables,
  { compact, overlayOpen }: { compact: boolean; overlayOpen: boolean },
) {
  const { inspecting, setInspecting, selectedRow } = tables;
  const billSelect = tables.bills.select;
  const envelopeSelect = tables.envelopes.select;
  const savingsSelect = tables.savings.select;
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Enter" && compact && selectedRow) {
        if ((event.target as HTMLElement).closest("input, select, textarea, button")) {
          return;
        }
        event.preventDefault();
        setInspecting(true);
        return;
      }
      if (event.key !== "Escape") return;
      if (overlayOpen || inspecting) return;
      billSelect.selectOne(null);
      envelopeSelect.selectOne(null);
      savingsSelect.selectOne(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    overlayOpen,
    inspecting,
    setInspecting,
    compact,
    selectedRow,
    billSelect,
    envelopeSelect,
    savingsSelect,
  ]);
}
