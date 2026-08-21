"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useViewStateUrl } from "@/components/url/useViewStateUrl";
import type { Payday } from "@/lib/finances/classify/income";
import type { BillCharge } from "@/lib/finances/available";
import type { RecurringMerchant } from "@/lib/finances/analytics";
import {
  projectForwardMonths,
  projectForwardPayPeriods,
  unclaimedMerchants,
  type CommitmentCharge,
  type StoredBillRow,
  type StoredSpend,
} from "@/lib/finances/commitments";
import {
  activeBillTotals,
  activeSpendTotals,
  billRows as buildBillRows,
  spendRows as buildSpendRows,
  type MoneyTotals,
} from "@/lib/finances/commitmentRows";
import {
  spendingVsIncome,
  type SpendingVsIncome,
} from "@/lib/finances/expectedSpending";
import {
  COMMITMENT_GROUP_BY_VALUES,
  groupBills,
  groupSpend,
} from "@/lib/finances/commitmentGrouping";
import { nextPayday } from "@/lib/finances/available";
import { PAYDAY_SCOPE } from "@/lib/settings/scopes";
import { PAYDAY_CODEC } from "../paydaySetting";
import { cadenceOf, type Cadence } from "@/lib/finances/recurringBills";
import { CadenceSelect } from "../CadenceSelect";
import { formatUsd } from "@/lib/finances/money";
import {
  deleteCommitmentAction,
  renameRecurringBillAction,
  renameRecurringSpendAction,
  setRecurringBillAction,
  setRecurringSpendAction,
} from "@/app/finances/actions";
import { INSERT_AFTER } from "@/lib/commands/chords";
import { dualGridViewCommands } from "@/lib/commands/gridViewCommands";
import type { Command } from "@/lib/commands/registry";
import { hasAnyNarrowing } from "@/lib/settings/grid";
import { useRegisterCommands } from "@/components/shell/CommandProvider";
import { useSetting } from "@/components/settings/SettingsProvider";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridToolbar, type GridToolbarHandle } from "@/components/grid/GridToolbar";
import { useModuleViews } from "@/components/grid/useModuleViews";
import type { GridDefaults } from "@/components/grid/useGridState";
import { useMultiSelect } from "@/components/grid/useMultiSelect";
import { useNavigableIds } from "@/components/grid/useNavigableIds";
import { useToday } from "@/components/grid/useToday";
import { collectDistinctValues } from "@/lib/grid/distinct";
import { isTypingTarget } from "@/lib/keyboard";
import { DateText } from "@/components/date/DateText";
import {
  billColumns,
  spendColumns,
  type BillColumnCtx,
  type BillGridRow,
  type SpendColumnCtx,
  type SpendGridRow,
} from "./commitmentColumns";
import { ReviewList } from "./ReviewList";

const BILLS_SCOPE = {
  id: "bills",
  label: "Subscriptions & bills",
} as const;
const SPEND_SCOPE = { id: "spend", label: "Recurring spend" } as const;

const BILL_VIEWS = [{ id: "all", label: "All bills" }] as const;
const SPEND_VIEWS = [{ id: "all", label: "All spend" }] as const;

function billDefaults(): GridDefaults {
  return {
    order: billColumns.map((column) => column.id),
    sorts: [{ columnId: "annual", direction: "desc" }],
  };
}

function spendDefaults(): GridDefaults {
  return {
    order: spendColumns.map((column) => column.id),
    sorts: [{ columnId: "monthly", direction: "desc" }],
  };
}

export function CommitmentsView({
  bills,
  spend,
  billCharges,
  spendCharges,
  paydays,
  merchants,
  review,
}: {
  bills: StoredBillRow[];
  spend: StoredSpend[];
  billCharges: readonly BillCharge[];
  spendCharges: Record<string, CommitmentCharge[]>;
  paydays: readonly Payday[];
  merchants: readonly string[];
  review: RecurringMerchant[];
}) {
  const today = useToday();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  /** Which create form is open. Null until New / Add — Review is the usual path. */
  const [adding, setAdding] = useState<"bills" | "spend" | null>(null);
  const { detail: openId } = useViewStateUrl();
  const [focusedGrid, setFocusedGrid] = useState<"bills" | "spend">(() => {
    // A Find landing on a spend row should not light up the bills grid first.
    if (
      openId &&
      spend.some((row) => row.id === openId) &&
      !bills.some((row) => row.id === openId)
    ) {
      return "spend";
    }
    return "bills";
  });
  const billsToolbar = useRef<GridToolbarHandle>(null);
  const spendToolbar = useRef<GridToolbarHandle>(null);
  const focusedGridRef = useRef(focusedGrid);

  useEffect(() => {
    focusedGridRef.current = focusedGrid;
  }, [focusedGrid]);

  const todayKey = today;
  const { value: paydayOverride } = useSetting(PAYDAY_SCOPE, PAYDAY_CODEC);
  // The same next payday the dashboard uses, because the spend hold reaches to it.
  const nextPaydayKey =
    todayKey === null ? null : nextPayday(paydays, paydayOverride, todayKey).dateKey;

  const allBillRows = useMemo(
    () => buildBillRows(bills, billCharges, paydays, todayKey),
    [bills, billCharges, paydays, todayKey],
  );
  // Dismissed detections are stored as ignored bills — they are the record of "this merchant is
  // not a commitment" — but they are not bills and do not belong in a list of them. They come
  // back under Review, where they were dismissed from and where restoring one makes sense.
  const billRows: BillGridRow[] = useMemo(
    () => allBillRows.filter((row) => row.status !== "ignored"),
    [allBillRows],
  );
  const dismissed = useMemo(
    () => allBillRows.filter((row) => row.status === "ignored"),
    [allBillRows],
  );
  // Bills a second vendor spelling could belong to. Cancelled and dismissed ones are excluded:
  // folding a live merchant into a bill that no longer charges would hide it from every
  // forward-looking figure on the page.
  const liveBills = useMemo(
    () => bills.filter((bill) => bill.status === "active"),
    [bills],
  );

  const spendRows: SpendGridRow[] = useMemo(
    () => buildSpendRows(spend, spendCharges, todayKey, nextPaydayKey),
    [spend, spendCharges, todayKey, nextPaydayKey],
  );

  const chargesByName = useMemo(() => {
    const map = new Map<string, CommitmentCharge[]>();
    for (const charge of billCharges) {
      const list = map.get(charge.name) ?? [];
      list.push({ dateKey: charge.dateKey, costCents: 0 });
      map.set(charge.name, list);
    }
    return map;
  }, [billCharges]);

  const spendRates = useMemo(
    () =>
      spendRows
        .filter((entry) => entry.active)
        .map((entry) => ({
          entry,
          ratePerPeriodCents: entry.rate.ratePerPeriodCents,
        })),
    [spendRows],
  );

  const months = useMemo(
    () =>
      todayKey === null
        ? []
        : projectForwardMonths(bills, spendRates, chargesByName, todayKey),
    [bills, spendRates, chargesByName, todayKey],
  );
  const periods = useMemo(
    () =>
      todayKey === null
        ? []
        : projectForwardPayPeriods(bills, spendRates, chargesByName, todayKey, paydays),
    [bills, spendRates, chargesByName, todayKey, paydays],
  );

  const claimed = useMemo(
    () => unclaimedMerchants(merchants, bills, spend),
    [merchants, bills, spend],
  );

  const billViews = useModuleViews({
    moduleId: "finance-commitments-bills",
    builtIn: BILL_VIEWS,
    defaultViewId: "all",
    columns: billColumns,
    defaultsFor: billDefaults,
  });
  const spendViews = useModuleViews({
    moduleId: "finance-commitments-spend",
    builtIn: SPEND_VIEWS,
    defaultViewId: "all",
    columns: spendColumns,
    defaultsFor: spendDefaults,
  });
  const billGrid = billViews.grid;
  const spendGrid = spendViews.grid;

  const billGridRows = useMemo(
    () => groupBills(billRows, billGrid.groupBy),
    [billRows, billGrid.groupBy],
  );
  const spendGridRows = useMemo(
    () => groupSpend(spendRows, spendGrid.groupBy),
    [spendRows, spendGrid.groupBy],
  );

  const billDistinct = useMemo(
    () =>
      collectDistinctValues(
        billColumns,
        billGridRows.flatMap((row) => (row.kind === "node" ? [row] : [])),
      ),
    [billGridRows],
  );
  const spendDistinct = useMemo(
    () =>
      collectDistinctValues(
        spendColumns,
        spendGridRows.flatMap((row) => (row.kind === "node" ? [row] : [])),
      ),
    [spendGridRows],
  );

  const billIds = useMemo(() => billRows.map((row) => row.id), [billRows]);
  const spendIds = useMemo(() => spendRows.map((row) => row.id), [spendRows]);
  const billsNav = useNavigableIds(billIds);
  const spendNav = useNavigableIds(spendIds);
  const billMatch = openId !== null && billIds.includes(openId);
  const spendMatch = openId !== null && spendIds.includes(openId);
  const billsSelect = useMultiSelect(billsNav.order, billMatch ? openId : null);
  const spendSelect = useMultiSelect(spendNav.order, spendMatch ? openId : null);

  // Find and a pasted link land on `?detail=`. Select the row and focus its grid.
  const [seenDetailId, setSeenDetailId] = useState(openId);
  if (openId !== seenDetailId) {
    setSeenDetailId(openId);
    if (openId && billIds.includes(openId)) {
      setFocusedGrid("bills");
      billsSelect.selectOne(openId);
    } else if (openId && spendIds.includes(openId)) {
      setFocusedGrid("spend");
      spendSelect.selectOne(openId);
    }
  }

  const [billCounts, setBillCounts] = useState({ shown: 0, total: 0 });
  const [spendCounts, setSpendCounts] = useState({ shown: 0, total: 0 });
  const [billGroupIds, setBillGroupIds] = useState<readonly string[]>([]);
  const [spendGroupIds, setSpendGroupIds] = useState<readonly string[]>([]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && adding !== null) {
        event.preventDefault();
        setAdding(null);
        return;
      }
      if (isTypingTarget(event.target)) return;
      const select = focusedGridRef.current === "bills" ? billsSelect : spendSelect;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        select.move(1, event.shiftKey);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        select.move(-1, event.shiftKey);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [adding, billsSelect, spendSelect]);

  const focusedLabel = focusedGrid === "bills" ? BILLS_SCOPE.label : SPEND_SCOPE.label;
  const billsNarrowing = hasAnyNarrowing(
    billGrid.filters,
    billGrid.advancedFilter,
    billGrid.search,
  );
  const spendNarrowing = hasAnyNarrowing(
    spendGrid.filters,
    spendGrid.advancedFilter,
    spendGrid.search,
  );
  const focusedNarrowing = focusedGrid === "bills" ? billsNarrowing : spendNarrowing;
  const viewCommands = useMemo(() => {
    const noop = () => undefined;
    const templates = dualGridViewCommands(
      {
        label: focusedLabel,
        filtersActive: focusedNarrowing,
        openFilter: noop,
        clearFilters: noop,
        openFields: noop,
        reset: noop,
        resetTitle: `Reset ${focusedLabel}`,
      },
      [
        {
          scope: BILLS_SCOPE,
          filtersActive: billsNarrowing,
          openFilter: noop,
          clearFilters: noop,
          openFields: noop,
          reset: noop,
          resetTitle: `Reset ${BILLS_SCOPE.label}`,
        },
        {
          scope: SPEND_SCOPE,
          filtersActive: spendNarrowing,
          openFilter: noop,
          clearFilters: noop,
          openFields: noop,
          reset: noop,
          resetTitle: `Reset ${SPEND_SCOPE.label}`,
        },
      ],
    );
    const focusedHandle = () =>
      focusedGridRef.current === "bills" ? billsToolbar.current : spendToolbar.current;
    const runs: Record<string, () => void> = {
      "view.filter": () => focusedHandle()?.openFilter(),
      "view.clear-filters": () => focusedHandle()?.clearFilters(),
      "view.fields": () => focusedHandle()?.openFields(),
      "view.reset": () => focusedHandle()?.reset(),
      "view.filter.bills": () => billsToolbar.current?.openFilter(),
      "view.clear-filters.bills": () => billsToolbar.current?.clearFilters(),
      "view.fields.bills": () => billsToolbar.current?.openFields(),
      "view.reset.bills": () => billsToolbar.current?.reset(),
      "view.filter.spend": () => spendToolbar.current?.openFilter(),
      "view.clear-filters.spend": () => spendToolbar.current?.clearFilters(),
      "view.fields.spend": () => spendToolbar.current?.openFields(),
      "view.reset.spend": () => spendToolbar.current?.reset(),
    };
    // run() fires from the menu, not here. The handle must be the live ref —
    // a first-render snapshot would be null forever.
    // eslint-disable-next-line react-hooks/refs -- run closes over refs on purpose
    return templates.map((command) => ({
      ...command,
      run: runs[command.id] ?? command.run,
    }));
  }, [focusedLabel, focusedNarrowing, billsNarrowing, spendNarrowing]);
  useRegisterCommands(viewCommands);

  const createCommands = useMemo((): Command[] => {
    const openBills = () => {
      setFocusedGrid("bills");
      setAdding("bills");
    };
    const openSpend = () => {
      setFocusedGrid("spend");
      setAdding("spend");
    };
    const focusedIsBills = focusedGrid === "bills";
    return [
      {
        id: "grid.create.bills",
        label: "New bill",
        group: "record",
        menu: "new",
        section: "New",
        icon: "new",
        keywords: "add create subscription",
        title: "A bill Review did not detect — name, amount, cadence",
        bindings: focusedIsBills ? INSERT_AFTER : undefined,
        run: openBills,
      },
      {
        id: "grid.create.spend",
        label: "New spend group",
        group: "record",
        menu: "new",
        section: "New",
        icon: "new",
        keywords: "add create groceries pizza",
        title: "A spend group Review did not detect",
        bindings: focusedIsBills ? undefined : INSERT_AFTER,
        run: openSpend,
      },
    ];
  }, [focusedGrid]);
  useRegisterCommands(createCommands);

  function run(work: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) setError(result.error ?? "Could not save.");
      else router.refresh();
    });
  }

  const billCtx: BillColumnCtx = {
    pending,
    // The patch goes through whole. It used to be copied field by field, and a cell whose
    // field was missing from that list wrote nothing at all and snapped back on refresh —
    // which is what a Category column shipped straight into. `cadence` is the only field
    // filled in from the row, because the edit type requires it.
    onPatch: (name, patch) => {
      const row = bills.find((bill) => bill.name === name);
      if (!row) return;
      run(() =>
        setRecurringBillAction({
          ...patch,
          name,
          cadence: patch.cadence ?? cadenceOf(row),
        }),
      );
    },
    onRename: (from, to) => run(() => renameRecurringBillAction(from, to)),
    onDelete: (name) => run(() => deleteCommitmentAction({ kind: "bill", name })),
  };

  const spendCtx: SpendColumnCtx = {
    pending,
    // As above: forwarded whole, so a new column cannot go missing on the way to the write.
    onPatch: (name, patch) => {
      run(() => setRecurringSpendAction({ ...patch, name }));
    },
    onRename: (from, to) => run(() => renameRecurringSpendAction(from, to)),
    onDelete: (name) => run(() => deleteCommitmentAction({ kind: "spend", name })),
  };

  const billTotals = activeBillTotals(billRows);
  const spendTotals = activeSpendTotals(spendRows);
  const comparison = spendingVsIncome(billRows, spendRows, paydays);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-auto p-3">
        {error && (
          <p role="alert" className="text-[0.8125rem] text-[var(--chart-spend)]">
            {error}
          </p>
        )}

        <section
          className={`flex h-auto min-w-0 shrink-0 flex-col overflow-hidden rounded border md:h-[26rem] ${
            focusedGrid === "bills" ? "border-select-edge" : "border-rule"
          }`}
          onMouseDown={() => setFocusedGrid("bills")}
          onFocusCapture={() => setFocusedGrid("bills")}
        >
          <header className="flex items-start justify-between gap-2 px-2 pt-2">
            <div className="min-w-0">
              <h2 className="text-[0.9375rem] font-medium text-ink">
                Subscriptions & bills
              </h2>
              <p className="text-[0.75rem] text-ink-muted">
                Charges unless you cancel. Every active bill with an amount is held out
                of each paycheck, a slice at a time, so the money is there when it lands
                — a yearly bill saves up over 26 of them.{" "}
                {formatUsd(billTotals.monthlyCents)} / month ·{" "}
                {formatUsd(billTotals.annualCents)} / year.
              </p>
            </div>
            {adding !== "bills" && (
              <AddQuietly
                label="Add bill"
                title="A bill Review did not detect"
                onClick={() => {
                  setFocusedGrid("bills");
                  setAdding("bills");
                }}
              />
            )}
          </header>
          {adding === "bills" && (
            <div className="px-2">
              <NewBillForm
                claimed={claimed}
                pending={pending}
                onError={setError}
                onClose={() => setAdding(null)}
              />
            </div>
          )}
          <GridToolbar
            grid={billGrid}
            gridLabel="Subscriptions"
            allColumns={billColumns}
            distinctValues={billDistinct}
            counts={billCounts}
            views={billViews}
            groupDimensions={COMMITMENT_GROUP_BY_VALUES}
            groupIds={billGroupIds}
            commandRow={false}
            commandScope={BILLS_SCOPE}
            toolbarRef={billsToolbar}
          />
          <div className="flex min-h-0 min-w-0 flex-col md:flex-1">
            <DataGrid<BillColumnCtx, BillGridRow>
              rows={billGridRows}
              columns={billGrid.columns}
              allColumns={billColumns}
              columnCtx={billCtx}
              selectedId={billsSelect.selectedId}
              selectedIds={billsSelect.selectedIds}
              onSelect={(id, mods) => {
                setFocusedGrid("bills");
                billsSelect.select(id, mods);
              }}
              ariaLabel="Subscriptions and bills"
              commandScope={BILLS_SCOPE}
              exportFocused={focusedGrid === "bills"}
              rowNumbers
              rowLabel={(row) => row.node.name || "Bill"}
              enableFilters
              enableSort
              sorts={billGrid.sorts}
              onSortChange={billGrid.toggleSort}
              onSetSort={billGrid.setSort}
              filters={billGrid.filters}
              onFilterChange={billGrid.setFilter}
              advancedFilter={billGrid.advancedFilter}
              search={billGrid.search}
              distinctValues={billDistinct}
              onCountsChange={setBillCounts}
              onNavigableIdsChange={billsNav.onIdsChange}
              widths={billGrid.widths}
              onResizeColumn={billGrid.setWidth}
              onResetColumnWidth={billGrid.clearWidth}
              columnControls={billGrid.columnControls}
              collapsedGroups={billGrid.collapsedGroups}
              onToggleGroup={billGrid.toggleGroup}
              onGroupIdsChange={setBillGroupIds}
              density={billGrid.density}
              empty={
                <p className="p-4 text-center text-[0.8125rem] text-ink-muted">
                  Nothing declared yet. Track one from Review at the foot of the page,
                  or{" "}
                  <button
                    type="button"
                    className="text-ink underline-offset-2 hover:underline"
                    onClick={() => setAdding("bills")}
                  >
                    add a bill
                  </button>{" "}
                  that the detector missed.
                </p>
              }
              groupSummary={(nodes) => (
                <TotalFigures items={billTotalItems(activeBillTotals(nodes))} />
              )}
            />
          </div>
          <GridTotals items={billTotalItems(billTotals)} />
        </section>

        <section
          className={`flex h-auto min-w-0 shrink-0 flex-col overflow-hidden rounded border md:h-[22rem] ${
            focusedGrid === "spend" ? "border-select-edge" : "border-rule"
          }`}
          onMouseDown={() => setFocusedGrid("spend")}
          onFocusCapture={() => setFocusedGrid("spend")}
        >
          <header className="flex items-start justify-between gap-2 px-2 pt-2">
            <div className="min-w-0">
              <h2 className="text-[0.9375rem] font-medium text-ink">Recurring spend</h2>
              <p className="text-[0.75rem] text-ink-muted">
                Pizza, groceries — a cadence you choose, a rate that follows your
                history. The period&rsquo;s rate is held back before payday, so spending
                what you budgeted costs you nothing extra and only going over bites.
              </p>
            </div>
            {adding !== "spend" && (
              <AddQuietly
                label="Add spend"
                title="A spend group Review did not detect"
                onClick={() => {
                  setFocusedGrid("spend");
                  setAdding("spend");
                }}
              />
            )}
          </header>
          {adding === "spend" && (
            <div className="px-2">
              <NewSpendForm
                claimed={claimed}
                pending={pending}
                onError={setError}
                onClose={() => setAdding(null)}
              />
            </div>
          )}
          <GridToolbar
            grid={spendGrid}
            gridLabel="Recurring spend"
            allColumns={spendColumns}
            distinctValues={spendDistinct}
            counts={spendCounts}
            views={spendViews}
            groupDimensions={COMMITMENT_GROUP_BY_VALUES}
            groupIds={spendGroupIds}
            commandRow={false}
            commandScope={SPEND_SCOPE}
            toolbarRef={spendToolbar}
          />
          <div className="flex min-h-0 min-w-0 flex-col md:flex-1">
            <DataGrid<SpendColumnCtx, SpendGridRow>
              rows={spendGridRows}
              columns={spendGrid.columns}
              allColumns={spendColumns}
              columnCtx={spendCtx}
              selectedId={spendSelect.selectedId}
              selectedIds={spendSelect.selectedIds}
              onSelect={(id, mods) => {
                setFocusedGrid("spend");
                spendSelect.select(id, mods);
              }}
              ariaLabel="Recurring spend"
              commandScope={SPEND_SCOPE}
              exportFocused={focusedGrid === "spend"}
              rowNumbers
              rowLabel={(row) => row.node.name || "Spend group"}
              enableFilters
              enableSort
              sorts={spendGrid.sorts}
              onSortChange={spendGrid.toggleSort}
              onSetSort={spendGrid.setSort}
              filters={spendGrid.filters}
              onFilterChange={spendGrid.setFilter}
              advancedFilter={spendGrid.advancedFilter}
              search={spendGrid.search}
              distinctValues={spendDistinct}
              onCountsChange={setSpendCounts}
              onNavigableIdsChange={spendNav.onIdsChange}
              widths={spendGrid.widths}
              onResizeColumn={spendGrid.setWidth}
              onResetColumnWidth={spendGrid.clearWidth}
              columnControls={spendGrid.columnControls}
              collapsedGroups={spendGrid.collapsedGroups}
              onToggleGroup={spendGrid.toggleGroup}
              onGroupIdsChange={setSpendGroupIds}
              density={spendGrid.density}
              empty={
                <p className="p-4 text-center text-[0.8125rem] text-ink-muted">
                  Nothing tracked yet. Track one from Review, or{" "}
                  <button
                    type="button"
                    className="text-ink underline-offset-2 hover:underline"
                    onClick={() => setAdding("spend")}
                  >
                    add a spend group
                  </button>{" "}
                  — Pizza Hut and Domino&apos;s are one commitment, not two.
                </p>
              }
              groupSummary={(nodes) => (
                <TotalFigures items={spendTotalItems(activeSpendTotals(nodes))} />
              )}
            />
          </div>
          <GridTotals items={spendTotalItems(spendTotals)} />
        </section>

        <ExpectedVsIncome comparison={comparison} />

        <section className="shrink-0 rounded border border-rule p-2">
          <header className="mb-2">
            <h2 className="text-[0.9375rem] font-medium text-ink">Review</h2>
            <p className="text-[0.75rem] text-ink-muted">
              Detected charges that are not yet a commitment — the inbox for the two
              lists above, which is why it sits at the foot of the page. Track as a bill
              (it charges unless you cancel) or as recurring spend (pizza, groceries);
              you name it before it is written. Dismissing one puts it in the dismissed
              list below, where you can bring it back.
            </p>
          </header>
          <ReviewList
            items={review}
            dismissed={dismissed}
            bills={liveBills}
            spend={spend}
            billCharges={chargesByName}
            todayKey={todayKey}
          />
        </section>

        <ForwardPanel months={months} periods={periods} />
      </div>
    </div>
  );
}

function AddQuietly({
  label,
  title,
  onClick,
}: {
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="min-h-tap shrink-0 px-2 text-[0.75rem] text-ink-muted hover:text-ink md:min-h-0"
    >
      {label}
    </button>
  );
}

function NewBillForm({
  claimed,
  pending,
  onError,
  onClose,
}: {
  claimed: readonly string[];
  pending: boolean;
  onError: (message: string | null) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [matchers, setMatchers] = useState<string[]>([]);
  const [matcherDraft, setMatcherDraft] = useState("");
  const [cadence, setCadence] = useState<Cadence>({ unit: "month", n: 1 });
  const [amount, setAmount] = useState("");
  const [next, setNext] = useState("");

  const cents = Math.round(Number(amount.replace(/[$,\s]/g, "")) * 100);

  function toggle(merchant: string) {
    setMatchers((current) =>
      current.includes(merchant)
        ? current.filter((entry) => entry !== merchant)
        : [...current, merchant],
    );
    if (name === "") setName(merchant);
  }

  return (
    <div className="mb-2 flex flex-col gap-2 rounded border border-rule bg-surface-raised p-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={name}
          autoFocus
          onChange={(event) => setName(event.target.value)}
          placeholder="Name"
          aria-label="New bill name"
          className="min-h-tap w-40 rounded border border-rule bg-surface px-2 text-base text-ink md:min-h-0 md:text-[0.8125rem]"
        />
        <CadenceSelect
          value={cadence}
          onChange={setCadence}
          ariaLabel="New bill cadence"
          className="min-h-tap rounded border border-rule bg-surface px-2 text-base text-ink md:min-h-0 md:text-[0.8125rem]"
        />
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="Amount"
          aria-label="New bill amount"
          className="min-h-tap w-24 rounded border border-rule bg-surface px-2 text-base text-ink md:min-h-0 md:text-[0.8125rem]"
        />
        <input
          type="date"
          value={next}
          onChange={(event) => setNext(event.target.value)}
          aria-label="New bill next charge"
          className="min-h-tap rounded border border-rule bg-surface px-2 text-base text-ink md:min-h-0 md:text-[0.8125rem]"
        />
        <input
          type="text"
          value={matcherDraft}
          onChange={(event) => setMatcherDraft(event.target.value)}
          placeholder="Matchers"
          aria-label="New bill matchers"
          className="min-h-tap min-w-[10rem] flex-1 rounded border border-rule bg-surface px-2 text-base text-ink md:min-h-0 md:text-[0.8125rem]"
        />
        <button
          type="button"
          disabled={pending || name.trim() === ""}
          onClick={() => {
            onError(null);
            const nextMatchers = [
              ...new Set([
                ...matchers,
                ...matcherDraft
                  .split(",")
                  .map((entry) => entry.trim())
                  .filter(Boolean),
              ]),
            ];
            void setRecurringBillAction({
              name: name.trim(),
              matchers: nextMatchers.length > 0 ? nextMatchers : [name.trim()],
              cadence,
              expectedCents: cents > 0 ? cents : null,
              anchorDate: next || null,
            }).then((result) => {
              if (!result.ok) onError(result.error);
              else {
                onClose();
                router.refresh();
              }
            });
          }}
          className="min-h-tap rounded border border-rule bg-surface px-2 text-[0.8125rem] text-ink disabled:opacity-50 md:min-h-0 md:py-1"
        >
          Add bill
        </button>
        <button
          type="button"
          onClick={onClose}
          className="min-h-tap rounded px-2 text-[0.8125rem] text-ink-muted hover:text-ink md:min-h-0 md:py-1"
        >
          Cancel
        </button>
      </div>
      {claimed.length > 0 && (
        <details className="text-[0.75rem] text-ink-muted">
          <summary className="cursor-pointer select-none">
            Match bank merchants ({matchers.length} selected)
          </summary>
          <fieldset className="mt-1 flex max-h-24 flex-wrap gap-x-3 gap-y-1 overflow-auto">
            <legend className="sr-only">Bank merchants to match</legend>
            {claimed.slice(0, 40).map((merchant) => (
              <label key={merchant} className="flex items-center gap-1 text-ink">
                <input
                  type="checkbox"
                  checked={matchers.includes(merchant)}
                  onChange={() => toggle(merchant)}
                  className="size-3.5"
                />
                {merchant}
              </label>
            ))}
          </fieldset>
        </details>
      )}
    </div>
  );
}

function NewSpendForm({
  claimed,
  pending,
  onError,
  onClose,
}: {
  claimed: readonly string[];
  pending: boolean;
  onError: (message: string | null) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [matchers, setMatchers] = useState<string[]>([]);
  const [matcherDraft, setMatcherDraft] = useState("");
  const [period, setPeriod] = useState<"week" | "month">("week");

  function toggle(merchant: string) {
    setMatchers((current) =>
      current.includes(merchant)
        ? current.filter((entry) => entry !== merchant)
        : [...current, merchant],
    );
    if (name === "") setName(merchant);
  }

  return (
    <div className="mb-2 flex flex-col gap-2 rounded border border-rule bg-surface-raised p-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={name}
          autoFocus
          onChange={(event) => setName(event.target.value)}
          placeholder="Pizza"
          aria-label="New recurring spend name"
          className="min-h-tap w-40 rounded border border-rule bg-surface px-2 text-base text-ink md:min-h-0 md:text-[0.8125rem]"
        />
        <select
          value={period}
          onChange={(event) => setPeriod(event.target.value as "week" | "month")}
          aria-label="New recurring spend period"
          className="min-h-tap rounded border border-rule bg-surface px-2 text-base text-ink md:min-h-0 md:text-[0.8125rem]"
        >
          <option value="week">Weekly</option>
          <option value="month">Monthly</option>
        </select>
        <input
          type="text"
          value={matcherDraft}
          onChange={(event) => setMatcherDraft(event.target.value)}
          placeholder="PIZZA HUT, DOMINOS"
          aria-label="New recurring spend matchers"
          className="min-h-tap min-w-[12rem] flex-1 rounded border border-rule bg-surface px-2 text-base text-ink md:min-h-0 md:text-[0.8125rem]"
        />
        <button
          type="button"
          disabled={
            pending ||
            name.trim() === "" ||
            (matchers.length === 0 && matcherDraft.trim() === "")
          }
          onClick={() => {
            onError(null);
            const nextMatchers = [
              ...new Set([
                ...matchers,
                ...matcherDraft
                  .split(",")
                  .map((entry) => entry.trim())
                  .filter(Boolean),
              ]),
            ];
            void setRecurringSpendAction({
              name: name.trim(),
              matchers: nextMatchers,
              period,
            }).then((result) => {
              if (!result.ok) onError(result.error);
              else {
                onClose();
                router.refresh();
              }
            });
          }}
          className="min-h-tap rounded border border-rule bg-surface px-2 text-[0.8125rem] text-ink disabled:opacity-50 md:min-h-0 md:py-1"
        >
          Add spend
        </button>
        <button
          type="button"
          onClick={onClose}
          className="min-h-tap rounded px-2 text-[0.8125rem] text-ink-muted hover:text-ink md:min-h-0 md:py-1"
        >
          Cancel
        </button>
      </div>
      {claimed.length > 0 && (
        <details className="text-[0.75rem] text-ink-muted">
          <summary className="cursor-pointer select-none">
            Group bank merchants ({matchers.length} selected)
          </summary>
          <fieldset className="mt-1 flex max-h-24 flex-wrap gap-x-3 gap-y-1 overflow-auto">
            <legend className="sr-only">Bank merchants to group</legend>
            {claimed.slice(0, 40).map((merchant) => (
              <label key={merchant} className="flex items-center gap-1 text-ink">
                <input
                  type="checkbox"
                  checked={matchers.includes(merchant)}
                  onChange={() => toggle(merchant)}
                  className="size-3.5"
                />
                {merchant}
              </label>
            ))}
          </fieldset>
        </details>
      )}
    </div>
  );
}

function billTotalItems(totals: MoneyTotals): TotalItem[] {
  return [
    { label: "Monthly", cents: totals.monthlyCents },
    { label: "Pay period", cents: totals.paycheckCents },
    { label: "A year", cents: totals.annualCents },
  ];
}

function spendTotalItems(totals: MoneyTotals): TotalItem[] {
  return [
    { label: "Weekly", cents: totals.weeklyCents },
    { label: "Monthly", cents: totals.monthlyCents },
    { label: "Pay period", cents: totals.paycheckCents },
  ];
}

type TotalItem = { label: string; cents: number };

function TotalFigures({ items }: { items: readonly TotalItem[] }) {
  return items.map((item) => (
    <span key={item.label} className="tabular text-ink">
      {item.label} {formatUsd(item.cents)}
    </span>
  ));
}

function GridTotals({ items }: { items: readonly TotalItem[] }) {
  return (
    <div className="flex flex-none flex-wrap items-baseline gap-x-4 gap-y-0.5 border-t border-rule px-2 py-1 text-[0.75rem] text-ink-muted">
      <span>Active totals</span>
      <TotalFigures items={items} />
    </div>
  );
}

function ExpectedVsIncome({ comparison }: { comparison: SpendingVsIncome }) {
  const leftover = comparison.remainder.monthlyCents;
  return (
    <section className="shrink-0 rounded border border-rule">
      <header className="border-b border-rule px-3 py-2">
        <h2 className="text-[0.9375rem] font-medium text-ink">Expected vs income</h2>
        <p className="text-[0.75rem] text-ink-muted">
          What the two lists above cost, against a typical paycheck. Amount on a bill is
          left out — a yearly $72 and a monthly $72 are not the same number.
        </p>
      </header>
      <div className="overflow-x-auto p-2">
        <table className="w-full min-w-[28rem] text-[0.8125rem]">
          <thead>
            <tr className="border-b border-rule text-left text-[0.75rem] text-ink-muted">
              <th className="py-1 pr-2 font-normal"> </th>
              <th className="py-1 pr-2 text-right font-normal">Monthly</th>
              <th className="py-1 pr-2 text-right font-normal">Pay period</th>
              <th className="py-1 text-right font-normal">A year</th>
            </tr>
          </thead>
          <tbody>
            <ComparisonRow
              label="Subscriptions & bills"
              monthly={comparison.bills.monthlyCents}
              paycheck={comparison.bills.paycheckCents}
              annual={comparison.bills.annualCents}
            />
            <ComparisonRow
              label="Recurring spend"
              monthly={comparison.spend.monthlyCents}
              paycheck={comparison.spend.paycheckCents}
              annual={comparison.spend.annualCents}
            />
            <ComparisonRow
              label="Expected spending"
              monthly={comparison.spending.monthlyCents}
              paycheck={comparison.spending.paycheckCents}
              annual={comparison.spending.annualCents}
              strong
            />
            <ComparisonRow
              label="Expected income"
              monthly={comparison.income.monthlyCents}
              paycheck={comparison.income.paycheckCents}
              annual={comparison.income.annualCents}
            />
            <ComparisonRow
              label={leftover >= 0 ? "Left after commitments" : "Overcommitted"}
              monthly={comparison.remainder.monthlyCents}
              paycheck={comparison.remainder.paycheckCents}
              annual={comparison.remainder.annualCents}
              strong
              tone={leftover >= 0 ? "income" : "spend"}
            />
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ComparisonRow({
  label,
  monthly,
  paycheck,
  annual,
  strong,
  tone,
}: {
  label: string;
  monthly: number;
  paycheck: number;
  annual: number;
  strong?: boolean;
  tone?: "income" | "spend";
}) {
  const color =
    tone === "income"
      ? "text-[var(--chart-income)]"
      : tone === "spend"
        ? "text-[var(--chart-spend)]"
        : "text-ink";
  const weight = strong ? "font-medium" : "font-normal";
  return (
    <tr className="border-b border-rule last:border-b-0">
      <td className={`py-1.5 pr-2 ${weight} text-ink`}>{label}</td>
      <td className={`tabular py-1.5 pr-2 text-right ${weight} ${color}`}>
        {formatUsd(monthly)}
      </td>
      <td className={`tabular py-1.5 pr-2 text-right ${weight} ${color}`}>
        {formatUsd(paycheck)}
      </td>
      <td className={`tabular py-1.5 text-right ${weight} ${color}`}>
        {formatUsd(annual)}
      </td>
    </tr>
  );
}

function ForwardPanel({
  months,
  periods,
}: {
  months: ReturnType<typeof projectForwardMonths>;
  periods: ReturnType<typeof projectForwardPayPeriods>;
}) {
  const [axis, setAxis] = useState<"month" | "pay">("month");
  const buckets = axis === "month" ? months : periods;

  return (
    <section>
      <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[0.9375rem] font-medium text-ink">Next 12 months</h2>
          <p className="text-[0.75rem] text-ink-muted">
            Dated bills land on a day. Unscheduled bills and recurring spend are a
            monthly rate with no date. Months above the median are marked.
          </p>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setAxis("month")}
            className={`rounded border px-2 py-0.5 text-[0.75rem] ${
              axis === "month"
                ? "border-ink bg-surface-raised text-ink"
                : "border-rule text-ink-muted"
            }`}
          >
            Months
          </button>
          <button
            type="button"
            onClick={() => setAxis("pay")}
            disabled={periods.length === 0}
            className={`rounded border px-2 py-0.5 text-[0.75rem] disabled:opacity-40 ${
              axis === "pay"
                ? "border-ink bg-surface-raised text-ink"
                : "border-rule text-ink-muted"
            }`}
          >
            Pay periods
          </button>
        </div>
      </header>
      <ol className="flex flex-col gap-1">
        {buckets.map((bucket) => (
          <li
            key={bucket.key}
            className={`rounded border px-2 py-1 ${
              bucket.aboveMedian
                ? "border-[var(--chart-spend)]/40 bg-surface-raised"
                : "border-rule"
            }`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[0.8125rem] text-ink">
                {axis === "month" ? (
                  <DateText dateKey={bucket.startKey} className="inline" />
                ) : (
                  bucket.label
                )}
                {bucket.aboveMedian && (
                  <span className="ml-2 text-[0.7rem] text-[var(--chart-spend)]">
                    above median
                  </span>
                )}
              </span>
              <span className="tabular text-[0.8125rem] text-ink">
                {formatUsd(bucket.totalCents)}
              </span>
            </div>
            {bucket.items.length > 0 && (
              <ul className="mt-0.5 flex flex-wrap gap-x-3 text-[0.75rem] text-ink-muted">
                {bucket.items.map((item) => (
                  <li key={`${item.name}:${item.dateKey ?? "rate"}`}>
                    {item.name} {formatUsd(item.cents)}
                    {item.dateKey && (
                      <>
                        {" · "}
                        <DateText dateKey={item.dateKey} className="inline" />
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
