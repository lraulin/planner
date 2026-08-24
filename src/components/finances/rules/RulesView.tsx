"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  deleteRuleAction,
  listRulesAction,
  moveRuleAction,
  seedRulesAction,
  setRuleEnabledAction,
} from "@/app/finances/actions";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import { DataGrid, type RowDrag } from "@/components/grid/DataGrid";
import type { MenuItem } from "@/components/grid/ContextMenu";
import { rowMenuFor } from "@/components/grid/rowMenu";
import { catalogCapabilities } from "@/components/grid/catalogCommands";
import { GridToolbar } from "@/components/grid/GridToolbar";
import { useModuleViews } from "@/components/grid/useModuleViews";
import type { GridDefaults } from "@/components/grid/useGridState";
import { useMultiSelect } from "@/components/grid/useMultiSelect";
import { useNavigableIds } from "@/components/grid/useNavigableIds";
import { useViewStateUrl } from "@/components/url/useViewStateUrl";
import { collectDistinctValues } from "@/lib/grid/distinct";
import { isTypingTarget } from "@/lib/keyboard";
import type { RuleRow } from "@/lib/finances/rules/queries";
import { droppedRulePosition, nudgeRulePosition } from "@/lib/finances/rules/order";
import type { GridRow } from "@/lib/tree/slice";
import { RuleDrawer } from "./RuleDrawer";
import { RulePreviewDialog } from "./RulePreviewDialog";
import { RULE_COLUMN_IDS, ruleColumns, type RuleColumnCtx } from "./ruleColumns";

const RULE_VIEWS = [{ id: "all", label: "All Rules" }] as const;

/**
 * Sorted by `sortKey`, and that is not a preference.
 *
 * The order **is** the priority: rules run top to bottom and the first match wins. Sorting the
 * grid by name would show a different order from the one that runs, which is the one thing this
 * page must never do.
 */
function viewDefaults(): GridDefaults {
  return {
    order: [...RULE_COLUMN_IDS],
    sorts: [],
  };
}

export function RulesView({
  initialRules,
  payees,
  accounts,
  categories,
}: {
  initialRules: RuleRow[];
  payees: readonly { id: string; name: string }[];
  accounts: readonly { id: string; name: string }[];
  categories: readonly { id: string; label: string }[];
}) {
  const [rows, setRows] = useState(initialRules);
  const [seenServerRows, setSeenServerRows] = useState(initialRules);
  const [counts, setCounts] = useState({ shown: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RuleRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [pending, startTransition] = useTransition();
  const { detail: openId, setDetail: setOpenId } = useViewStateUrl();

  if (initialRules !== seenServerRows) {
    setSeenServerRows(initialRules);
    setRows(initialRules);
  }

  const views = useModuleViews({
    moduleId: "finance-rules",
    builtIn: RULE_VIEWS,
    defaultViewId: "all",
    columns: ruleColumns,
    defaultsFor: viewDefaults,
  });
  const gridState = views.grid;

  const gridRows: GridRow<RuleRow>[] = useMemo(
    () => rows.map((node) => ({ kind: "node" as const, id: node.id, node, depth: 0 })),
    [rows],
  );
  const distinctValues = useMemo(
    () =>
      collectDistinctValues(
        ruleColumns,
        gridRows.flatMap((row) => (row.kind === "node" ? [row] : [])),
      ),
    [gridRows],
  );
  const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const { order, onIdsChange } = useNavigableIds(rowIds);
  const multi = useMultiSelect(order, null);
  const { selectedId, selectedIds, select, move } = multi;

  const refresh = useCallback(() => {
    startTransition(async () => {
      const result = await listRulesAction();
      if (result.ok) setRows(result.data);
      else setError(result.error);
    });
  }, []);

  const openDrawer = useCallback((id: string) => setOpenId(id), [setOpenId]);
  const closeDrawer = useCallback(() => {
    setOpenId(null);
    setCreating(false);
    refresh();
  }, [setOpenId, refresh]);

  const toggleEnabled = useCallback(
    (ruleId: string, enabled: boolean) => {
      setError(null);
      startTransition(async () => {
        const result = await setRuleEnabledAction(ruleId, enabled);
        if (!result.ok) setError(result.error);
        refresh();
      });
    },
    [refresh],
  );

  const requestDelete = useCallback(
    (id: string) => {
      const row = rows.find((entry) => entry.id === id);
      if (row) setPendingDelete(row);
    },
    [rows],
  );

  const confirmDelete = useCallback(() => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteRuleAction(target.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (openId === target.id) closeDrawer();
      else refresh();
    });
  }, [pendingDelete, openId, closeDrawer, refresh]);

  /**
   * Move one rule up or down by one place.
   *
   * The touch path, and the keyboard one. Drag is disabled below `md`
   * (`agent-os/standards/components/responsive.md`), and this page's order is its whole
   * meaning, so a phone must be able to change it without a drag.
   */
  const nudge = useCallback(
    (ruleId: string, direction: -1 | 1) => {
      const position = nudgeRulePosition(
        rows.map((row) => row.id),
        ruleId,
        direction,
      );
      if (!position) return;

      setError(null);
      startTransition(async () => {
        const result = await moveRuleAction(ruleId, position);
        if (!result.ok) setError(result.error);
        refresh();
      });
    },
    [rows, refresh],
  );

  const rowDrag: RowDrag = useMemo(
    () => ({
      resolve: (dragIds, targetId, zone) =>
        dragIds.length === 1 &&
        droppedRulePosition(rowIds, dragIds[0], targetId, zone) !== null
          ? { depth: 0 }
          : null,
      onDrop: (dragIds, targetId, zone) => {
        if (dragIds.length !== 1) return;
        const position = droppedRulePosition(rowIds, dragIds[0], targetId, zone);
        if (!position) return;
        setError(null);
        startTransition(async () => {
          const result = await moveRuleAction(dragIds[0], position);
          if (!result.ok) setError(result.error);
          refresh();
        });
      },
    }),
    [rowIds, refresh],
  );

  const seed = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const result = await seedRulesAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(
        result.data && result.data.created > 0
          ? `${result.data.created} starter rules added.`
          : "Starter rules are already here.",
      );
      refresh();
    });
  }, [refresh]);

  const capabilitiesFor = useCallback(
    (rowId: string | null, count: number) =>
      catalogCapabilities({
        createLabel: "New rule…",
        openLabel: "Edit rule…",
        selection: {
          id: rowId,
          count,
          label: rows.find((entry) => entry.id === rowId)?.name,
        },
        onCreate: () => setCreating(true),
        onOpen: openDrawer,
        onDelete: requestDelete,
        pageCommands: [
          {
            id: "rules.run",
            label: "Run rules…",
            group: "record",
            menu: "item",
            section: "Item",
            icon: "convert",
            run: () => setPreviewing(true),
          },
          {
            id: "rules.move-up",
            label: "Move up",
            group: "record",
            menu: "item",
            section: "Item",
            icon: "convert",
            rowMenu: true,
            disabled: rowId === null || rows[0]?.id === rowId,
            title:
              rowId === null
                ? "Select a rule first"
                : rows[0]?.id === rowId
                  ? "This rule already runs first"
                  : undefined,
            run: () => rowId && nudge(rowId, -1),
          },
          {
            id: "rules.move-down",
            label: "Move down",
            group: "record",
            menu: "item",
            section: "Item",
            icon: "convert",
            rowMenu: true,
            disabled: rowId === null || rows.at(-1)?.id === rowId,
            title:
              rowId === null
                ? "Select a rule first"
                : rows.at(-1)?.id === rowId
                  ? "This rule already runs last"
                  : undefined,
            run: () => rowId && nudge(rowId, 1),
          },
        ],
      }),
    [rows, openDrawer, requestDelete, nudge],
  );

  const commandCapabilities = useMemo(
    () => capabilitiesFor(selectedId, selectedIds.size),
    [capabilitiesFor, selectedId, selectedIds.size],
  );

  const rowMenu = useCallback(
    (id: string | null): MenuItem[] => rowMenuFor(capabilitiesFor(id, id ? 1 : 0)),
    [capabilitiesFor],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        openId ||
        creating ||
        previewing ||
        pendingDelete ||
        isTypingTarget(event.target)
      )
        return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        move(1, event.shiftKey);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        move(-1, event.shiftKey);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openId, creating, previewing, pendingDelete, move]);

  const openRule = openId ? (rows.find((row) => row.id === openId) ?? null) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <GridToolbar
        grid={gridState}
        gridLabel="Rules"
        allColumns={ruleColumns}
        distinctValues={distinctValues}
        counts={counts}
        error={error}
        views={views}
        commandCapabilities={commandCapabilities}
      />

      {notice !== null && (
        <div className="flex items-start gap-3 border-b border-rule px-4 py-2 text-[0.8125rem] text-ink-muted">
          <span className="min-w-0 flex-1">{notice}</span>
          <button
            type="button"
            className="shrink-0 text-ink-muted hover:text-ink"
            onClick={() => setNotice(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <DataGrid<RuleColumnCtx, RuleRow>
        rows={gridRows}
        columns={gridState.columns}
        allColumns={ruleColumns}
        columnCtx={{
          pending,
          onToggleEnabled: toggleEnabled,
          priorityById: new Map(rows.map((row, index) => [row.id, index + 1])),
        }}
        selectedId={selectedId}
        selectedIds={selectedIds}
        onSelect={select}
        onOpenDetail={openDrawer}
        ariaLabel="Rules"
        rowMenu={rowMenu}
        rowLabel={(row) => row.node.name || "Rule"}
        enableFilters
        filters={gridState.filters}
        onFilterChange={gridState.setFilter}
        advancedFilter={gridState.advancedFilter}
        search={gridState.search}
        distinctValues={distinctValues}
        onCountsChange={setCounts}
        onNavigableIdsChange={onIdsChange}
        widths={gridState.widths}
        onResizeColumn={gridState.setWidth}
        onResetColumnWidth={gridState.clearWidth}
        columnControls={gridState.columnControls}
        collapsedGroups={gridState.collapsedGroups}
        onToggleGroup={gridState.toggleGroup}
        density={gridState.density}
        rowDrag={rowDrag}
        empty={
          <div className="mx-auto w-full max-w-2xl p-6 text-center">
            <p className="mb-4 text-[0.9375rem] text-ink-muted">
              No rules yet. Start from the set this app shipped with, then edit them.
            </p>
            <button
              type="button"
              className="min-h-tap rounded border border-rule px-3 py-1.5 text-[0.8125rem] text-ink hover:bg-surface-raised md:min-h-0"
              onClick={seed}
            >
              Add the starter rules
            </button>
          </div>
        }
      />

      <RuleDrawer
        rule={creating ? null : openRule}
        payees={payees}
        accounts={accounts}
        categories={categories}
        open={creating || openRule !== null}
        onClose={closeDrawer}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this rule?"
        message={
          pendingDelete
            ? `Delete ${pendingDelete.name}? Rows it categorised keep their category until the rules are run again.`
            : ""
        }
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
      {previewing && (
        <RulePreviewDialog
          onClose={() => setPreviewing(false)}
          onRan={(message) => {
            setPreviewing(false);
            setNotice(message);
            refresh();
          }}
        />
      )}
    </div>
  );
}
