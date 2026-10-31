"use client";

import type { ReactNode } from "react";

import type { MenuItem } from "@/components/grid/ContextMenu";
import type { ColumnDef } from "@/components/grid/columns";
import type { useGridState } from "@/components/grid/useGridState";
import { DataGrid } from "@/components/grid/DataGrid";
import type { EnvelopeKind } from "@/db/schema";
import { monthLabel } from "@/lib/finances/budget/envelope";
import type { monthlyFundingPlan } from "@/lib/finances/budget/incomePlan";
import type { BudgetCategoryRow, BudgetGroupRow } from "@/lib/finances/budget/queries";
import { revealBudgetGroups } from "@/lib/finances/budget/returnContext";
import {
  groupSectionTotals,
  type budgetSections,
  type BudgetRow,
  type BudgetTotals,
} from "@/lib/finances/budget/rows";
import { formatUsd } from "@/lib/finances/money";
import type { GridRow } from "@/lib/tree/slice";
import { BudgetSection } from "./BudgetSection";
import { billColumns, envelopeColumns, type BudgetColumnCtx } from "./budgetColumns";
import { FundingPlanSummary } from "./IncomeSection";
import { GroupChrome, SectionComposer } from "./StructureChrome";
import type { BudgetStructure, OpenMenu } from "./useBudgetStructure";
import type { BudgetTable, BudgetTables as Tables } from "./useBudgetTables";

/**
 * Spending — Regular above Bills, under one combined total — then the funding plan, then
 * Savings, held out of that total.
 */
export function BudgetTables({
  tables,
  sections,
  totals,
  ctx,
  rowMenu,
  structure,
  groups,
  categories,
  monthKey,
  revealAncestors,
  fundingPlan,
  pending,
  openMenu,
}: {
  tables: Tables;
  sections: ReturnType<typeof budgetSections>;
  totals: Record<"spending" | "envelopes" | "bills" | "savings", BudgetTotals>;
  ctx: BudgetColumnCtx;
  rowMenu: (rowId: string | null) => MenuItem[];
  structure: BudgetStructure;
  groups: readonly BudgetGroupRow[];
  categories: readonly BudgetCategoryRow[];
  monthKey: string;
  /** The linked envelope's ancestors, kept open whatever the saved collapse says. */
  revealAncestors: ReadonlySet<string> | undefined;
  fundingPlan: ReturnType<typeof monthlyFundingPlan>;
  pending: boolean;
  openMenu: (menu: OpenMenu) => void;
}) {
  const { focusedTable, setFocusedTable, setInspecting } = tables;
  const { envelopes, bills, savings } = tables;

  /**
   * A group header's own subtotal, keyed to the columns it totals. No word labels:
   * Assigned / Activity / Available are directly above each figure, and a pack-versus-pack
   * comparison is a glance down one column rather than a hunt through a run of prose.
   */
  function groupTotals(
    sectionRows: readonly BudgetRow[],
    groupId: string,
  ): Record<string, ReactNode> | null {
    const group = groupSectionTotals(groups, categories, sectionRows, groupId);
    if (!group) return null;
    return {
      assigned: formatUsd(group.assignedCents),
      activity: formatUsd(group.activityCents),
      balance: formatUsd(group.balanceCents),
    };
  }

  function groupChrome(groupId: string, kind: EnvelopeKind) {
    return (
      <GroupChrome
        groupId={groupId}
        kind={kind}
        groups={groups}
        structure={structure}
        pending={pending}
        openMenu={openMenu}
      />
    );
  }

  /** One section's table: Regular spending, Bills or Savings. */
  function sectionTable<TRow extends BudgetRow>({
    table,
    kind,
    state,
    columns,
    sectionRows,
    title,
    caption,
    totals: sectionTotals,
    level,
    newLabel,
    rowNoun,
    ariaNoun,
    empty,
  }: {
    table: BudgetTable;
    kind: EnvelopeKind;
    state: Omit<Tables["envelopes"], "grid" | "rows"> & {
      grid: ReturnType<typeof useGridState<ColumnDef<BudgetColumnCtx, TRow>>>;
      rows: GridRow<TRow>[];
    };
    columns: ColumnDef<BudgetColumnCtx, TRow>[];
    sectionRows: readonly BudgetRow[];
    title: string;
    caption: string;
    totals: BudgetTotals;
    level?: "h2";
    /** What the section's `+` makes besides a group: "Envelope" or "Bill". */
    newLabel: string;
    /** Prefixes each row's accessible name: "Envelope: Groceries". */
    rowNoun: string;
    /** Names the grid: "Envelopes for October 2026". */
    ariaNoun: string;
    empty: string;
  }) {
    return (
      <BudgetSection
        title={title}
        caption={caption}
        totals={sectionTotals}
        level={level}
        focused={focusedTable === table}
        onFocus={() => setFocusedTable(table)}
        newItems={[
          {
            label: newLabel,
            onSelect: () => structure.openComposer("envelope", kind, null),
          },
          {
            label: "Group",
            onSelect: () => structure.openComposer("group", kind, null),
          },
        ]}
        composer={<SectionComposer structure={structure} kind={kind} />}
      >
        <DataGrid<BudgetColumnCtx, TRow>
          rows={state.rows}
          onNavigableIdsChange={state.nav.onIdsChange}
          columns={state.grid.columns}
          allColumns={columns}
          columnCtx={ctx}
          selectedId={state.select.selectedId}
          selectedIds={state.select.selectedIds}
          selectAllState={state.select.headerState}
          onToggleSelectAll={state.select.toggleSelectAll}
          onSelect={(id, mods) => {
            setFocusedTable(table);
            state.select.select(id, mods);
          }}
          onOpenDetail={() => setInspecting(true)}
          exportCommands={false}
          /*
           * The same menu the Available cell opens, reachable by right-click and — the
           * reason it is here — by long-press on a phone, where the compact row draws the
           * amount as a chip, not a button. Without it cover/move would exist only on
           * desktop.
           */
          rowMenu={rowMenu}
          ariaLabel={`${ariaNoun} for ${monthLabel(monthKey)}`}
          empty={empty}
          grid={{
            ...state.grid,
            collapsedGroups: revealBudgetGroups(
              state.grid.collapsedGroups,
              revealAncestors,
            ),
          }}
          autoHeight
          rowLabel={(row) => `${rowNoun}: ${row.node.name}`}
          groupTotals={(_nodes, header) => groupTotals(sectionRows, header.id)}
          groupChrome={(header) => groupChrome(header.id, kind)}
        />
      </BudgetSection>
    );
  }

  return (
    <>
      {/* `shrink-0`, not `min-h-0`: these are stacked inside the page scroller, and a flex
        item allowed to shrink below its content collapses both grids to one row. */}
      <section
        className="flex min-w-0 shrink-0 flex-col gap-3 md:rounded md:border md:border-rule md:p-3"
        aria-label="Spending"
      >
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule pb-2 md:-mx-3 md:px-3">
          <div className="min-w-0">
            <h2 className="text-[1rem] font-semibold text-ink">Spending</h2>
            <p className="text-[0.75rem] text-ink-muted">
              Bills + regular. Savings is held out so a house fund is not an overspend.
            </p>
          </div>
          {/* Leading labels and `text-ink` figures, where the sections below use a
            quieter trailing-label run: this is the line that has to be believed, so it
            stays heavier than the subtotals it sums. */}
          <span className="tabular flex flex-wrap gap-x-5 text-[0.8125rem]">
            <span className="text-ink-muted">
              Assigned{" "}
              <span className="text-ink">
                {formatUsd(totals.spending.assignedCents)}
              </span>
            </span>
            <span className="text-ink-muted">
              Spent{" "}
              <span className="text-ink">
                {formatUsd(totals.spending.activityCents)}
              </span>
            </span>
            <span className="text-ink-muted">
              Left{" "}
              <span className="text-ink">
                {formatUsd(totals.spending.balanceCents)}
              </span>
            </span>
          </span>
        </header>

        {sectionTable({
          table: "envelopes",
          kind: "spending",
          state: envelopes,
          columns: envelopeColumns,
          sectionRows: sections.envelopes,
          title: "Regular spending",
          caption:
            "Everything that is not a bill. Assign what you have; Available is what is left.",
          totals: totals.envelopes,
          newLabel: "Envelope",
          rowNoun: "Envelope",
          ariaNoun: "Envelopes",
          empty: "No envelopes yet.",
        })}

        {sectionTable({
          table: "bills",
          kind: "bill",
          state: bills,
          columns: billColumns,
          sectionRows: sections.bills,
          title: "Bills",
          caption:
            "Each funds itself from its own cadence — Assign → Underfunded fills what this month owes.",
          totals: totals.bills,
          newLabel: "Bill",
          rowNoun: "Bill",
          ariaNoun: "Bills",
          empty: "No bills yet — open Bills to add or discover recurring charges.",
        })}
      </section>

      <FundingPlanSummary plan={fundingPlan} />

      {sectionTable({
        table: "savings",
        kind: "savings",
        state: savings,
        columns: envelopeColumns,
        sectionRows: sections.savings,
        title: "Savings",
        caption:
          "Assigned money that is not a monthly expense. Held out of the Spending total so a house fund is not an overspend.",
        totals: totals.savings,
        level: "h2",
        newLabel: "Envelope",
        rowNoun: "Savings",
        ariaNoun: "Savings",
        empty: "No savings envelopes yet — add one with + Envelope above.",
      })}
    </>
  );
}
