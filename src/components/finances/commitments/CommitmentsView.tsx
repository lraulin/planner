"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useViewStateUrl } from "@/components/url/useViewStateUrl";
import type { GridRow } from "@/lib/tree/slice";
import type { Payday } from "@/lib/finances/classify/income";
import type { BillCharge } from "@/lib/finances/available";
import type { RecurringMerchant } from "@/lib/finances/analytics";
import {
  projectForwardMonths,
  projectForwardPayPeriods,
  recurringSpendRate,
  unclaimedMerchants,
  type CommitmentCharge,
  type StoredBillRow,
  type StoredSpend,
} from "@/lib/finances/commitments";
import {
  annualCents,
  CADENCE_CHOICES,
  cadenceLabel,
  nextDueFrom,
} from "@/lib/finances/recurringBills";
import { formatUsd } from "@/lib/finances/money";
import {
  deleteCommitmentAction,
  renameRecurringBillAction,
  setRecurringBillAction,
  setRecurringSpendAction,
} from "@/app/finances/actions";
import { dualGridViewCommands } from "@/lib/commands/gridViewCommands";
import { hasAnyNarrowing } from "@/lib/settings/grid";
import { useRegisterCommands } from "@/components/shell/CommandProvider";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridToolbar, type GridToolbarHandle } from "@/components/grid/GridToolbar";
import { useGridState, type GridDefaults } from "@/components/grid/useGridState";
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

function asRows<T extends { id: string }>(items: T[]): GridRow<T>[] {
  return items.map((node) => ({ kind: "node" as const, id: node.id, node, depth: 0 }));
}

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

function lastChargeOn(
  name: string,
  charges: readonly BillCharge[],
  fallback: string | null,
): string | null {
  const mine = charges
    .filter((charge) => charge.name === name)
    .map((charge) => charge.dateKey)
    .sort();
  return mine.length > 0 ? mine[mine.length - 1] : fallback;
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

  const billRows: BillGridRow[] = useMemo(
    () =>
      bills.map((bill) => {
        const amountCents = bill.expectedCents ?? 0;
        const annualCostCents =
          amountCents > 0 ? annualCents(amountCents, bill.cadenceMonths) : 0;
        const lastPosted = lastChargeOn(bill.name, billCharges, null);
        const nextDueKey =
          todayKey === null || !bill.scheduled
            ? null
            : bill.anchorDate !== null &&
                (lastPosted === null || bill.anchorDate > lastPosted)
              ? bill.anchorDate
              : lastPosted !== null
                ? nextDueFrom(lastPosted, bill.cadenceMonths, todayKey)
                : null;
        return {
          ...bill,
          nextDueKey,
          amountCents,
          annualCostCents,
          monthlySetAsideCents: Math.round(annualCostCents / 12),
        };
      }),
    [bills, billCharges, todayKey],
  );

  const spendRows: SpendGridRow[] = useMemo(
    () =>
      spend.map((entry) => {
        const rate = recurringSpendRate(
          entry,
          spendCharges[entry.name] ?? [],
          todayKey ?? "9999-12-31",
        );
        const weeklyCents =
          entry.period === "week"
            ? rate.ratePerPeriodCents
            : Math.round((rate.ratePerPeriodCents * 12) / 52);
        const monthlyCents =
          entry.period === "month"
            ? rate.ratePerPeriodCents
            : Math.round((rate.ratePerPeriodCents * 52) / 12);
        return { ...entry, rate, weeklyCents, monthlyCents };
      }),
    [spend, spendCharges, todayKey],
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

  const billGrid = useGridState(
    "finance-commitments-bills",
    billColumns,
    billDefaults(),
  );
  const spendGrid = useGridState(
    "finance-commitments-spend",
    spendColumns,
    spendDefaults(),
  );

  const billGridRows = useMemo(() => asRows(billRows), [billRows]);
  const spendGridRows = useMemo(() => asRows(spendRows), [spendRows]);

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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
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
  }, [billsSelect, spendSelect]);

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
    onPatch: (name, patch) => {
      const row = bills.find((bill) => bill.name === name);
      if (!row) return;
      run(() =>
        setRecurringBillAction({
          name,
          cadenceMonths: patch.cadenceMonths ?? row.cadenceMonths,
          matchers: patch.matchers ?? row.matchers,
          expectedCents:
            patch.expectedCents !== undefined ? patch.expectedCents : row.expectedCents,
          anchorDate:
            patch.anchorDate !== undefined ? patch.anchorDate : row.anchorDate,
          status: patch.status ?? row.status,
          cancelUrl: patch.cancelUrl ?? row.cancelUrl,
          scheduled: patch.scheduled ?? row.scheduled,
          setAside: patch.setAside ?? row.setAside,
          dueDay: patch.dueDay !== undefined ? patch.dueDay : row.dueDay,
        }),
      );
    },
    onRename: (from, to) => run(() => renameRecurringBillAction(from, to)),
    onDelete: (name) => run(() => deleteCommitmentAction({ kind: "bill", name })),
  };

  const spendCtx: SpendColumnCtx = {
    pending,
    onPatch: (name, patch) => {
      run(() =>
        setRecurringSpendAction({
          name,
          matchers: patch.matchers,
          period: patch.period,
          amountSource: patch.amountSource,
          expectedCents: patch.expectedCents,
          setAside: patch.setAside,
          active: patch.active,
        }),
      );
    },
    onDelete: (name) => run(() => deleteCommitmentAction({ kind: "spend", name })),
  };

  const activeBills = billRows.filter((row) => row.status === "active");
  const annualTotal = activeBills.reduce(
    (total, row) => total + row.annualCostCents,
    0,
  );
  const monthlyTotal = activeBills.reduce(
    (total, row) => total + row.monthlySetAsideCents,
    0,
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-auto p-3">
        {error && (
          <p role="alert" className="text-[0.8125rem] text-[var(--chart-spend)]">
            {error}
          </p>
        )}

        <section className="shrink-0 rounded border border-rule p-2">
          <header className="mb-2">
            <h2 className="text-[0.9375rem] font-medium text-ink">Review</h2>
            <p className="text-[0.75rem] text-ink-muted">
              Detected charges that are not yet a commitment. Track as a bill (it
              charges unless you cancel), track as recurring spend (pizza, groceries),
              or dismiss.
            </p>
          </header>
          <ReviewList items={review} onError={setError} />
        </section>

        <section
          className={`flex h-[26rem] min-w-0 shrink-0 flex-col overflow-hidden rounded border ${
            focusedGrid === "bills" ? "border-select-edge" : "border-rule"
          }`}
          onMouseDown={() => setFocusedGrid("bills")}
          onFocusCapture={() => setFocusedGrid("bills")}
        >
          <header className="flex flex-wrap items-baseline justify-between gap-2 px-2 pt-2">
            <div>
              <h2 className="text-[0.9375rem] font-medium text-ink">
                Subscriptions & bills
              </h2>
              <p className="text-[0.75rem] text-ink-muted">
                Charges unless you cancel. {formatUsd(monthlyTotal)} / month ·{" "}
                {formatUsd(annualTotal)} / year. Tick <strong>Hold</strong> to subtract
                a bill from Available to Spend.
              </p>
            </div>
          </header>
          <div className="px-2">
            <NewBillForm claimed={claimed} pending={pending} onError={setError} />
          </div>
          <GridToolbar
            grid={billGrid}
            gridLabel="Subscriptions"
            allColumns={billColumns}
            distinctValues={billDistinct}
            counts={billCounts}
            commandRow={false}
            commandScope={BILLS_SCOPE}
            toolbarRef={billsToolbar}
          />
          <div className="min-h-0 min-w-0 flex-1">
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
              density={billGrid.density}
              empty={
                <p className="p-4 text-center text-[0.8125rem] text-ink-muted">
                  No subscriptions declared yet. Pick a merchant below, or declare one
                  from Insights.
                </p>
              }
            />
          </div>
        </section>

        <section
          className={`flex h-[22rem] min-w-0 shrink-0 flex-col overflow-hidden rounded border ${
            focusedGrid === "spend" ? "border-select-edge" : "border-rule"
          }`}
          onMouseDown={() => setFocusedGrid("spend")}
          onFocusCapture={() => setFocusedGrid("spend")}
        >
          <header className="px-2 pt-2">
            <h2 className="text-[0.9375rem] font-medium text-ink">Recurring spend</h2>
            <p className="text-[0.75rem] text-ink-muted">
              Pizza, groceries — a cadence you choose, an amount that follows history.
            </p>
          </header>
          <div className="px-2">
            <NewSpendForm claimed={claimed} pending={pending} onError={setError} />
          </div>
          <GridToolbar
            grid={spendGrid}
            gridLabel="Recurring spend"
            allColumns={spendColumns}
            distinctValues={spendDistinct}
            counts={spendCounts}
            commandRow={false}
            commandScope={SPEND_SCOPE}
            toolbarRef={spendToolbar}
          />
          <div className="min-h-0 min-w-0 flex-1">
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
              density={spendGrid.density}
              empty={
                <p className="p-4 text-center text-[0.8125rem] text-ink-muted">
                  Nothing tracked as recurring spend. Group Pizza Hut and Domino&apos;s
                  here.
                </p>
              }
            />
          </div>
        </section>

        <ForwardPanel months={months} periods={periods} />
      </div>
    </div>
  );
}

function NewBillForm({
  claimed,
  pending,
  onError,
}: {
  claimed: readonly string[];
  pending: boolean;
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [matchers, setMatchers] = useState<string[]>([]);
  const [matcherDraft, setMatcherDraft] = useState("");
  const [cadence, setCadence] = useState(1);
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
          onChange={(event) => setName(event.target.value)}
          placeholder="Name"
          aria-label="New bill name"
          className="min-h-tap w-40 rounded border border-rule bg-surface px-2 text-base text-ink md:min-h-0 md:text-[0.8125rem]"
        />
        <select
          value={cadence}
          onChange={(event) => setCadence(Number(event.target.value))}
          aria-label="New bill cadence"
          className="min-h-tap rounded border border-rule bg-surface px-2 text-base text-ink md:min-h-0 md:text-[0.8125rem]"
        >
          {CADENCE_CHOICES.map((months) => (
            <option key={months} value={months}>
              {cadenceLabel(months)}
            </option>
          ))}
        </select>
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
              cadenceMonths: cadence,
              expectedCents: cents > 0 ? cents : null,
              anchorDate: next || null,
              setAside: cents > 0,
            }).then((result) => {
              if (!result.ok) onError(result.error);
              else {
                setName("");
                setMatchers([]);
                setMatcherDraft("");
                setAmount("");
                setNext("");
                router.refresh();
              }
            });
          }}
          className="min-h-tap rounded border border-rule bg-surface px-2 text-[0.8125rem] text-ink disabled:opacity-50 md:min-h-0 md:py-1"
        >
          Add bill
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
}: {
  claimed: readonly string[];
  pending: boolean;
  onError: (message: string | null) => void;
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
                setName("");
                setMatchers([]);
                setMatcherDraft("");
                router.refresh();
              }
            });
          }}
          className="min-h-tap rounded border border-rule bg-surface px-2 text-[0.8125rem] text-ink disabled:opacity-50 md:min-h-0 md:py-1"
        >
          Add spend
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
