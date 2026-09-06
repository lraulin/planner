"use client";
import { useCallback, useId, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  setRecurringBillAction,
  updateBudgetCategoryAction,
  createBudgetCategoryAction,
} from "@/app/finances/actions";
import type { BudgetData } from "@/lib/finances/budget/queries";
import type { BudgetBillRow } from "@/lib/finances/budget/rows";
import type { BillForecast } from "@/lib/finances/dashboardQueries";
import type { RecurringMerchant } from "@/lib/finances/analytics";
import {
  managementBillRows,
  billGroupLabel,
  billsGridRows,
} from "@/lib/finances/billsView";
import { billCadence } from "@/lib/finances/budget/inspector";
import {
  billsNeedingAmountReview,
  billsNeedingReview,
  type BillAnchor,
} from "@/lib/finances/commitments";
import { formatUsd } from "@/lib/finances/money";
import { billDueSoon } from "@/lib/finances/budget/dueCue";
import { budgetEnvelopeLabel } from "@/lib/finances/budget/hierarchy";
import {
  budgetEnvelopeHref,
  activityRegisterHref,
} from "@/lib/finances/registerActivity";
import { optionsFilter } from "@/lib/grid/customFilter";
import { collectDistinctValues } from "@/lib/grid/distinct";
import { DataGrid } from "@/components/grid/DataGrid";
import type { MenuItem } from "@/components/grid/ContextMenu";
import { rowMenuFor } from "@/components/grid/rowMenu";
import { GridToolbar } from "@/components/grid/GridToolbar";
import { useModuleViews } from "@/components/grid/useModuleViews";
import { useMultiSelect } from "@/components/grid/useMultiSelect";
import { useNavigableIds } from "@/components/grid/useNavigableIds";
import { Drawer, DrawerHeader } from "@/components/detail/Drawer";
import { BillFields } from "../budget/BillFields";
import { ForecastDetails } from "../budget/ForwardPanel";
import { ReviewDrawer } from "../budget/ReviewDrawer";
import { CommitmentPayeeDialog } from "../budget/CommitmentPayeeDialog";
import { useViewStateUrl } from "@/components/url/useViewStateUrl";
import { billColumns, type BillColumnCtx } from "./billColumns";
import { INSERT_AFTER, OPEN_RECORD } from "@/lib/commands/chords";
import type { GridCommandCapabilities } from "@/lib/grid/commandDeck";

const VIEWS = [
  { id: "active", label: "Active bills" },
  { id: "due-soon", label: "Due soon" },
  { id: "all", label: "All bills" },
] as const;
function defaultsFor(
  id: string,
): import("@/components/grid/useGridState").GridDefaults {
  return {
    order: ["name", "budgetGroup", "next", "amount", "cadence", "status"],
    sorts: [
      { columnId: "next", direction: "asc" as const },
      { columnId: "name", direction: "asc" as const },
    ],
    filters: id === "all" ? {} : { status: optionsFilter(["value:active"]) },
  };
}
export function BillsView({
  data,
  anchors,
  forecast,
  review,
  payees,
  lastCharges,
}: {
  data: BudgetData;
  anchors: ReadonlyMap<string, BillAnchor>;
  forecast: BillForecast;
  review: readonly RecurringMerchant[];
  payees: readonly { id: string; name: string; budgetCategoryId: string | null }[];
  lastCharges: ReadonlyMap<string, string>;
}) {
  const router = useRouter();
  const titleId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [payeeBill, setPayeeBill] = useState<BudgetBillRow | null>(null);
  const { detail, setDetail } = useViewStateUrl();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [counts, setCounts] = useState({ shown: 0, total: 0 });
  const views = useModuleViews({
    moduleId: "finance-bills",
    builtIn: VIEWS,
    defaultViewId: "active",
    columns: billColumns,
    defaultsFor,
  });
  const grid = views.grid;
  const rows = useMemo(
    () =>
      managementBillRows(data, anchors).map((row) => ({
        ...row,
        groupName: billGroupLabel(data, row),
        lastCharge: lastCharges.get(row.id) ?? null,
        payeeNames: payees
          .filter((payee) => payee.budgetCategoryId === row.id)
          .map((payee) => payee.name)
          .join(", "),
      })),
    [data, anchors, lastCharges, payees],
  );
  const gridRows = useMemo(
    () =>
      billsGridRows(
        views.base === "due-soon"
          ? rows.filter((row) => billDueSoon(row, data.todayKey))
          : rows,
        data,
        grid.groupBy.includes("budgetGroup"),
      ),
    [rows, data, views.base, grid.groupBy],
  );
  const groupIds = useMemo(
    () => gridRows.filter((row) => row.kind === "group").map((row) => row.id),
    [gridRows],
  );
  const ids = useMemo(() => rows.map((row) => row.id), [rows]);
  const nav = useNavigableIds(ids);
  const multi = useMultiSelect(nav.order, null);
  const { selectedId, selectedIds, select, selectAll, toggleSelectAll, headerState } =
    multi;
  const distinct = useMemo(
    () =>
      collectDistinctValues(
        billColumns,
        gridRows.filter((row) => row.kind === "node"),
      ),
    [gridRows],
  );
  const run = useCallback(
    (work: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
      setError(null);
      startTransition(async () => {
        const result = await work();
        if (!result.ok) setError(result.error);
        else router.refresh();
      });
    },
    [router],
  );
  const create = useCallback(
    () =>
      run(async () => {
        const used = new Set(data.categories.map((row) => row.name));
        let name = "New bill";
        for (let n = 2; used.has(name); n++) name = `New bill ${n}`;
        const result = await createBudgetCategoryAction(null, name, "bill");
        if (result.ok && result.data) setDetail(result.data);
        return result;
      }),
    [run, setDetail, data.categories],
  );
  const commitRename = useCallback(
    (id: string, name: string) => {
      setRenamingId(null);
      const trimmed = name.trim();
      const current = rows.find((row) => row.id === id);
      if (!current || trimmed === "" || trimmed === current.name) return;
      run(() => updateBudgetCategoryAction(id, { name: trimmed }));
    },
    [rows, run],
  );
  /**
   * Open / Rename / New from the shared grid deck, not `catalogCapabilities`.
   * That helper always ships Delete, and bills are cancelled rather than deleted.
   */
  const capabilitiesFor = useCallback(
    (rowId: string | null, count: number): GridCommandCapabilities => {
      const noRow = rowId === null ? "Select a row first" : undefined;
      return {
        selection: {
          id: rowId,
          count,
          label: rows.find((row) => row.id === rowId)?.name,
        },
        actions: {
          onRename: (id) => setRenamingId(id),
          onSelectAll: selectAll,
        },
        pageCommands: [
          {
            id: "grid.create",
            label: "New bill",
            group: "record",
            menu: "new",
            section: "New",
            icon: "new",
            toolbar: 10,
            rowMenu: true,
            bindings: INSERT_AFTER,
            keywords: "create envelope recurring",
            run: create,
          },
          {
            id: "record.open",
            label: "Open bill",
            group: "record",
            menu: "item",
            section: "Item",
            icon: "open",
            toolbar: 50,
            rowMenu: true,
            bindings: OPEN_RECORD,
            disabled: Boolean(noRow),
            title: noRow,
            run: () => {
              if (rowId) setDetail(rowId);
            },
          },
          {
            id: "bills.review",
            label: `Discover recurring charges (${review.length})`,
            group: "view",
            menu: "tools",
            keywords: "review recurring detect",
            run: () => setReviewing(true),
          },
        ],
      };
    },
    [rows, create, setDetail, selectAll, review.length],
  );
  const commandCapabilities = useMemo(
    () => capabilitiesFor(selectedId, selectedIds.size),
    [capabilitiesFor, selectedId, selectedIds.size],
  );
  const rowMenu = useCallback(
    (id: string | null): MenuItem[] => {
      const items = rowMenuFor(capabilitiesFor(id, id ? 1 : 0));
      if (!id) return items;
      return [
        ...items,
        {
          label: "Open in Budget",
          onSelect: () => router.push(budgetEnvelopeHref(id, data.month)),
        },
        {
          label: "View transactions",
          onSelect: () => router.push(activityRegisterHref(id, data.month)),
        },
      ];
    },
    [capabilitiesFor, router, data.month],
  );
  const ctx: BillColumnCtx = {
    pending,
    renamingId,
    onRename: commitRename,
    onCancelRename: () => setRenamingId(null),
    editPayees: setPayeeBill,
    groups: data.groups
      .filter((group) => group.kind === "bill")
      .map((group) => ({
        id: group.id,
        name: budgetEnvelopeLabel(data.groups, {
          groupId: group.parentGroupId,
          name: group.name,
        }),
      })),
    edit: (id, edit) => run(() => updateBudgetCategoryAction(id, edit)),
    patch: (row, patch) =>
      run(() =>
        setRecurringBillAction({
          id: row.id,
          name: row.name,
          cadence: patch.cadence ?? billCadence(row.bill),
          ...patch,
        }),
      ),
  };
  const opened = rows.find((row) => row.id === detail);
  // The grace belongs to `billsNeedingReview`, not here: this panel used to flag any passed
  // expected date, which put rent on the list for the days its charge took to clear.
  const reviewDates = billsNeedingReview(
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.bill.status,
      scheduled: row.bill.scheduled,
      cadenceMonths: row.bill.cadenceMonths ?? 1,
      cadenceDays: row.bill.cadenceDays,
      expectedCents: row.bill.expectedCents,
      expectedKey: row.expectedKey,
      dueKey: row.dueKey,
    })),
    data.todayKey,
  );
  const amountReviews = billsNeedingAmountReview(
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.bill.status,
      expectedCents: row.bill.expectedCents,
    })),
    forecast.chargesByBill,
  );
  const rowById = new Map(rows.map((row) => [row.id, row]));
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <div className="flex shrink-0 flex-wrap gap-3 border-b border-rule px-3 py-2 text-xs">
        <Link className="underline" href="/finances/budget">
          Budget
        </Link>
        <button type="button" onClick={create}>
          + Bill
        </button>
        <button type="button" onClick={() => setReviewing(true)}>
          Discover recurring charges · {review.length}
        </button>
      </div>
      <GridToolbar
        grid={grid}
        gridLabel="Bills"
        allColumns={billColumns}
        distinctValues={distinct}
        counts={counts}
        error={error}
        views={views}
        groupDimensions={["budgetGroup"]}
        groupIds={groupIds}
        commandCapabilities={commandCapabilities}
      />
      <DataGrid
        rows={gridRows}
        columns={grid.columns}
        allColumns={billColumns}
        columnCtx={ctx}
        selectedId={selectedId}
        selectedIds={selectedIds}
        selectAllState={headerState}
        onToggleSelectAll={toggleSelectAll}
        onSelect={select}
        onOpenDetail={setDetail}
        ariaLabel="Bills"
        rowLabel={(row) => row.node.name}
        rowMenu={rowMenu}
        enableFilters
        enableSort
        sorts={grid.sorts}
        onSortChange={grid.toggleSort}
        onSetSort={grid.setSort}
        filters={grid.filters}
        onFilterChange={grid.setFilter}
        advancedFilter={grid.advancedFilter}
        search={grid.search}
        distinctValues={distinct}
        onCountsChange={setCounts}
        onNavigableIdsChange={nav.onIdsChange}
        widths={grid.widths}
        onResizeColumn={grid.setWidth}
        onResetColumnWidth={grid.clearWidth}
        columnControls={grid.columnControls}
        collapsedGroups={grid.collapsedGroups}
        onToggleGroup={grid.toggleGroup}
        density={grid.density}
        empty="No bills match this view."
      />
      <div className="max-h-[35dvh] shrink-0 space-y-2 overflow-auto p-3">
        {reviewDates.length > 0 ? (
          <details className="rounded border border-rule px-3 py-2 text-xs">
            <summary>
              Still active? · {reviewDates.length} date
              {reviewDates.length === 1 ? "" : "s"} to review
            </summary>
            <p className="py-1 text-ink-muted">
              An expected date has passed. This asks for review; it does not prove a
              payment was missed.
            </p>
            {reviewDates.map((item) => {
              const row = rowById.get(item.billId);
              return (
                <div className="flex flex-wrap gap-3 py-1" key={item.billId}>
                  <button
                    type="button"
                    className="underline"
                    onClick={() => setDetail(item.billId)}
                  >
                    {item.name} · expected {item.expectedOn}
                    {item.dueOn === null ? "" : `, due ${item.dueOn}`}
                  </button>
                  {item.dueOn === null ? (
                    <button
                      type="button"
                      disabled={pending || !row}
                      onClick={() =>
                        row && ctx.patch(row, { anchorDate: data.todayKey })
                      }
                    >
                      Still active · reset expected date
                    </button>
                  ) : (
                    // A declared bill has no writable expected date to reset — its dates come
                    // from the due day and the lead, so the fix is to check those.
                    <button type="button" onClick={() => setDetail(item.billId)}>
                      Still active · check the due day
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={pending || !row}
                    onClick={() => row && ctx.patch(row, { status: "cancelled" })}
                  >
                    Cancelled
                  </button>
                </div>
              );
            })}
          </details>
        ) : null}
        {amountReviews.length > 0 ? (
          <details className="rounded border border-rule px-3 py-2 text-xs">
            <summary>
              Amount changed? · {amountReviews.length} bill
              {amountReviews.length === 1 ? "" : "s"}
            </summary>
            <p className="py-1 text-ink-muted">
              Recent charges have settled at a new figure. This offers it; it does not
              change the declared amount until you set it.
            </p>
            {amountReviews.map((item) => {
              const row = rowById.get(item.billId);
              return (
                <div className="flex flex-wrap gap-3 py-1" key={item.billId}>
                  <button
                    type="button"
                    className="underline"
                    onClick={() => setDetail(item.billId)}
                  >
                    {item.name} · {formatUsd(item.declaredCents)} →{" "}
                    {formatUsd(item.observedCents)}
                  </button>
                  <button
                    type="button"
                    disabled={pending || !row}
                    onClick={() =>
                      row && ctx.patch(row, { expectedCents: item.observedCents })
                    }
                  >
                    Set {formatUsd(item.observedCents)}
                  </button>
                </div>
              );
            })}
          </details>
        ) : null}
        <ForecastDetails
          months={forecast.months}
          comparison={forecast.comparison}
          incomePlan={forecast.incomePlan}
        />
      </div>
      <Drawer
        open={Boolean(opened)}
        onClose={() => setDetail(null)}
        labelledBy={titleId}
      >
        <DrawerHeader
          titleId={titleId}
          title={opened?.name ?? "Bill"}
          onClose={() => setDetail(null)}
        />
        {opened ? (
          <div className="flex-1 space-y-3 overflow-auto p-3">
            <nav className="flex gap-3 text-xs">
              <Link
                className="underline"
                href={budgetEnvelopeHref(opened.id, data.month)}
              >
                Open in Budget
              </Link>
              <Link
                className="underline"
                href={activityRegisterHref(opened.id, data.month)}
              >
                View transactions
              </Link>
            </nav>
            {error ? (
              <p role="alert" className="text-sm text-priority-a">
                {error}
              </p>
            ) : null}
            <label className="block text-xs">
              Bill name
              <input
                key={opened.name}
                defaultValue={opened.name}
                disabled={pending}
                className="mt-1 w-full rounded border border-rule bg-surface p-2 text-base md:text-sm"
                onBlur={(event) => {
                  if (event.target.value !== opened.name)
                    ctx.edit(opened.id, { name: event.target.value });
                }}
              />
            </label>
            <label className="block text-xs">
              Group
              <select
                className="mt-1 w-full rounded border border-rule bg-surface p-2 text-base md:text-sm"
                value={opened.groupId ?? ""}
                disabled={pending}
                onChange={(event) =>
                  ctx.edit(opened.id, { groupId: event.target.value || null })
                }
              >
                <option value="">Ungrouped</option>
                {ctx.groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            <BillFields
              bill={opened}
              pending={pending}
              chargeKeys={forecast.chargeKeys.get(opened.id)}
              onPatchBill={ctx.patch}
              onEditPayees={setPayeeBill}
            />
            <label className="block text-xs">
              Notes
              <textarea
                key={opened.notes}
                defaultValue={opened.notes}
                onBlur={(event) => {
                  if (event.target.value !== opened.notes)
                    ctx.edit(opened.id, { notes: event.target.value });
                }}
                className="mt-1 w-full rounded border border-rule bg-surface p-2 text-base md:text-sm"
              />
            </label>
            <p className="text-xs text-ink-muted">
              Changes save when you leave a field.
            </p>
          </div>
        ) : null}
      </Drawer>
      {reviewing ? (
        <ReviewDrawer
          review={review}
          todayKey={data.todayKey}
          onClose={() => setReviewing(false)}
          onSaved={() => router.refresh()}
        />
      ) : null}
      {payeeBill ? (
        <CommitmentPayeeDialog
          commitment={{
            id: payeeBill.id,
            name: payeeBill.name,
            payeeIds: payees
              .filter((row) => row.budgetCategoryId === payeeBill.id)
              .map((row) => row.id),
          }}
          payees={payees}
          onClose={() => setPayeeBill(null)}
          onSaved={() => {
            setPayeeBill(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
