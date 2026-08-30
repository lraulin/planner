"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  assignBudgetAction,
  budgetOperationAction,
  clearPayeeRoutingAction,
  deleteBudgetCategoryAction,
  deleteCategoryGroupAction,
  fileWaitingChargesAction,
  moveBudgetStructureItemAction,
  moveBudgetStructureItemIntoGroupAction,
  payeeEvidenceAction,
  renameCategoryGroupAction,
  setCarryoverAction,
  setTargetSnoozeAction,
  setRecurringBillAction,
  updateBudgetCategoryAction,
} from "@/app/finances/actions";
import type { Command } from "@/lib/commands/registry";
import { Drawer, DrawerHeader } from "@/components/detail/Drawer";
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
import { useIsCompact } from "@/components/shell/useIsCompact";
import { ContextMenu, type MenuItem } from "@/components/grid/ContextMenu";
import { snoozeUnavailableReason } from "@/lib/finances/budget/snooze";
import { DataGrid } from "@/components/grid/DataGrid";
import { useGridState } from "@/components/grid/useGridState";
import { useMultiSelect } from "@/components/grid/useMultiSelect";
import {
  categoryMonth,
  findMonth,
  monthKeyOf,
  monthLabel,
  monthName,
  monthParamOf,
  nextMonthKey,
  prevMonthKey,
  type BudgetMonth,
} from "@/lib/finances/budget/envelope";
import {
  budgetExportDocument,
  gridExportSection,
  serializeBudgetExport,
  totalsCaption,
  type BudgetExportDocument,
} from "@/lib/finances/budget/export";
import type { EnvelopeKind } from "@/db/schema";
import type { BudgetData } from "@/lib/finances/budget/queries";
import {
  budgetRows,
  budgetSections,
  budgetTotals,
  coverSources,
  moveTargets,
  sectionGridRows,
  type BudgetBillRow,
  type BudgetRow,
} from "@/lib/finances/budget/rows";
import {
  templateCarryIn,
  type EnvelopeApplyInput,
} from "@/lib/finances/budget/templates/apply";
import { needsAssignPreview, planAssign } from "@/lib/finances/budget/assign/plan";
import {
  assignBillsFromRows,
  assignEnvelopeFromRow,
  assignHistoryWithLookback,
  currentMonthUnderfundedGap,
  isFutureBudgetMonth,
} from "@/lib/finances/budget/assign/fromBudget";
import { indicatorsFromAssign } from "@/lib/finances/budget/indicator";
import {
  ASSIGN_OPTIONS,
  ASSIGN_OPTION_LABELS,
  type AssignOption,
  type AssignResult,
} from "@/lib/finances/budget/assign/types";
import { fixThisUnavailableReason } from "@/lib/finances/budget/fixThis";
import {
  budgetGroupDepths,
  budgetSiblings,
  descendantEnvelopeIds,
  moveDestinations,
  type BudgetStructureRef,
} from "@/lib/finances/budget/hierarchy";
import { formatUsd } from "@/lib/finances/money";
import type { PayeeEvidenceRow } from "@/lib/finances/payees/evidence";
import type { RecurringMerchant } from "@/lib/finances/analytics";
import { cadenceOf } from "@/lib/finances/recurringBills";
import type { BillForecast } from "@/lib/finances/dashboardQueries";
import { AssignDialog, AssignPreviewDialog } from "./AssignDialog";
import { FixThisDialog } from "./FixThisDialog";
import { billColumns, envelopeColumns, type BudgetColumnCtx } from "./budgetColumns";
import { BudgetInspector } from "./BudgetInspector";
import { BudgetSummary } from "./BudgetSummary";
import { CommitmentPayeeDialog } from "./CommitmentPayeeDialog";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import { PayeeMergeDialog } from "@/components/finances/payees/PayeeMergeDialog";
import { withScheme } from "./UrlCell";
import { ForecastDetails } from "./ForwardPanel";
import { MoveMoneyDialog } from "./MoveMoneyDialog";
import { TargetDrawer } from "./TargetDrawer";
import { ReviewDrawer } from "./ReviewDrawer";
import { StructureComposer, type ComposerTarget } from "./StructureComposer";

/**
 * Which table last had the focus ring. Selection and the inspector read it; export no
 * longer does — the page exports one document, so there is nothing left to disambiguate.
 */
type BudgetTable = "envelopes" | "bills" | "savings";

/** The four sections, named the way the page names them. `kind` is the section (D1). */
const KIND_LABELS: Record<EnvelopeKind, string> = {
  income: "Income",
  spending: "Envelope",
  bill: "Bill",
  savings: "Savings envelope",
};

/** "Change section ▸" — the page's own headings, in page order. */
const SECTION_CHOICES: { kind: EnvelopeKind; label: string }[] = [
  { kind: "income", label: "Income" },
  { kind: "spending", label: "Regular spending" },
  { kind: "bill", label: "Bills" },
  { kind: "savings", label: "Savings" },
];

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
 */
export function BudgetView({
  data,
  review,
  nextDueKeys,
  expectedKeys,
  payees,
  forecast,
}: {
  data: BudgetData;
  /** Detected recurring merchants no envelope has claimed yet. */
  review: readonly RecurringMerchant[];
  /** Next charge per bill envelope id, from `loadBillAnchors`. */
  nextDueKeys: ReadonlyMap<string, string>;
  /** Charge being waited for, which may be in the past. */
  expectedKeys: ReadonlyMap<string, string>;
  /** Every payee, with its current bill/envelope claim if any — for the payees dialog. */
  payees: readonly { id: string; name: string; budgetCategoryId: string | null }[];
  /** Next 12 months and Expected vs income — collapsed-by-default reference panels (D8). */
  forecast: BillForecast;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const compact = useIsCompact();
  const inspectorTitleId = useId();
  // The export writes dates the way the rest of the app does, not a second format.
  const formatDate = useDateFormatter();
  const [pending, startTransition] = useTransition();
  const [, startEvidenceLoad] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(
    null,
  );
  const [move, setMove] = useState<{ from: BudgetRow; targets: BudgetRow[] } | null>(
    null,
  );
  const [focusedTable, setFocusedTable] = useState<BudgetTable>("envelopes");
  const [editing, setEditing] = useState<string | null>(null);
  const [editingPayeesFor, setEditingPayeesFor] = useState<BudgetRow | null>(null);
  // Both are stamped with the envelope they belong to, so selecting another row shows an
  // empty list immediately rather than last envelope's payees until the read comes back.
  const [evidenceState, setEvidenceState] = useState<{
    categoryId: string;
    rows: readonly PayeeEvidenceRow[];
  } | null>(null);
  const [selectedPayees, setSelectedPayees] = useState<{
    categoryId: string;
    ids: readonly string[];
  } | null>(null);
  const [mergingPayees, setMergingPayees] = useState<
    readonly { id: string; name: string }[] | null
  >(null);
  const [filing, setFiling] = useState<PayeeEvidenceRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [preview, setPreview] = useState<AssignResult | null>(null);
  const [previewScope, setPreviewScope] = useState<readonly string[] | undefined>();
  const [reviewing, setReviewing] = useState(false);
  // Structure editing, all of it inline: which `+` strip is open, which name is an input,
  // and which delete is waiting to be confirmed.
  const [composer, setComposer] = useState<ComposerTarget | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<
    (BudgetStructureRef & { name: string }) | null
  >(null);

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
      month
        ? budgetRows(
            data.groups,
            data.categories,
            month,
            data.goals,
            nextDueKeys,
            expectedKeys,
          )
        : [],
    [data.groups, data.categories, month, data.goals, nextDueKeys, expectedKeys],
  );
  const sections = useMemo(() => budgetSections(rows), [rows]);
  const billGridRows = useMemo(
    () => sectionGridRows(data.groups, "bill", sections.bills, { showHidden }),
    [data.groups, sections.bills, showHidden],
  );
  const envelopeGridRows = useMemo(
    () => sectionGridRows(data.groups, "spending", sections.envelopes, { showHidden }),
    [data.groups, sections.envelopes, showHidden],
  );
  const savingsGridRows = useMemo(
    () => sectionGridRows(data.groups, "savings", sections.savings, { showHidden }),
    [data.groups, sections.savings, showHidden],
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
  const billSelect = useMultiSelect(billRowIds, null, { allowEmpty: true });
  const envelopeSelect = useMultiSelect(envelopeRowIds, null, { allowEmpty: true });
  const savingsSelect = useMultiSelect(savingsRowIds, null, { allowEmpty: true });

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

  const selectedId = selectedRow?.id ?? null;
  const showsEvidence = Boolean(selectedRow && !selectedRow.isIncome);
  const evidence =
    evidenceState && evidenceState.categoryId === selectedId
      ? evidenceState.rows
      : null;
  const evidenceSelection =
    selectedPayees && selectedPayees.categoryId === selectedId
      ? selectedPayees.ids
      : [];

  /**
   * Read the Files-here list for whichever envelope is selected.
   *
   * Per selection rather than with the page: the answer needs every charge of every payee
   * that files here, which is thousands of rows for Amazon and nothing at all for most
   * envelopes. A read for an envelope the user has already left is dropped on arrival.
   */
  const loadEvidence = useCallback(
    (categoryId: string) => {
      startEvidenceLoad(async () => {
        const result = await payeeEvidenceAction(categoryId);
        setEvidenceState({ categoryId, rows: result.ok ? result.data : [] });
      });
    },
    [startEvidenceLoad],
  );

  useEffect(() => {
    if (!selectedId || !showsEvidence) return;
    loadEvidence(selectedId);
  }, [selectedId, showsEvidence, loadEvidence]);

  /** After a Remove, a merge, or a filing run, the counts on screen are stale. */
  const refreshEvidence = useCallback(() => {
    if (!selectedId) return;
    loadEvidence(selectedId);
  }, [selectedId, loadEvidence]);

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
      if (assigning || preview || menu || inspecting) return;
      billSelect.selectOne(null);
      envelopeSelect.selectOne(null);
      savingsSelect.selectOne(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    assigning,
    preview,
    menu,
    inspecting,
    compact,
    selectedRow,
    billSelect,
    envelopeSelect,
    savingsSelect,
  ]);

  function run(work: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) setError(result.error ?? "Could not save.");
      else router.refresh();
    });
  }

  /**
   * Carry-in is last month's balance, and a negative one only carries when the envelope is set
   * to roll overspending forward — Actual's rule, and the reason `templateCarryIn` is shared
   * with the server rather than re-derived here.
   */
  const previous = month ? findMonth(data.months, prevMonthKey(data.month)) : null;

  function envelopeInput(row: BudgetRow): EnvelopeApplyInput {
    return {
      id: row.id,
      name: row.name,
      isIncome: row.isIncome,
      kind: row.kind,
      target: row.target,
      assignedCents: row.assignedCents,
      carryInCents: templateCarryIn(previous ? categoryMonth(previous, row.id) : null),
      activityCents: row.activityCents,
    };
  }

  const bannerScope = useMemo(() => {
    const select =
      focusedTable === "bills"
        ? billSelect
        : focusedTable === "envelopes"
          ? envelopeSelect
          : savingsSelect;
    const sectionRows =
      focusedTable === "bills"
        ? sections.bills
        : focusedTable === "envelopes"
          ? sections.envelopes
          : sections.savings;
    if (select.selectedIds.size === 0) return undefined;
    const envelopeIds = new Set(sectionRows.map((row) => row.id));
    const scoped: string[] = [];
    for (const id of select.selectedIds) {
      if (envelopeIds.has(id)) {
        scoped.push(id);
        continue;
      }
      const descendants = descendantEnvelopeIds(data.groups, data.categories, id);
      for (const row of sectionRows) {
        if (descendants.has(row.id)) scoped.push(row.id);
      }
    }
    return scoped.length > 0 ? scoped : undefined;
  }, [
    focusedTable,
    billSelect,
    envelopeSelect,
    savingsSelect,
    sections.bills,
    sections.envelopes,
    sections.savings,
    data.groups,
    data.categories,
  ]);

  const commitAssign = useCallback(
    (option: AssignOption, categoryIds?: readonly string[]) => {
      setError(null);
      setNotice(null);
      startTransition(async () => {
        const result = await assignBudgetAction(data.month, option, categoryIds);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        const applied = result.data?.applied ?? 0;
        const problems = result.data?.errors ?? [];
        setNotice(
          [
            applied === 0
              ? "Nothing to assign."
              : `${applied === 1 ? "1 envelope" : `${applied} envelopes`} updated.`,
            ...problems,
          ].join(" "),
        );
        setPreview(null);
        setAssigning(false);
        router.refresh();
      });
    },
    [data.month, router],
  );

  /** Preview when the split or a shortfall needs a look; otherwise write immediately. */
  const startAssign = useCallback(
    (result: AssignResult, categoryIds?: readonly string[]) => {
      if (!needsAssignPreview(result)) {
        setAssigning(false);
        commitAssign(result.option, categoryIds);
        return;
      }
      setPreviewScope(categoryIds);
      setPreview(result);
    },
    [commitAssign],
  );

  function goToMonth(key: string) {
    const next = new URLSearchParams(params.toString());
    next.set("month", monthParamOf(key));
    router.push(`/finances/budget?${next.toString()}`);
  }

  const spendingRows = useMemo(
    () => [...sections.bills, ...sections.envelopes],
    [sections],
  );
  const receivedThisMonthCents = useMemo(
    () =>
      rows
        .filter((row) => row.isIncome)
        .reduce((total, row) => total + row.activityCents, 0),
    [rows],
  );
  // Spending totals from one row set: the two tables each own a subtotal, and the footer
  // sums both. Savings is held out. They are computed from the same `budgetTotals` so a
  // bill can never be counted in one and missed in the other. Above the early return
  // because the export document needs them too, and that is a hook.
  const totals = budgetTotals(spendingRows);
  const billTotals = budgetTotals(sections.bills);
  const envelopeTotals = budgetTotals(sections.envelopes);
  const savingsTotals = budgetTotals(sections.savings);

  const assignInputs = useMemo(() => {
    const envelopes = rows.map((row) => assignEnvelopeFromRow(row, previous));
    return {
      envelopes,
      bills: assignBillsFromRows(rows),
      history: assignHistoryWithLookback(
        data.months,
        rows.map((row) => row.id),
        data.preStartActivity,
        data.settings.startMonth,
      ),
    };
  }, [rows, previous, data.months, data.preStartActivity, data.settings.startMonth]);
  const indicators = useMemo(
    () => indicatorsFromAssign(data.month, assignInputs.envelopes, assignInputs.bills),
    [data.month, assignInputs.envelopes, assignInputs.bills],
  );

  const assignPlans = useMemo(() => {
    if (!month) return [];
    return ASSIGN_OPTIONS.map((option) => ({
      option,
      result: planAssign({
        option,
        month: data.month,
        todayKey: data.todayKey,
        readyToAssignCents: month.readyToAssignCents,
        envelopes: assignInputs.envelopes,
        bills: assignInputs.bills,
        history: assignInputs.history,
        categoryIds: bannerScope,
      }),
    }));
  }, [month, data.month, data.todayKey, assignInputs, bannerScope]);

  /**
   * The whole page as one document (`agent-os/specs/2026-08-28-0759-budget-single-export/`).
   *
   * Registered here rather than by the three `DataGrid`s, which pass `exportCommands={false}`:
   * a budget whose parts sum to one figure should not export as three files that do not.
   * Each table contributes the columns it is actually showing, so hiding Assigned on Bills
   * still drops it from that section and only that one.
   */
  const exportDocument = useMemo((): BudgetExportDocument | null => {
    if (!month) return null;
    return budgetExportDocument({
      month,
      accountPoolCents:
        data.month === monthKeyOf(data.todayKey) ? data.accountPoolCents : undefined,
      income: sections.income,
      receivedCents: receivedThisMonthCents,
      expectedIncomeCents: forecast.comparison.income.monthlyCents,
      spendingTotals: totals,
      tables: [
        gridExportSection(
          "Regular spending",
          totalsCaption(envelopeTotals),
          envelopeGrid.columns,
          envelopeGridRows.filter((row) => row.kind === "node"),
        ),
        gridExportSection(
          "Bills",
          totalsCaption(billTotals),
          billGrid.columns,
          billGridRows.filter((row) => row.kind === "node"),
        ),
        gridExportSection(
          "Savings",
          totalsCaption(savingsTotals),
          savingsGrid.columns,
          savingsGridRows.filter((row) => row.kind === "node"),
        ),
      ],
      forecast,
      formatDate,
    });
  }, [
    month,
    data.month,
    data.todayKey,
    data.accountPoolCents,
    sections.income,
    receivedThisMonthCents,
    forecast,
    totals,
    envelopeTotals,
    billTotals,
    savingsTotals,
    envelopeGrid.columns,
    billGrid.columns,
    savingsGrid.columns,
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

  /**
   * The structure handlers, read at run time.
   *
   * Same trick as `exportCommands` above and for the same reason: these close over
   * `data.groups` / `data.categories`, so putting them in the command memo's deps would
   * rebuild — and re-register — the whole catalog on every refresh. What the commands need
   * *reactively* is only whether a row is selected, which stays a real dependency.
   */
  const structureRef = useRef({
    openComposer,
    moveRelative,
    openMoveToGroupMenu,
    newKindForFocus,
    startRename: (id: string) => setRenaming(id),
    startDelete: (row: BudgetRow) =>
      setDeleting({ kind: "category", id: row.id, name: row.name }),
  });
  useEffect(() => {
    structureRef.current = {
      openComposer,
      moveRelative,
      openMoveToGroupMenu,
      newKindForFocus,
      startRename: (id: string) => setRenaming(id),
      startDelete: (row: BudgetRow) =>
        setDeleting({ kind: "category", id: row.id, name: row.name }),
    };
  });

  const commands = useMemo((): Command[] => {
    const assignCommands: Command[] = ASSIGN_OPTIONS.map((option) => {
      const planned = assignPlans.find((entry) => entry.option === option);
      const empty =
        !planned ||
        (planned.result.listAmountCents === 0 && planned.result.lines.length === 0);
      return {
        id: `budget.assign.${option}`,
        label: ASSIGN_OPTION_LABELS[option],
        group: "view",
        menu: "tools",
        section: "Assign",
        keywords: "auto assign underfunded ynab ready",
        disabled: empty,
        title: empty ? "Nothing to change for this option" : undefined,
        run: () => {
          if (!planned) return;
          startAssign(planned.result, bannerScope);
        },
      };
    });

    // Every gesture the page grew is a declared command: a command without a menu is not
    // shipped (`navigation.md`). The row commands act on the focused table's selected row,
    // which is the same row the inspector is showing.
    const structureCommands: Command[] = [
      {
        id: "budget.envelope.new",
        label: "New envelope",
        group: "record",
        menu: "organize",
        section: "Budget",
        icon: "new",
        keywords: "create add category bucket",
        run: () =>
          structureRef.current.openComposer(
            "envelope",
            structureRef.current.newKindForFocus(),
            null,
          ),
      },
      {
        id: "budget.bill.new",
        label: "New bill",
        group: "record",
        menu: "organize",
        section: "Budget",
        icon: "new",
        keywords: "create add subscription recurring",
        title:
          "A bill starts monthly; set its real cadence and amount in the inspector",
        run: () => structureRef.current.openComposer("envelope", "bill", null),
      },
      {
        id: "budget.group.new",
        label: "New group",
        group: "record",
        menu: "organize",
        section: "Budget",
        icon: "insert-child",
        keywords: "create add folder section",
        run: () =>
          structureRef.current.openComposer(
            "group",
            structureRef.current.newKindForFocus(),
            null,
          ),
      },
      {
        id: "budget.row.rename",
        label: "Rename envelope",
        group: "record",
        menu: "organize",
        section: "Budget",
        icon: "rename",
        keywords: "name edit title",
        disabled: !selectedRow,
        title: selectedRow ? undefined : "Select an envelope first",
        run: () => selectedRow && structureRef.current.startRename(selectedRow.id),
      },
      {
        id: "budget.row.move-up",
        label: "Move envelope up",
        group: "record",
        menu: "organize",
        section: "Budget",
        icon: "move-up",
        keywords: "reorder sort order",
        disabled: !selectedRow,
        title: selectedRow ? undefined : "Select an envelope first",
        run: () =>
          selectedRow &&
          structureRef.current.moveRelative(
            { kind: "category", id: selectedRow.id },
            -1,
          ),
      },
      {
        id: "budget.row.move-down",
        label: "Move envelope down",
        group: "record",
        menu: "organize",
        section: "Budget",
        icon: "move-down",
        keywords: "reorder sort order",
        disabled: !selectedRow,
        title: selectedRow ? undefined : "Select an envelope first",
        run: () =>
          selectedRow &&
          structureRef.current.moveRelative(
            { kind: "category", id: selectedRow.id },
            1,
          ),
      },
      {
        id: "budget.row.move-to-group",
        label: "Move envelope to group…",
        group: "record",
        menu: "organize",
        section: "Budget",
        icon: "convert",
        keywords: "reparent nest folder",
        disabled: !selectedRow,
        title: selectedRow ? undefined : "Select an envelope first",
        run: () => selectedRow && structureRef.current.openMoveToGroupMenu(selectedRow),
      },
      {
        id: "budget.row.delete",
        label: "Delete envelope…",
        group: "record",
        menu: "organize",
        section: "Budget",
        icon: "delete",
        keywords: "remove destroy",
        disabled: !selectedRow,
        title: selectedRow ? undefined : "Select an envelope first",
        run: () => selectedRow && structureRef.current.startDelete(selectedRow),
      },
    ];

    const fixThisReason = canFixThis
      ? null
      : (fixThisUnavailableReason({
          viewedMonth: data.month,
          todayKey: data.todayKey,
          readyToAssignCents: month?.readyToAssignCents ?? 0,
        }) ?? "Ready to Assign is not negative");

    return [
      ...structureCommands,
      {
        id: "budget.review",
        label: review.length > 0 ? `Review… (${review.length})` : "Review…",
        group: "view",
        menu: "tools",
        section: "Setup",
        icon: "convert",
        keywords: "detect recurring merchant candidates bills",
        title: "Detected recurring merchants no envelope has claimed yet",
        run: () => setReviewing(true),
      },
      {
        id: "budget.fix-this",
        label: "Fix This",
        group: "view",
        menu: "tools",
        keywords: "unassign negative ready over-assigned ynab",
        disabled: fixThisReason !== null,
        title: fixThisReason ?? undefined,
        run: () => {
          if (fixThisReason) return;
          setAssigning(false);
          setFixing(true);
        },
      },
      ...assignCommands,
    ];
  }, [
    assignPlans,
    bannerScope,
    review.length,
    startAssign,
    selectedRow,
    data.month,
    data.todayKey,
    month,
    canFixThis,
  ]);

  useRegisterCommands(commands);

  if (fixing && !canFixThis) {
    setFixing(false);
  }

  if (!month) return null;

  const ctx: BudgetColumnCtx = {
    pending,
    indicators,
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
    onBalanceMenu: (row, at) => setMenu({ ...at, items: rowMenuItems(row) }),
    renamingId: renaming,
    onStartRename: (row) => setRenaming(row.id),
    onCancelRename: () => setRenaming(null),
    onRename: (row, name) => {
      setRenaming(null);
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

  /**
   * The composer strip, if it is open and it belongs to this section.
   *
   * One strip on the page at a time: it is a cursor, and two of them would leave the user
   * guessing which one Enter lands in.
   */
  function composerFor(kind: EnvelopeKind): ReactNode {
    if (!composer || composer.kind !== kind) return null;
    return (
      <StructureComposer
        key={`${composer.what}:${composer.kind}:${composer.groupId ?? "root"}`}
        target={composer}
        onCreated={() => router.refresh()}
        onClose={() => setComposer(null)}
      />
    );
  }

  /** Which section a bare "New envelope"/"New group" lands in: the one you were last in. */
  function newKindForFocus(): EnvelopeKind {
    return focusedTable === "savings" ? "savings" : "spending";
  }

  /**
   * The catalog's "Move envelope to group…", which has no cursor to open a fly-out under.
   *
   * It opens the same destination list the row menu shows, at the middle of the window —
   * the list is the whole point of the command, and reproducing it as a dialog would be a
   * second copy of the one rule (`moveDestinations`) that decides it.
   */
  function openMoveToGroupMenu(row: BudgetRow) {
    const moving: BudgetStructureRef = { kind: "category", id: row.id };
    const destinations = moveDestinations(data.groups, data.categories, moving);
    setMenu({
      x: Math.round(window.innerWidth / 2),
      y: Math.round(window.innerHeight / 3),
      items: [
        { heading: `Move ${row.name} to` },
        ...(structureParentId(moving) === null
          ? []
          : [
              {
                label: "No group",
                onSelect: () =>
                  run(() => moveBudgetStructureItemIntoGroupAction(moving, null)),
              } satisfies MenuItem,
            ]),
        ...destinations.map((entry) => ({
          label: entry.name,
          onSelect: () =>
            run(() => moveBudgetStructureItemIntoGroupAction(moving, entry.id)),
        })),
      ],
    });
  }

  const groupDepths = budgetGroupDepths(data.groups);

  /** The section a `+` on this grid creates into, and the noun the composer prints. */
  function openComposer(
    what: ComposerTarget["what"],
    kind: EnvelopeKind,
    groupId: string | null,
  ) {
    const group = groupId
      ? (data.groups.find((entry) => entry.id === groupId) ?? null)
      : null;
    setComposer({
      what,
      kind,
      groupId,
      groupName: group?.name ?? null,
      depth: groupId ? (groupDepths.get(groupId) ?? 0) + 1 : 0,
    });
  }

  /**
   * Swap one item with the sibling above or below it, inside its own parent.
   *
   * Reordering is commands rather than grid drag: `DataGrid` requires `gutter: "handle"` for
   * `rowDrag`, and the Budget tables keep the checkbox gutter and its header select-all
   * (`agent-os/specs/2026-08-27-2200-plan-gutter-drag-handle/`). Unlike the drawer's
   * desktop-only drag these also work on a phone. See D6.
   */
  function moveRelative(moving: BudgetStructureRef, direction: -1 | 1) {
    const siblings = structureSiblings(moving);
    const index = siblings.findIndex(
      (item) => item.kind === moving.kind && item.id === moving.id,
    );
    const target = siblings[index + direction];
    if (!target) return;
    run(() =>
      moveBudgetStructureItemAction(
        moving,
        { kind: target.kind, id: target.id },
        direction < 0 ? "before" : "after",
      ),
    );
  }

  function structureParentId(moving: BudgetStructureRef): string | null {
    return moving.kind === "group"
      ? (data.groups.find((entry) => entry.id === moving.id)?.parentGroupId ?? null)
      : (data.categories.find((entry) => entry.id === moving.id)?.groupId ?? null);
  }

  function structureSiblings(moving: BudgetStructureRef) {
    const kind =
      moving.kind === "group"
        ? data.groups.find((entry) => entry.id === moving.id)?.kind
        : data.categories.find((entry) => entry.id === moving.id)?.kind;
    if (!kind) return [];
    return budgetSiblings(
      data.groups,
      data.categories,
      structureParentId(moving),
      kind,
    );
  }

  /**
   * Rename / Move up / Move down / Move to group… / Delete — the same five on a row and on
   * a group header, because they are the same five operations on the same structure.
   *
   * Every one of them is a declared command as well (`navigation.md`); this is the menu the
   * commands and the right-click share.
   */
  function structureMenuItems(
    moving: BudgetStructureRef,
    name: string,
    deleteBlockedReason?: string,
  ): MenuItem[] {
    const siblings = structureSiblings(moving);
    const index = siblings.findIndex(
      (item) => item.kind === moving.kind && item.id === moving.id,
    );
    const parentId = structureParentId(moving);
    const destinations = moveDestinations(data.groups, data.categories, moving);
    return [
      {
        label: "Rename",
        icon: "rename",
        onSelect: () => setRenaming(moving.id),
      },
      {
        label: "Move up",
        icon: "move-up",
        disabled: index <= 0,
        title: index <= 0 ? `${name} is already first here` : undefined,
        onSelect: () => moveRelative(moving, -1),
      },
      {
        label: "Move down",
        icon: "move-down",
        disabled: index < 0 || index >= siblings.length - 1,
        title:
          index >= siblings.length - 1 ? `${name} is already last here` : undefined,
        onSelect: () => moveRelative(moving, 1),
      },
      {
        label: "Move to group",
        icon: "convert",
        disabled: destinations.length === 0 && parentId === null,
        title:
          destinations.length === 0 && parentId === null
            ? "There is no other group this can go in"
            : undefined,
        items: [
          ...(parentId === null
            ? []
            : [
                {
                  label: moving.kind === "group" ? "Top level" : "No group",
                  onSelect: () =>
                    run(() => moveBudgetStructureItemIntoGroupAction(moving, null)),
                },
                "separator" as const,
              ]),
          ...destinations.map((entry) => ({
            label: entry.name,
            onSelect: () =>
              run(() => moveBudgetStructureItemIntoGroupAction(moving, entry.id)),
          })),
        ],
      },
      "separator",
      {
        label: "Delete…",
        icon: "delete",
        destructive: true,
        disabled: deleteBlockedReason !== undefined,
        title: deleteBlockedReason,
        onSelect: () => setDeleting({ ...moving, name }),
      },
    ];
  }

  /** Empty-only delete, and the reason when it is not. Groups hold no money; rows do. */
  function groupDeleteBlockedReason(groupId: string): string | undefined {
    const hasChildren =
      data.groups.some((entry) => entry.parentGroupId === groupId) ||
      data.categories.some((entry) => entry.groupId === groupId);
    return hasChildren
      ? "Move every subgroup and envelope out before deleting"
      : undefined;
  }

  function groupMenuItems(groupId: string, kind: EnvelopeKind): MenuItem[] {
    const group = data.groups.find((entry) => entry.id === groupId);
    const name = group?.name ?? "this group";
    return [
      // Only this group's own kind: a group is in exactly one table and holds only what
      // belongs in it (`agent-os/specs/2026-08-28-1613-group-kind/` D2).
      {
        label: `New ${KIND_LABELS[kind].toLowerCase()} here`,
        icon: "new",
        onSelect: () => openComposer("envelope", kind, groupId),
      },
      {
        label: "New subgroup here",
        icon: "insert-child",
        onSelect: () => openComposer("group", kind, groupId),
      },
      "separator",
      ...structureMenuItems(
        { kind: "group", id: groupId },
        name,
        groupDeleteBlockedReason(groupId),
      ),
    ];
  }

  /**
   * The `+` and `⋮` a group header carries, rendered by the host through `groupChrome`.
   *
   * Every click here stops propagation: the whole header row is the collapse toggle, so a
   * `+` that let its click through would collapse the group it was meant to add to.
   */
  function groupChromeFor(groupId: string, kind: EnvelopeKind): ReactNode {
    const group = data.groups.find((entry) => entry.id === groupId);
    if (renaming === groupId) {
      return (
        <span
          className="ml-2 flex min-w-0 flex-1 items-center"
          onClick={(event) => event.stopPropagation()}
        >
          <GroupRenameInput
            initial={group?.name ?? ""}
            disabled={pending}
            onCommit={(name) => {
              setRenaming(null);
              const trimmed = name.trim();
              if (trimmed === "" || trimmed === group?.name) return;
              run(() => renameCategoryGroupAction(groupId, trimmed));
            }}
            onCancel={() => setRenaming(null)}
          />
        </span>
      );
    }
    return (
      <span className="ml-auto flex shrink-0 items-center gap-0.5 pl-2">
        <button
          type="button"
          aria-label={`Add to ${data.groups.find((entry) => entry.id === groupId)?.name ?? "group"}`}
          title="Add an envelope in this group"
          className="rounded px-1.5 py-0.5 text-[0.875rem] leading-none font-normal text-ink-muted hover:bg-surface hover:text-ink"
          onClick={(event) => {
            event.stopPropagation();
            openComposer("envelope", kind, groupId);
          }}
        >
          +
        </button>
        <button
          type="button"
          aria-label={`Actions for ${data.groups.find((entry) => entry.id === groupId)?.name ?? "group"}`}
          className="rounded px-1.5 py-0.5 text-[0.875rem] leading-none font-normal text-ink-muted hover:bg-surface hover:text-ink"
          onClick={(event) => {
            event.stopPropagation();
            const bounds = event.currentTarget.getBoundingClientRect();
            setMenu({
              x: bounds.left,
              y: bounds.bottom,
              items: groupMenuItems(groupId, kind),
            });
          }}
        >
          ⋮
        </button>
      </span>
    );
  }

  function rowMenuItems(row: BudgetRow): MenuItem[] {
    const sources = coverSources(rows, row.id);
    const ref = { id: row.id, name: row.name };
    const overspent = row.balanceCents < 0;
    const snoozeReason = snoozeUnavailableReason(
      row,
      data.month,
      monthKeyOf(data.todayKey),
    );

    return [
      {
        label: "Cover overspending from",
        // Unavailable is disabled with the reason, never absent (`navigation.md`).
        title: overspent
          ? undefined
          : `${row.name} is not overspent, so there is nothing to cover`,
        disabled:
          !overspent || (sources.length === 0 && month!.readyToAssignCents <= 0),
        items: [
          {
            label: `Ready to Assign (${formatUsd(Math.max(0, month!.readyToAssignCents))})`,
            disabled: month!.readyToAssignCents <= 0,
            title:
              month!.readyToAssignCents <= 0
                ? "Nothing is left to assign this month"
                : undefined,
            onSelect: () =>
              run(() =>
                budgetOperationAction({
                  kind: "cover",
                  month: data.month,
                  from: null,
                  to: ref,
                }),
              ),
          },
          ...sources.map((source) => ({
            label: `${source.name} (${formatUsd(source.balanceCents)})`,
            onSelect: () =>
              run(() =>
                budgetOperationAction({
                  kind: "cover",
                  month: data.month,
                  from: { id: source.id, name: source.name },
                  to: ref,
                }),
              ),
          })),
        ],
      },
      {
        label: "Move money to…",
        disabled: row.balanceCents <= 0,
        title:
          row.balanceCents <= 0 ? `${row.name} has nothing in it to move` : undefined,
        onSelect: () => setMove({ from: row, targets: moveTargets(rows, row.id) }),
      },
      "separator",
      {
        label: row.carryover
          ? "Stop rolling overspending forward"
          : "Roll overspending forward",
        title: `Applies to ${monthLabel(data.month)} and every later month. ${
          row.carryover
            ? "Overspending will go back to reducing Ready to Assign."
            : "Overspending stays in this envelope instead of reducing Ready to Assign."
        }`,
        onSelect: () =>
          run(() => setCarryoverAction(data.month, row.id, !row.carryover)),
      },
      {
        label: row.snoozed
          ? "Stop snoozing"
          : `Snooze target for ${monthName(data.month)}`,
        // Unavailable is disabled with the reason, and it is the *same* reason the mutation
        // rejects with (`snoozeUnavailableReason`), so the two cannot drift apart.
        disabled: snoozeReason !== null,
        title:
          snoozeReason ??
          (row.snoozed
            ? `${row.name} will ask for its target again.`
            : `${row.name} stops asking for the rest of ${monthName(data.month)}. It lapses on its own next month.`),
        onSelect: () =>
          run(() => setTargetSnoozeAction(data.month, row.id, !row.snoozed)),
      },
      "separator",
      {
        label: "Edit target…",
        title: row.isIncome
          ? "Income feeds Ready to Assign, so it holds no target"
          : `What ${row.name} should ask for each month`,
        disabled: row.isIncome,
        onSelect: () => setEditing(row.id),
      },
      {
        label: "Assign",
        disabled: row.isIncome,
        title: row.isIncome
          ? "Income feeds Ready to Assign, so it is never assigned"
          : `Auto-assign options for ${row.name} only`,
        items: ASSIGN_OPTIONS.map((option) => ({
          label: ASSIGN_OPTION_LABELS[option],
          onSelect: () => {
            if (!month) return;
            const result = planAssign({
              option,
              month: data.month,
              todayKey: data.todayKey,
              readyToAssignCents: month.readyToAssignCents,
              envelopes: assignInputs.envelopes,
              bills: assignInputs.bills,
              history: assignInputs.history,
              categoryIds: [row.id],
            });
            startAssign(result, [row.id]);
          },
        })),
      },
      ...(row.bill
        ? ([
            "separator" as const,
            {
              label: "Edit payees…",
              title: "Charges from these payees belong to this bill",
              onSelect: () => setEditingPayeesFor(row),
            },
            {
              label: "Open URL",
              disabled: row.bill.url === "",
              title: row.bill.url === "" ? "No URL saved for this bill" : row.bill.url,
              onSelect: () => window.open(withScheme(row.bill!.url), "_blank"),
            },
          ] satisfies MenuItem[])
        : []),
      "separator",
      {
        label: "Change section",
        icon: "convert",
        title: `Which table ${row.name} lives in`,
        items: SECTION_CHOICES.map((choice) => ({
          label: choice.label,
          icon: choice.kind === row.kind ? ("complete" as const) : undefined,
          disabled: choice.kind === row.kind,
          title: choice.kind === row.kind ? `${row.name} is already here` : undefined,
          onSelect: () =>
            run(() => updateBudgetCategoryAction(row.id, { kind: choice.kind })),
        })),
      },
      {
        label: row.hidden ? "Show envelope" : "Hide envelope",
        title: "A hidden envelope keeps its history and still counts toward the totals",
        onSelect: () =>
          run(() => updateBudgetCategoryAction(row.id, { hidden: !row.hidden })),
      },
      "separator",
      ...structureMenuItems({ kind: "category", id: row.id }, row.name),
    ];
  }

  const editingRow = rows.find((row) => row.id === editing) ?? null;
  const backlog = data.uncategorizedCount;

  /**
   * A group header's own subtotal, over the rows that group contributes to this section,
   * keyed to the columns it totals. No word labels: Assigned / Activity / Available are
   * directly above each figure, and a pack-versus-pack comparison is a glance down one
   * column rather than a hunt through a run of prose.
   */
  function groupTotals(
    sectionRows: readonly BudgetRow[],
    groupId: string,
  ): Record<string, ReactNode> | null {
    const ids = descendantEnvelopeIds(data.groups, data.categories, groupId);
    const mine = sectionRows.filter((row) => ids.has(row.id));
    if (mine.length === 0) return null;
    const group = budgetTotals(mine);
    return {
      assigned: formatUsd(group.assignedCents),
      activity: formatUsd(group.activityCents),
      balance: formatUsd(group.balanceCents),
    };
  }

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
      indicator={selectedRow ? (indicators.get(selectedRow.id) ?? null) : null}
      pending={pending}
      onPatchBill={(row, patch) => ctx.onPatchBill(row, patch)}
      onNotes={(row, notes) => run(() => updateBudgetCategoryAction(row.id, { notes }))}
      onAssignUnderfunded={(row) => {
        const result = planAssign({
          option: "underfunded",
          month: data.month,
          todayKey: data.todayKey,
          readyToAssignCents: month.readyToAssignCents,
          envelopes: assignInputs.envelopes,
          bills: assignInputs.bills,
          history: assignInputs.history,
          categoryIds: [row.id],
        });
        startAssign(result, [row.id]);
      }}
      onEditTarget={(row) => setEditing(row.id)}
      currentMonth={monthKeyOf(data.todayKey)}
      onSnooze={(row) =>
        run(() => setTargetSnoozeAction(data.month, row.id, !row.snoozed))
      }
      onEditPayees={(row) => setEditingPayeesFor(row)}
      evidence={evidence}
      selectedPayeeIds={evidenceSelection}
      onTogglePayee={(payeeId) => {
        if (!selectedId) return;
        setSelectedPayees({
          categoryId: selectedId,
          ids: evidenceSelection.includes(payeeId)
            ? evidenceSelection.filter((id) => id !== payeeId)
            : [...evidenceSelection, payeeId],
        });
      }}
      onMergePayees={() => {
        const picked = (evidence ?? []).filter((entry) =>
          evidenceSelection.includes(entry.payeeId),
        );
        if (picked.length < 2) return;
        setMergingPayees(
          picked.map((entry) => ({ id: entry.payeeId, name: entry.name })),
        );
      }}
      onRemovePayeeRouting={(entry) => {
        run(async () => {
          const result = await clearPayeeRoutingAction(entry.payeeId);
          if (result.ok) refreshEvidence();
          return result;
        });
      }}
      onFileWaiting={(entry) => setFiling(entry)}
    />
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-3 px-3 pt-3">
        <MonthBar
          month={month}
          onPrev={() => goToMonth(prevMonthKey(data.month))}
          onNext={() => goToMonth(nextMonthKey(data.month))}
          pending={pending}
          onRelease={
            month.bufferedCents > 0
              ? () =>
                  run(() =>
                    budgetOperationAction({
                      kind: "release-hold",
                      month: data.month,
                    }),
                  )
              : undefined
          }
          showHidden={showHidden}
          onShowHidden={(next) => {
            billGrid.setSwitch("show-hidden", next);
            envelopeGrid.setSwitch("show-hidden", next);
            savingsGrid.setSwitch("show-hidden", next);
          }}
        />

        <BudgetSummary
          month={month}
          accountPoolCents={
            data.month === monthKeyOf(data.todayKey) ? data.accountPoolCents : undefined
          }
          action={canFixThis ? "fix-this" : "assign"}
          onAction={() => {
            if (canFixThis) {
              setAssigning(false);
              setFixing(true);
            } else {
              setFixing(false);
              setAssigning(true);
            }
          }}
        />
        {isFutureBudgetMonth(data.month, data.todayKey) ? (
          <p className="text-[0.75rem] leading-snug text-ink-muted">
            Money assigned here is a job for {monthLabel(data.month)} and leaves Ready
            to Assign now.
            {currentMonthUnderfundedGap({
              months: data.months,
              todayKey: data.todayKey,
              groups: data.groups,
              categories: data.categories,
              goals: data.goals,
              nextDueKeys,
            }) > 0
              ? " This month still has envelopes to cover — those holes are the first job."
              : ""}
          </p>
        ) : null}
      </div>

      <div className="flex min-h-0 min-w-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-auto p-3">
          <IncomeSection
            rows={sections.income}
            receivedCents={receivedThisMonthCents}
            expectedCents={forecast.comparison.income.monthlyCents}
            onNew={() => openComposer("envelope", "income", null)}
            composer={composerFor("income")}
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

          {notice ? (
            <p
              role="status"
              className="flex items-start gap-3 rounded border border-rule bg-surface px-3 py-2 text-[0.8125rem] text-ink"
            >
              <span className="min-w-0 flex-1">{notice}</span>
              <button
                type="button"
                onClick={() => setNotice(null)}
                aria-label="Dismiss"
                className="flex-none rounded px-1 text-ink-muted hover:bg-surface-raised hover:text-ink"
              >
                ×
              </button>
            </p>
          ) : null}

          {backlog > 0 ? <Backlog data={data} /> : null}

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
                  Bills + regular. Savings is held out so a house fund is not an
                  overspend.
                </p>
              </div>
              {/* Leading labels and `text-ink` figures, where the sections below use a
                quieter trailing-label run: this is the line that has to be believed, so it
                stays heavier than the subtotals it sums. */}
              <span className="tabular flex flex-wrap gap-x-5 text-[0.8125rem]">
                <span className="text-ink-muted">
                  Assigned{" "}
                  <span className="text-ink">{formatUsd(totals.assignedCents)}</span>
                </span>
                <span className="text-ink-muted">
                  Spent{" "}
                  <span className="text-ink">{formatUsd(totals.activityCents)}</span>
                </span>
                <span className="text-ink-muted">
                  Left{" "}
                  <span className="text-ink">{formatUsd(totals.balanceCents)}</span>
                </span>
              </span>
            </header>

            <BudgetSection
              title="Regular spending"
              caption="Everything that is not a bill. Assign what you have; Available is what is left."
              totals={envelopeTotals}
              focused={focusedTable === "envelopes"}
              onFocus={() => setFocusedTable("envelopes")}
              newItems={[
                {
                  label: "Envelope",
                  onSelect: () => openComposer("envelope", "spending", null),
                },
                {
                  label: "Group",
                  onSelect: () => openComposer("group", "spending", null),
                },
              ]}
              composer={composerFor("spending")}
            >
              <DataGrid<BudgetColumnCtx, BudgetRow>
                rows={envelopeGridRows}
                columns={envelopeGrid.columns}
                allColumns={envelopeColumns}
                columnCtx={ctx}
                selectedId={envelopeSelect.selectedId}
                selectedIds={envelopeSelect.selectedIds}
                selectAllState={envelopeSelect.headerState}
                onToggleSelectAll={envelopeSelect.toggleSelectAll}
                onSelect={(id, mods) => {
                  setFocusedTable("envelopes");
                  envelopeSelect.select(id, mods);
                }}
                onOpenDetail={() => setInspecting(true)}
                exportCommands={false}
                /*
                 * The same menu the Available cell opens, reachable by right-click and — the
                 * reason it is here — by long-press on a phone, where the compact row draws the
                 * amount as a chip, not a button. Without it cover/move would exist only on
                 * desktop.
                 */
                rowMenu={(rowId) => {
                  const row = rows.find((candidate) => candidate.id === rowId);
                  return row ? rowMenuItems(row) : [];
                }}
                ariaLabel={`Envelopes for ${monthLabel(data.month)}`}
                empty="No envelopes yet."
                widths={envelopeGrid.widths}
                onResizeColumn={envelopeGrid.setWidth}
                onResetColumnWidth={envelopeGrid.clearWidth}
                columnControls={envelopeGrid.columnControls}
                collapsedGroups={envelopeGrid.collapsedGroups}
                onToggleGroup={envelopeGrid.toggleGroup}
                density={envelopeGrid.density}
                autoHeight
                rowLabel={(row) => `Envelope: ${row.node.name}`}
                groupTotals={(_nodes, header) =>
                  groupTotals(sections.envelopes, header.id)
                }
                groupChrome={(header) => groupChromeFor(header.id, "spending")}
              />
            </BudgetSection>

            <BudgetSection
              title="Bills"
              caption="Each funds itself from its own cadence — Assign → Underfunded fills what this month owes."
              totals={billTotals}
              focused={focusedTable === "bills"}
              onFocus={() => setFocusedTable("bills")}
              newItems={[
                {
                  label: "Bill",
                  onSelect: () => openComposer("envelope", "bill", null),
                },
                { label: "Group", onSelect: () => openComposer("group", "bill", null) },
              ]}
              composer={composerFor("bill")}
            >
              <DataGrid<BudgetColumnCtx, BudgetBillRow>
                rows={billGridRows}
                columns={billGrid.columns}
                allColumns={billColumns}
                columnCtx={ctx}
                selectedId={billSelect.selectedId}
                selectedIds={billSelect.selectedIds}
                selectAllState={billSelect.headerState}
                onToggleSelectAll={billSelect.toggleSelectAll}
                onSelect={(id, mods) => {
                  setFocusedTable("bills");
                  billSelect.select(id, mods);
                }}
                onOpenDetail={() => setInspecting(true)}
                exportCommands={false}
                rowMenu={(rowId) => {
                  const row = rows.find((candidate) => candidate.id === rowId);
                  return row ? rowMenuItems(row) : [];
                }}
                ariaLabel={`Bills for ${monthLabel(data.month)}`}
                empty="No bills yet — Review proposes them from what actually charges you."
                widths={billGrid.widths}
                onResizeColumn={billGrid.setWidth}
                onResetColumnWidth={billGrid.clearWidth}
                columnControls={billGrid.columnControls}
                collapsedGroups={billGrid.collapsedGroups}
                onToggleGroup={billGrid.toggleGroup}
                density={billGrid.density}
                autoHeight
                rowLabel={(row) => `Bill: ${row.node.name}`}
                groupTotals={(_nodes, header) => groupTotals(sections.bills, header.id)}
                groupChrome={(header) => groupChromeFor(header.id, "bill")}
              />
            </BudgetSection>
          </section>

          <BudgetSection
            title="Savings"
            caption="Assigned money that is not a monthly expense. Held out of the Spending total so a house fund is not an overspend."
            totals={savingsTotals}
            level="h2"
            focused={focusedTable === "savings"}
            onFocus={() => setFocusedTable("savings")}
            newItems={[
              {
                label: "Envelope",
                onSelect: () => openComposer("envelope", "savings", null),
              },
              {
                label: "Group",
                onSelect: () => openComposer("group", "savings", null),
              },
            ]}
            composer={composerFor("savings")}
          >
            <DataGrid<BudgetColumnCtx, BudgetRow>
              rows={savingsGridRows}
              columns={savingsGrid.columns}
              allColumns={envelopeColumns}
              columnCtx={ctx}
              selectedId={savingsSelect.selectedId}
              selectedIds={savingsSelect.selectedIds}
              selectAllState={savingsSelect.headerState}
              onToggleSelectAll={savingsSelect.toggleSelectAll}
              onSelect={(id, mods) => {
                setFocusedTable("savings");
                savingsSelect.select(id, mods);
              }}
              onOpenDetail={() => setInspecting(true)}
              exportCommands={false}
              rowMenu={(rowId) => {
                const row = rows.find((candidate) => candidate.id === rowId);
                return row ? rowMenuItems(row) : [];
              }}
              ariaLabel={`Savings for ${monthLabel(data.month)}`}
              empty="No savings envelopes yet — add one with + Envelope above."
              widths={savingsGrid.widths}
              onResizeColumn={savingsGrid.setWidth}
              onResetColumnWidth={savingsGrid.clearWidth}
              columnControls={savingsGrid.columnControls}
              collapsedGroups={savingsGrid.collapsedGroups}
              onToggleGroup={savingsGrid.toggleGroup}
              density={savingsGrid.density}
              autoHeight
              rowLabel={(row) => `Savings: ${row.node.name}`}
              groupTotals={(_nodes, header) => groupTotals(sections.savings, header.id)}
              groupChrome={(header) => groupChromeFor(header.id, "savings")}
            />
          </BudgetSection>

          <ForecastDetails months={forecast.months} comparison={forecast.comparison} />
        </div>

        <aside
          className="hidden min-h-0 w-80 shrink-0 flex-col overflow-hidden border-l border-rule bg-surface md:flex"
          aria-label="Category details"
        >
          {inspector}
        </aside>
      </div>

      {compact && inspecting && selectedRow ? (
        <Drawer open onClose={() => setInspecting(false)} labelledBy={inspectorTitleId}>
          <DrawerHeader
            titleId={inspectorTitleId}
            title={selectedRow?.name ?? "Details"}
            onClose={() => setInspecting(false)}
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
          envelope={envelopeInput(editingRow)}
          month={data.month}
          todayKey={data.todayKey}
          history={assignInputs.history}
          bills={assignInputs.bills}
          onClose={() => setEditing(null)}
          onSaved={() => router.refresh()}
        />
      ) : null}

      {move ? (
        <MoveMoneyDialog
          from={move.from}
          targets={move.targets}
          onCancel={() => setMove(null)}
          onMove={(toId, cents) => {
            const target = move.targets.find((row) => row.id === toId);
            setMove(null);
            if (!target) return;
            run(() =>
              budgetOperationAction({
                kind: "transfer",
                month: data.month,
                from: { id: move.from.id, name: move.from.name },
                to: { id: target.id, name: target.name },
                amountCents: cents,
              }),
            );
          }}
        />
      ) : null}
      {fixing && canFixThis ? (
        <FixThisDialog
          viewedMonth={data.month}
          months={data.months}
          groups={data.groups}
          categories={data.categories}
          showHidden={showHidden}
          pending={pending}
          onCancel={() => setFixing(false)}
          onUnassign={(sourceMonth, from, amountCents) =>
            run(() =>
              budgetOperationAction({
                kind: "unassign",
                month: sourceMonth,
                from,
                amountCents,
              }),
            )
          }
        />
      ) : null}
      {assigning && !preview ? (
        <AssignDialog
          readyToAssignCents={month.readyToAssignCents}
          options={assignPlans}
          envelopes={[
            ...sections.envelopes.map((row) => ({
              id: row.id,
              name: row.name,
              section: "Regular spending" as const,
            })),
            ...sections.bills.map((row) => ({
              id: row.id,
              name: row.name,
              section: "Bills" as const,
            })),
            ...sections.savings.map((row) => ({
              id: row.id,
              name: row.name,
              section: "Savings" as const,
            })),
          ]}
          pending={pending}
          onCancel={() => setAssigning(false)}
          onPickOption={(option) => {
            const planned = assignPlans.find((entry) => entry.option === option);
            if (!planned) return;
            startAssign(planned.result, bannerScope);
          }}
          onManual={(categoryId, amountCents) => {
            const target = rows.find((row) => row.id === categoryId);
            setAssigning(false);
            if (!target) return;
            run(() =>
              budgetOperationAction({
                kind: "assign-remaining",
                month: data.month,
                to: { id: target.id, name: target.name },
                amountCents,
              }),
            );
          }}
        />
      ) : null}
      {preview ? (
        <AssignPreviewDialog
          result={preview}
          pending={pending}
          onCancel={() => setPreview(null)}
          onConfirm={() => commitAssign(preview.option, previewScope)}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        title={
          deleting?.kind === "group"
            ? "Delete this empty group?"
            : "Delete this envelope?"
        }
        message={
          deleting?.kind === "group"
            ? `Delete ${deleting.name}? Only empty groups can be deleted.`
            : `Delete ${deleting?.name ?? "this envelope"}? Its transactions remain and return to the backlog.`
        }
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const target = deleting;
          setDeleting(null);
          if (!target) return;
          run(() =>
            target.kind === "group"
              ? deleteCategoryGroupAction(target.id)
              : deleteBudgetCategoryAction(target.id),
          );
        }}
      />
      {reviewing ? (
        <ReviewDrawer
          review={review}
          todayKey={data.todayKey}
          onClose={() => setReviewing(false)}
          onSaved={(message) => {
            setNotice(message);
            router.refresh();
          }}
        />
      ) : null}
      {mergingPayees ? (
        <PayeeMergeDialog
          payees={mergingPayees}
          onClose={() => setMergingPayees(null)}
          onMerged={(message) => {
            setMergingPayees(null);
            setSelectedPayees(null);
            setNotice(message);
            refreshEvidence();
            router.refresh();
          }}
        />
      ) : null}
      {filing && selectedRow ? (
        <ConfirmDialog
          open
          title="File the waiting charges?"
          message={`File ${filing.unfiledCount.toLocaleString()} waiting ${filing.name} ${
            filing.unfiledCount === 1 ? "charge" : "charges"
          } into ${selectedRow.name}? Charges already in another envelope are left alone.`}
          confirmLabel={`File ${filing.unfiledCount.toLocaleString()}`}
          onCancel={() => setFiling(null)}
          onConfirm={() => {
            const entry = filing;
            const envelope = selectedRow;
            setFiling(null);
            run(async () => {
              const result = await fileWaitingChargesAction(entry.payeeId, envelope.id);
              if (result.ok) {
                setNotice(
                  `${result.data?.filed.toLocaleString() ?? 0} ${entry.name} charges filed into ${envelope.name}.`,
                );
                refreshEvidence();
              }
              return result;
            });
          }}
        />
      ) : null}
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

function MonthBar({
  month,
  onPrev,
  onNext,
  onRelease,
  pending,
  showHidden,
  onShowHidden,
}: {
  month: BudgetMonth;
  onPrev: () => void;
  onNext: () => void;
  onRelease?: () => void;
  pending: boolean;
  showHidden: boolean;
  onShowHidden: (next: boolean) => void;
}) {
  const button =
    "rounded border border-rule px-2 py-1 text-[0.8125rem] text-ink hover:bg-surface-raised disabled:opacity-60";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={onPrev} className={button} title="Previous month">
        ←
      </button>
      <span className="min-w-[9rem] text-[0.9375rem] font-medium text-ink">
        {monthLabel(month.month)}
      </span>
      <button type="button" onClick={onNext} className={button} title="Next month">
        →
      </button>

      <span className="ml-auto flex flex-wrap gap-2">
        <label className="flex min-h-tap items-center gap-2 px-1 text-[0.8125rem] text-ink md:min-h-0">
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(event) => onShowHidden(event.target.checked)}
          />
          Show hidden
        </label>
        {onRelease && month.bufferedCents > 0 ? (
          <button
            type="button"
            onClick={onRelease}
            disabled={pending}
            className={button}
            title="Put the leftover held money back into this month's Ready to Assign"
          >
            Release {formatUsd(month.bufferedCents)}
          </button>
        ) : null}
      </span>
    </div>
  );
}

/**
 * Uncategorized on-budget rows since the budget started.
 *
 * Current Ready to Assign names their signed total as its own term until they receive
 * envelopes. Categorizing one moves it from that term into its envelope without breaking
 * the pool identity.
 */
/**
 * A group header's name, while it is being renamed.
 *
 * Same contract as the row cells (`budgetColumns.tsx`): Enter or blur commits, Escape
 * reverts. It renders beside the header's own label rather than replacing it, because the
 * label belongs to `GroupHeader` and `groupChrome` is a slot after it — the old name staying
 * visible reads as "renaming this", which is what is happening.
 */
function GroupRenameInput({
  initial,
  disabled,
  onCommit,
  onCancel,
}: {
  initial: string;
  disabled: boolean;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const cancelled = useRef(false);
  return (
    <input
      autoFocus
      aria-label={`Name for ${initial}`}
      value={value}
      disabled={disabled}
      className="w-full min-w-0 rounded border border-select-edge bg-surface px-1 py-0.5 font-normal text-ink"
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        if (cancelled.current) return;
        onCommit(value);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          onCommit(value);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          cancelled.current = true;
          onCancel();
        }
      }}
    />
  );
}

function Backlog({ data }: { data: BudgetData }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-rule bg-surface-raised px-3 py-2 text-[0.8125rem]">
      <a
        href="/finances/register?view=uncategorized"
        className="text-ink hover:underline"
      >
        {data.uncategorizedCount}{" "}
        {data.uncategorizedCount === 1 ? "transaction has" : "transactions have"} no
        category
        {/* The backlog spans the whole budget, not the month on screen. Unqualified, it
            reads as September's when you have paged forward — and this figure is the one
            that explains the gap between the budget and the bank, so it has to say what it
            is counting. */}
        {data.settings.startMonth
          ? ` since ${monthLabel(data.settings.startMonth)}`
          : ""}
      </a>
      <span className="tabular text-ink-muted">
        {formatUsd(data.uncategorizedCents)} unaccounted for
      </span>
      <span className="ml-auto flex gap-2">
        <a
          href="/finances/register?view=uncategorized"
          className="rounded border border-rule px-2 py-1 text-ink hover:bg-surface"
        >
          Categorize
        </a>
      </span>
    </div>
  );
}

/**
 * A table, its heading and its own subtotal, as one card.
 *
 * The subtotal sits above the grid rather than in a footer under it so the tables read the
 * same way when one of them is empty, and so the page keeps exactly one full-width footer —
 * the combined one, which is the figure that has to be believed
 * (`agent-os/specs/2026-08-26-2159-grid-aggregation-placement/` D4).
 *
 * The card is what makes that placement legible. These sections used to be a flat `gap-3`
 * stack, so a header sat the same distance from its own grid as from the grid above it and
 * pointed at neither; its full-width bottom rule then read as a divider between two tables
 * rather than a cap on one. Containment fixes that without moving a single figure.
 *
 * The grid runs to the card's left and right edges on purpose: `GroupHeader` drops its left
 * padding so group totals stay in their column tracks and rows carry their own `pr-3`, so
 * padding the card body would inset the grid against tuning that already exists.
 *
 * Do not add `overflow-hidden` here. It would make the card a scroll container and break the
 * column header's `sticky top-0`, which sticks to the page scroller.
 *
 * Last-interacted: the ring is what makes `focusedTable` (Assign + File ▸ Export) visible, and
 * it now rings the whole card so the heading it belongs to is inside it. `onFocusCapture` so
 * clicking the header or empty area counts, not only a row.
 */
function BudgetSection({
  title,
  caption,
  totals,
  level = "h3",
  focused,
  onFocus,
  newItems,
  composer,
  children,
}: {
  title: string;
  caption: string;
  totals: { assignedCents: number; activityCents: number; balanceCents: number };
  /** `h2` for a top-level section — Savings is a peer of Spending, not of Bills. */
  level?: "h2" | "h3";
  focused: boolean;
  onFocus: () => void;
  /** `+ Envelope` / `+ Bill` / `+ Group` — the create gestures for this section's root. */
  newItems?: readonly { label: string; onSelect: () => void }[];
  /** The open composer strip, rendered under the grid rather than inside it (D4). */
  composer?: ReactNode;
  children: ReactNode;
}) {
  const Heading = level;
  return (
    <section
      aria-label={title}
      onFocusCapture={onFocus}
      /* `shrink-0`: a flex item allowed to shrink below its content collapses the grid to one row. */
      className={`flex min-w-0 shrink-0 flex-col rounded border bg-surface ${
        focused
          ? "border-select-edge ring-1 ring-select-edge ring-inset"
          : "border-rule"
      }`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule px-3 py-2">
        <div className="min-w-0">
          <Heading
            className={
              level === "h2"
                ? "text-[1rem] font-semibold text-ink"
                : "text-[0.9375rem] font-medium text-ink"
            }
          >
            {title}
          </Heading>
          <p className="text-[0.75rem] text-ink-muted">{caption}</p>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="tabular flex flex-wrap gap-x-4 text-[0.75rem] text-ink-muted">
            <span>{formatUsd(totals.assignedCents)} assigned</span>
            <span>{formatUsd(totals.activityCents)} spent</span>
            <span>{formatUsd(totals.balanceCents)} left</span>
          </span>
          {/* Real buttons, not a hover affordance: every gesture needs a tappable path
              below `md` (`components/responsive.md`). */}
          {newItems && newItems.length > 0 ? (
            <span className="flex flex-wrap gap-1">
              {newItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.onSelect}
                  className="rounded border border-rule px-2 py-0.5 text-[0.75rem] text-ink hover:bg-surface-raised"
                >
                  + {item.label}
                </button>
              ))}
            </span>
          ) : null}
        </div>
      </header>
      {children}
      {composer}
    </section>
  );
}

/**
 * What came in this month, beside what a typical month brings.
 *
 * No Assigned and no Available: income is not budgeted, it is the thing being budgeted
 * (`agent-os/specs/2026-08-23-2313-one-budget/` D7). Expected is a forecast from the payday
 * series and is deliberately not assignable — you assign money you have, which is why the
 * caption says so rather than leaving the two figures to be read as interchangeable.
 */
function IncomeSection({
  rows,
  receivedCents,
  expectedCents,
  onNew,
  composer,
}: {
  rows: readonly BudgetRow[];
  receivedCents: number;
  expectedCents: number;
  /** Income is a list, not a grid, but it creates envelopes the same way the tables do. */
  onNew: () => void;
  composer?: ReactNode;
}) {
  return (
    <section className="rounded border border-rule bg-surface px-3 py-2">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[0.9375rem] font-medium text-ink">Income</h2>
        <span className="tabular flex flex-wrap gap-x-4 text-[0.8125rem]">
          <span className="text-ink-muted">
            Received <span className="text-ink">{formatUsd(receivedCents)}</span>
          </span>
          <span
            className="text-ink-muted"
            title="A forecast from your payday series, not money you have."
          >
            Expected <span className="text-ink">{formatUsd(expectedCents)}</span>/mo
          </span>
          <button
            type="button"
            onClick={onNew}
            className="rounded border border-rule px-2 py-0.5 text-[0.75rem] text-ink hover:bg-surface-raised"
          >
            + Envelope
          </button>
        </span>
      </header>
      {rows.length > 0 ? (
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[0.75rem] text-ink-muted">
          {rows.map((row) => (
            <li key={row.id}>
              {row.name}{" "}
              <span className="tabular text-ink">{formatUsd(row.activityCents)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-1 text-[0.7rem] text-ink-faint">
        Ready to Assign is unassigned money from every on-budget account, including
        income already received. Moving money to a savings account does not assign it.
      </p>
      {composer}
    </section>
  );
}
