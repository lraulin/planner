"use client";

import { useId, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  budgetOperationAction,
  setRecurringBillAction,
  setTargetSnoozeAction,
  updateBudgetCategoryAction,
} from "@/app/(shell)/finances/actions";
import { Drawer, DrawerHeader } from "@/components/detail/Drawer";
import { ContextMenu } from "@/components/grid/ContextMenu";
import { useSetting } from "@/components/settings/SettingsProvider";
import { useIsCompact } from "@/components/shell/useIsCompact";
import {
  categoryMonth,
  findMonth,
  monthKeyOf,
  prevMonthKey,
  type BudgetMonth,
} from "@/lib/finances/budget/envelope";
import type { BudgetData } from "@/lib/finances/budget/queries";
import {
  budgetRows,
  budgetSections,
  budgetTotals,
  receivedIncomeCents,
  type BudgetRow,
} from "@/lib/finances/budget/rows";
import {
  templateCarryIn,
  type EnvelopeApplyInput,
} from "@/lib/finances/budget/templates/apply";
import { assignScopeFromSelection } from "@/lib/finances/budget/assign/fromBudget";
import { fixThisUnavailableReason } from "@/lib/finances/budget/fixThis";
import { moveMoneyOperation } from "@/lib/finances/budget/moveMoneyOperation";
import { budgetReturnContext } from "@/lib/finances/budget/returnContext";
import { monthlyFundingPlan } from "@/lib/finances/budget/incomePlan";
import { cadenceOf } from "@/lib/finances/recurringBills";
import type { Payday } from "@/lib/finances/classify/income";
import type { BillAnchor } from "@/lib/finances/commitments";
import { nextPayday } from "@/lib/finances/available";
import { PAYDAY_SCOPE } from "@/lib/settings/scopes";
import { PAYDAY_CODEC } from "../paydaySetting";
import { AssignFlowDialogs } from "./AssignFlowDialogs";
import type { BudgetColumnCtx } from "./budgetColumns";
import { BudgetHeader } from "./BudgetHeader";
import { BudgetInspector } from "./BudgetInspector";
import { BudgetTables } from "./BudgetTables";
import { CommitmentPayeeDialog } from "./CommitmentPayeeDialog";
import { IncomeSection } from "./IncomeSection";
import { MoveMoneyDialog } from "./MoveMoneyDialog";
import { PayeeEvidenceDialogs } from "./PayeeEvidenceDialogs";
import { rowMenuItems } from "./rowMenu";
import { DeleteStructureDialog, SectionComposer } from "./StructureChrome";
import { TargetDrawer } from "./TargetDrawer";
import { useBudgetAssign } from "./useBudgetAssign";
import { useBudgetCommands } from "./useBudgetCommands";
import { useBudgetExport } from "./useBudgetExport";
import { useBudgetRun } from "./useBudgetRun";
import { useBudgetStructure, type OpenMenu } from "./useBudgetStructure";
import { useBudgetKeys, useBudgetTables } from "./useBudgetTables";
import { usePayeeEvidence } from "./usePayeeEvidence";

/**
 * The budget, one month at a time: **Income**, **Spending** (Regular above Bills), **Savings**.
 *
 * **Sections, not one grid.** Bills and ordinary envelopes stay separate tables so the All
 * spending footer can still add them. Bill-only fields live in the inspector, so every
 * table is Name / Assigned / Activity / Available
 * (`agent-os/specs/2026-08-25-1633-budget-inspector/`).
 *
 * The sections are **derived from the envelope's `kind`**, not from groups. A user group
 * whose rows all land in one section renders no header (`sectionGridRows`), so the seeded
 * "Income" and "Spending" groups are invisible chrome — and can be deleted — and any group
 * the user makes *inside* a section still shows.
 *
 * **Arranges and formats only.** Every figure arrives already folded by
 * `src/lib/finances/budget/envelope.ts`, and every clamp is applied again on the server
 * before anything is written — this component never decides how much money can move.
 *
 * This file wires the page together; each concern lives beside it: the tables and their
 * selection (`useBudgetTables`, `BudgetTables`), structure editing (`useBudgetStructure`,
 * `StructureChrome`), the row menu (`rowMenu`), Assign and Fix This (`useBudgetAssign`,
 * `AssignFlowDialogs`), the inspector's payees (`usePayeeEvidence`), the command catalog
 * (`useBudgetCommands`) and the export (`useBudgetExport`).
 */
export function BudgetView({
  data,
  anchors,
  payees,
  paydays,
}: {
  data: BudgetData;
  /** Resolved charge dates per bill envelope id, from `loadBillAnchors`. */
  anchors: ReadonlyMap<string, BillAnchor>;
  /** Every payee, with its current bill/envelope claim if any — for the payees dialog. */
  payees: readonly { id: string; name: string; budgetCategoryId: string | null }[];
  paydays: readonly Payday[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const returnContext = useMemo(
    () => budgetReturnContext(params.get("detail"), data.categories, data.groups),
    [params, data.categories, data.groups],
  );
  const compact = useIsCompact();
  const inspectorTitleId = useId();
  const { pending, startTransition, error, setError, run } = useBudgetRun();
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const [move, setMove] = useState<{ from: BudgetRow; targets: BudgetRow[] } | null>(
    null,
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [editingPayeesFor, setEditingPayeesFor] = useState<BudgetRow | null>(null);
  const { value: paydayOverride } = useSetting(PAYDAY_SCOPE, PAYDAY_CODEC);
  const payday = nextPayday(paydays, paydayOverride, data.todayKey);

  const month = findMonth(data.months, data.month);
  const canFixThis =
    !!month &&
    fixThisUnavailableReason({
      viewedMonth: data.month,
      todayKey: data.todayKey,
      readyToAssignCents: month.readyToAssignCents,
    }) === null;

  const rows = useMemo(
    () =>
      month ? budgetRows(data.groups, data.categories, month, data.goals, anchors) : [],
    [data.groups, data.categories, month, data.goals, anchors],
  );
  const sections = useMemo(() => budgetSections(rows), [rows]);
  const fundingPlan = useMemo(
    () =>
      monthlyFundingPlan(
        rows,
        data.month,
        findMonth(data.months, prevMonthKey(data.month)),
      ),
    [rows, data.month, data.months],
  );

  const tables = useBudgetTables({
    groups: data.groups,
    rows,
    sections,
    returnContext,
  });
  const { selectedRow, focusedTable } = tables;
  const evidence = usePayeeEvidence(selectedRow, run);

  /**
   * Carry-in is last month's balance, and a negative one only carries when the envelope is set
   * to roll overspending forward — Actual's rule, and the reason `templateCarryIn` is shared
   * with the server rather than re-derived here.
   */
  const previous = month ? findMonth(data.months, prevMonthKey(data.month)) : null;

  // The page-level Assign acts on what is selected in the focused table.
  const focusedSelectedIds = (
    focusedTable === "bills"
      ? tables.bills
      : focusedTable === "envelopes"
        ? tables.envelopes
        : tables.savings
  ).select.selectedIds;
  const focusedSectionRows =
    focusedTable === "bills"
      ? sections.bills
      : focusedTable === "envelopes"
        ? sections.envelopes
        : sections.savings;
  const bannerScope = useMemo(
    () =>
      assignScopeFromSelection(
        focusedSelectedIds,
        focusedSectionRows,
        data.groups,
        data.categories,
      ),
    [focusedSelectedIds, focusedSectionRows, data.groups, data.categories],
  );

  const assign = useBudgetAssign({
    data,
    month,
    previous,
    rows,
    scope: bannerScope,
    canFixThis,
    startTransition,
    setError,
  });
  useBudgetKeys(tables, {
    compact,
    overlayOpen: Boolean(assign.assigning || assign.preview || menu),
  });

  const spendingRows = useMemo(
    () => [...sections.bills, ...sections.envelopes],
    [sections],
  );
  const receivedThisMonthCents = useMemo(() => receivedIncomeCents(rows), [rows]);
  // Spending totals from one row set: the two tables each own a subtotal, and the footer
  // sums both. Savings is held out. They are computed from the same `budgetTotals` so a
  // bill can never be counted in one and missed in the other. Above the early return
  // because the export document needs them too, and that is a hook.
  const totals = {
    spending: budgetTotals(spendingRows),
    bills: budgetTotals(sections.bills),
    envelopes: budgetTotals(sections.envelopes),
    savings: budgetTotals(sections.savings),
  };

  useBudgetExport({
    data,
    month,
    tables,
    income: sections.income,
    receivedCents: receivedThisMonthCents,
    expectedIncomeCents: fundingPlan.income.expectedCents,
    totals,
  });

  const structure = useBudgetStructure({
    groups: data.groups,
    categories: data.categories,
    run,
    openMenu: setMenu,
  });
  useBudgetCommands({
    data,
    month,
    canFixThis,
    selectedRow,
    assignPlans: assign.assignPlans,
    scope: bannerScope,
    startAssign: assign.startAssign,
    handlers: {
      openComposer: structure.openComposer,
      moveRelative: structure.moveRelative,
      openMoveToGroupMenu: structure.openMoveToGroupMenu,
      // A bare "New envelope"/"New group" lands in the section you were last in.
      newKindForFocus: () => (focusedTable === "savings" ? "savings" : "spending"),
      startRename: structure.startRename,
      startDelete: (row) =>
        structure.startDelete({ kind: "category", id: row.id, name: row.name }),
      openFixThis: assign.openFixThis,
    },
  });

  if (!month) return null;
  // `rowMenu` below is a function declaration, which TypeScript does not narrow through.
  // Past the guard the month exists, so it reads it from here.
  const shownMonth = month;

  function rowMenu(row: BudgetRow) {
    return rowMenuItems(row, {
      rows,
      month: shownMonth,
      monthKey: data.month,
      todayKey: data.todayKey,
      run,
      openMove: (from, targets) => setMove({ from, targets }),
      editTarget: (id) => setEditing(id),
      editPayees: (target) => setEditingPayeesFor(target),
      assignOne: assign.assignOne,
      structureMenuItems: structure.structureMenuItems,
    });
  }

  const ctx: BudgetColumnCtx = {
    pending,
    indicators: assign.indicators,
    todayKey: data.todayKey,
    paydayKey: payday.dateKey,
    month: data.month,
    onAssign: (row, cents) =>
      run(() =>
        budgetOperationAction({
          kind: "assign",
          month: data.month,
          category: { id: row.id, name: row.name },
          amountCents: cents,
        }),
      ),
    onBalanceMenu: (row, at) => setMenu({ ...at, items: rowMenu(row) }),
    renamingId: structure.renaming,
    onStartRename: (row) => structure.startRename(row.id),
    onCancelRename: structure.cancelRename,
    onRename: (row, name) => {
      structure.cancelRename();
      const trimmed = name.trim();
      if (trimmed === "" || trimmed === row.name) return;
      run(() => updateBudgetCategoryAction(row.id, { name: trimmed }));
    },
    onPatchBill: (row, patch) => {
      // Every patch carries the cadence because `upsertBillEnvelope` requires one; sending
      // the row's current cadence when the patch does not change it keeps a URL edit from
      // rewriting the schedule.
      run(() =>
        setRecurringBillAction({
          id: row.id,
          name: row.name,
          cadence:
            patch.cadence ??
            cadenceOf({
              cadenceMonths: row.bill.cadenceMonths ?? 1,
              cadenceDays: row.bill.cadenceDays,
            }),
          ...patch,
        }),
      );
    },
  };

  const editingRow = rows.find((row) => row.id === editing) ?? null;

  const inspector = (
    <BudgetInspector
      key={selectedRow?.id ?? "empty"}
      row={selectedRow}
      month={data.month}
      carryInCents={
        selectedRow
          ? templateCarryIn(previous ? categoryMonth(previous, selectedRow.id) : null)
          : 0
      }
      indicator={selectedRow ? (assign.indicators.get(selectedRow.id) ?? null) : null}
      pending={pending}
      onPatchBill={(row, patch) => ctx.onPatchBill(row, patch)}
      onNotes={(row, notes) => run(() => updateBudgetCategoryAction(row.id, { notes }))}
      onAssignUnderfunded={(row) => assign.assignOne("underfunded", row.id)}
      onEditTarget={(row) => setEditing(row.id)}
      currentMonth={monthKeyOf(data.todayKey)}
      onSnooze={(row) =>
        run(() => setTargetSnoozeAction(data.month, row.id, !row.snoozed))
      }
      onEditPayees={(row) => setEditingPayeesFor(row)}
      evidence={evidence.evidence}
      selectedPayeeIds={evidence.selectedPayeeIds}
      onTogglePayee={evidence.togglePayee}
      onMergePayees={evidence.startMerge}
      onRemovePayeeRouting={evidence.removeRouting}
      onFileWaiting={evidence.startFiling}
    />
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <BudgetHeader
        data={data}
        anchors={anchors}
        month={month}
        paydayKey={payday.dateKey}
        stillNeeded={assign.stillNeededThisMonth}
        canFixThis={canFixThis}
        onAction={canFixThis ? assign.openFixThis : assign.openAssign}
        showHidden={tables.showHidden}
        onShowHidden={tables.setShowHidden}
        pending={pending}
        run={run}
      />

      <div className="flex min-h-0 min-w-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-auto p-3">
          <IncomeSection
            rows={sections.income}
            month={data.month}
            receivedCents={receivedThisMonthCents}
            pending={pending}
            onEdit={(id, edit) => run(() => updateBudgetCategoryAction(id, edit))}
            onNew={() => structure.openComposer("envelope", "income", null)}
            composer={<SectionComposer structure={structure} kind="income" />}
          />

          {data.movementEvents.length > 0 ? (
            <details className="rounded border border-rule bg-surface px-3 py-2 text-[0.8125rem]">
              <summary className="cursor-pointer text-ink">Movement log</summary>
              <ol className="mt-2 space-y-1 text-ink-muted">
                {data.movementEvents.map((event) => (
                  <li key={event.id}>{event.summary}</li>
                ))}
              </ol>
            </details>
          ) : null}

          {error ? (
            <p className="rounded border border-rule bg-surface px-3 py-2 text-[0.8125rem] text-[var(--chart-spend)]">
              {error}
            </p>
          ) : null}

          <BudgetTables
            tables={tables}
            sections={sections}
            totals={totals}
            ctx={ctx}
            rowMenu={(rowId) => {
              const row = rows.find((candidate) => candidate.id === rowId);
              return row ? rowMenu(row) : [];
            }}
            structure={structure}
            groups={data.groups}
            categories={data.categories}
            monthKey={data.month}
            revealAncestors={returnContext?.ancestors}
            fundingPlan={fundingPlan}
            pending={pending}
            openMenu={setMenu}
          />
        </div>

        <aside
          className="hidden min-h-0 w-80 shrink-0 flex-col overflow-hidden border-l border-rule bg-surface md:flex"
          aria-label="Category details"
        >
          {inspector}
        </aside>
      </div>

      {compact && tables.inspecting && selectedRow ? (
        <Drawer
          open
          onClose={() => tables.setInspecting(false)}
          labelledBy={inspectorTitleId}
        >
          <DrawerHeader
            titleId={inspectorTitleId}
            title={selectedRow?.name ?? "Details"}
            onClose={() => tables.setInspecting(false)}
          />
          {inspector}
        </Drawer>
      ) : null}

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      ) : null}

      {editingRow ? (
        <TargetDrawer
          key={editingRow.id}
          envelope={envelopeInput(editingRow, previous)}
          month={data.month}
          todayKey={data.todayKey}
          history={assign.assignInputs.history}
          bills={assign.assignInputs.bills}
          onClose={() => setEditing(null)}
          onSaved={() => router.refresh()}
        />
      ) : null}

      {move ? (
        <MoveMoneyDialog
          from={move.from}
          targets={move.targets}
          groups={data.groups}
          readyToAssignCents={month.readyToAssignCents}
          onCancel={() => setMove(null)}
          onMove={(toId, cents) => {
            setMove(null);
            const operation = moveMoneyOperation(
              data.month,
              move.from,
              move.targets,
              toId,
              cents,
            );
            if (!operation) return;
            run(() => budgetOperationAction(operation));
          }}
        />
      ) : null}
      <AssignFlowDialogs
        assign={assign}
        canFixThis={canFixThis}
        data={data}
        anchors={anchors}
        month={month}
        rows={rows}
        envelopes={[...sections.envelopes, ...sections.bills, ...sections.savings]}
        showHidden={tables.showHidden}
        pending={pending}
        run={run}
      />
      <DeleteStructureDialog structure={structure} />
      <PayeeEvidenceDialogs evidence={evidence} envelope={selectedRow} run={run} />
      {editingPayeesFor ? (
        <CommitmentPayeeDialog
          commitment={{
            id: editingPayeesFor.id,
            name: editingPayeesFor.name,
            payeeIds: payees
              .filter((payee) => payee.budgetCategoryId === editingPayeesFor.id)
              .map((payee) => payee.id),
          }}
          payees={payees}
          onClose={() => setEditingPayeesFor(null)}
          onSaved={() => {
            setEditingPayeesFor(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

/** The envelope as the target editor's preview reads it: this month, plus its carry-in. */
function envelopeInput(
  row: BudgetRow,
  previous: BudgetMonth | null,
): EnvelopeApplyInput {
  return {
    id: row.id,
    name: row.name,
    isIncome: row.isIncome,
    kind: row.kind,
    target: row.target,
    assignedCents: row.assignedCents,
    carryInCents: templateCarryIn(previous ? categoryMonth(previous, row.id) : null),
    activityCents: row.activityCents,
    contributedBeforeCents: row.contributedBeforeCents,
  };
}
