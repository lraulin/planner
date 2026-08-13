"use client";

import { useCallback, useMemo, useState } from "react";
import { DataGrid, type RowDrag } from "@/components/grid/DataGrid";
import {
  GridToolbar,
  switchValue,
  type GridSwitch,
} from "@/components/grid/GridToolbar";
import { collectDistinctValues } from "@/lib/grid/distinct";
import type { GridDefaults } from "@/components/grid/useGridState";
import { useModuleViews } from "@/components/grid/useModuleViews";
import { chooserScope } from "@/lib/settings/scopes";
import { NodeDetailDrawer } from "@/components/detail/NodeDetailDrawer";
import {
  ToolbarButton,
  ToolbarSelect,
  ToolbarToggle,
} from "@/components/tabs/tabChrome";
import { useGridTab } from "@/components/tabs/useGridTab";
import { useNodeCommandDeck } from "@/components/grid/useNodeCommandDeck";
import {
  applyDateFilter,
  buildChooserItems,
  chooserRows,
  chooserView,
  CHOOSER_VIEWS,
  DATE_FILTERS,
  TC_UNRANKED_GROUP_ID,
  tcLetterFromGroupId,
} from "@/lib/chooser/views";
import {
  planTcAssign,
  planTcClear,
  planTcDrop,
  planTcDropOnLetter,
  TC_LETTERS,
  type TcAssignment,
} from "@/lib/chooser/tcPriority";
import type { ChooserDateFilter, ChooserViewId } from "@/lib/chooser/types";
import type { PriorityLetter } from "@/db/schema";
import type { OutlineNode } from "@/lib/tree/types";
import { setTcPrioritiesAction } from "@/app/plan/outline/actions";
import {
  buildChooserColumns,
  CHOOSER_DEFAULT_ORDER,
  CHOOSER_TODO_ORDER,
  type ChooserColumnCtx,
  type ChooserFacts,
} from "./chooserColumns";
import { ChooserSettingsDialog } from "./ChooserSettingsDialog";
import { useChooserSettings } from "./useChooserSettings";

/**
 * Achieve's Task Chooser tab (manual §8): every leaf task and task-less project across the
 * outline, ranked by score, filtered by date band.
 *
 * A view onto the tree rather than the tree itself, so it reuses `useGridTab` for
 * selection / drawer / rename / inline writes exactly as the Projects, Tasks and Goals
 * tabs do. Everything specific to the chooser — what counts as a candidate, how it scores,
 * which date bands survive — lives in `src/lib/chooser/**` and is unit-tested there.
 */

/** Achieve's Show More / Show Less step, and where the list starts. */
const PAGE_STEP = 10;
const INITIAL_LIMIT = 20;

/**
 * Achieve gates the header funnels behind an "Advanced Filters" toggle here, because the
 * Chooser's own scoring controls are the primary way to narrow it. Kept, now persisted.
 */
const CHOOSER_SWITCHES: GridSwitch[] = [
  { id: "advancedFilters", label: "Advanced Filters", defaultOn: false },
];

/**
 * The To-do List's TC Priority layout, or the scored one. Module scope so `useModuleViews` can
 * memoise on the base view id.
 */
function viewDefaults(id: string): GridDefaults {
  return {
    order: chooserView(id as ChooserViewId).tcPriority
      ? CHOOSER_TODO_ORDER
      : CHOOSER_DEFAULT_ORDER,
  };
}

/**
 * The weights, per view. Achieve's own rule (manual §8.1.4) and ours since before saved views
 * existed — this is what carries them into a view you save.
 */
function chooserScopes(viewId: string): readonly string[] {
  return [chooserScope(viewId)];
}

export function ChooserGrid({
  initialNodes,
  plannedNodeIds,
}: {
  initialNodes: OutlineNode[];
  /** Tasks already sitting on a day in the Day tab; see `settings.hidePlanned`. */
  plannedNodeIds?: string[];
}) {
  const tab = useGridTab(initialNodes);
  // The Chooser is a projection of the tree like Tasks and Projects are, so it gets the same
  // non-structural command set rather than the two-action `rowActions` shim it used to pass —
  // which was the last caller of that path, and the reason the path existed.
  const nodeCommands = useNodeCommandDeck({
    nodes: tab.nodes,
    selectedId: tab.selectedId,
    selectedIds: tab.selectedIds,
    apply: tab.apply,
    onOpen: tab.openDetail,
    onRename: tab.setEditingId,
    onCopyAsText: tab.copySelectionAsText,
    onStateChange: tab.cellHandlers.onStateChange,
  });
  const [limit, setLimit] = useState(INITIAL_LIMIT);
  const [showSettings, setShowSettings] = useState(false);
  const [counts, setCounts] = useState({ shown: 0, total: 0 });

  const allColumns = useMemo(() => buildChooserColumns(tab.today), [tab.today]);
  const views = useModuleViews({
    moduleId: "chooser",
    builtIn: CHOOSER_VIEWS,
    defaultViewId: "best-overall",
    columns: allColumns,
    defaultsFor: viewDefaults,
    viewScopes: chooserScopes,
  });
  const gridState = views.grid;

  /**
   * Everything that scores reads the **base** view, not the selected one: `chooserView`,
   * `defaultSettings` and `buildChooserItems` all take a `ChooserViewId`, and a saved view's id
   * is not one of the five. The weights themselves are keyed by the selected view, so a saved
   * view keeps its own.
   */
  const { settings, update, reset } = useChooserSettings(views.viewId, views.base);
  const view = chooserView(views.base);
  const dateFilter = settings.dateFilter;

  /**
   * Scoring needs a day to measure against, and on the server there isn't one. `null` is
   * handled all the way down: every date term scores zero and every date band stands down,
   * so both renders agree and the date component of the ranking settles in at hydration.
   */
  const today = tab.today;

  const planned = useMemo(() => new Set(plannedNodeIds ?? []), [plannedNodeIds]);

  const scored = useMemo(
    () =>
      buildChooserItems(tab.nodes, {
        today,
        viewId: views.base,
        settings,
        plannedNodeIds: planned,
      }),
    [tab.nodes, today, views.base, settings, planned],
  );

  /**
   * Paging belongs to the list in front of you, so a view switch starts at the top again. Same
   * render-time reset the node grids use for their navigable ids.
   */
  const [seenViewId, setSeenViewId] = useState(views.viewId);
  if (seenViewId !== views.viewId) {
    setSeenViewId(views.viewId);
    setLimit(INITIAL_LIMIT);
  }

  const matching = useMemo(
    () => applyDateFilter(scored, dateFilter, today),
    [scored, dateFilter, today],
  );

  const visible = useMemo(() => matching.slice(0, limit), [matching, limit]);

  const facts = useMemo(() => {
    const map = new Map<string, ChooserFacts>();
    matching.forEach((item, index) => {
      map.set(item.node.id, {
        rank: index + 1,
        score: item.score,
        effectiveDeadline: item.effectiveDeadline,
      });
    });
    return map;
  }, [matching]);

  const advancedFilters = switchValue(gridState, CHOOSER_SWITCHES[0]);

  const rows = useMemo(
    () => chooserRows(visible, dateFilter, today, view.tcPriority),
    [visible, dateFilter, today, view.tcPriority],
  );

  const distinctValues = useMemo(
    () =>
      collectDistinctValues(
        allColumns,
        rows.flatMap((row) => (row.kind === "node" ? [row] : [])),
      ),
    [allColumns, rows],
  );

  /**
   * Apply a ranking plan: patch every affected row optimistically, then persist the batch.
   *
   * All of them, not just the dragged one — a drop renumbers a whole letter, and patching
   * only the row under the cursor would show it landing while its neighbours kept their
   * old numbers until the server round-trip returned.
   */
  const applyTcPlan = useCallback(
    (assignments: TcAssignment[]) => {
      if (assignments.length === 0) return;
      for (const assignment of assignments) {
        tab.patch(assignment.nodeId, {
          tcPriorityLetter: assignment.letter,
          tcPriorityRank: assignment.rank,
        });
      }
      tab.apply(() => setTcPrioritiesAction(assignments));
    },
    [tab],
  );

  const onTcAssign = useCallback(
    (node: OutlineNode, letter: PriorityLetter | null, rank: number | null) => {
      applyTcPlan(
        letter === null
          ? planTcClear(tab.nodes, node.id)
          : planTcAssign(tab.nodes, node.id, letter, rank),
      );
    },
    [applyTcPlan, tab.nodes],
  );

  const columnCtx: ChooserColumnCtx = useMemo(
    () => ({ ...tab.cellHandlers, facts, onTcAssign }),
    [tab.cellHandlers, facts, onTcAssign],
  );

  /**
   * Drag-to-rank, active only in a TC-priority view.
   *
   * Plans are computed against `tab.nodes` — the whole outline — rather than the visible
   * rows, so a date filter or a Show Less cannot cause a renumber that forgets the items
   * it is hiding.
   */
  const planTcFor = useCallback(
    (dragIds: readonly string[], targetId: string, zone: string): TcAssignment[] => {
      if (targetId === TC_UNRANKED_GROUP_ID) return planTcClear(tab.nodes, dragIds);

      const letter = tcLetterFromGroupId(targetId);
      if (letter !== null) {
        if (!(TC_LETTERS as string[]).includes(letter)) return [];
        return planTcDropOnLetter(tab.nodes, dragIds, letter as PriorityLetter);
      }

      // "inside" has no meaning in a flat list; treat it as landing after the row.
      return planTcDrop(
        tab.nodes,
        dragIds,
        targetId,
        zone === "before" ? "before" : "after",
      );
    },
    [tab.nodes],
  );

  const { selectOne } = tab;

  /**
   * TC Priority is ranked by drag. While a header sort is active the on-screen order is
   * not the ranking, so dragging would write ranks the user cannot see — stand down
   * (cycle the column header back to unsorted to drag again).
   */
  const rowDrag: RowDrag | undefined = useMemo(() => {
    if (!view.tcPriority || gridState.sort) return undefined;

    return {
      resolve: (dragIds, targetId, zone) =>
        planTcFor(dragIds, targetId, zone).length > 0 ? { depth: 0 } : null,
      onDrop: (dragIds, targetId, zone) => {
        if (dragIds[0]) selectOne(dragIds[0]);
        applyTcPlan(planTcFor(dragIds, targetId, zone));
      },
    };
  }, [view.tcPriority, gridState.sort, planTcFor, selectOne, applyTcPlan]);

  /** The `Project:` line under the toolbar — the selected row's ancestor path. */
  const breadcrumb = useMemo(() => {
    if (!tab.selectedId) return null;
    return matching.find((item) => item.node.id === tab.selectedId)?.breadcrumb ?? null;
  }, [tab.selectedId, matching]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <GridToolbar
        grid={gridState}
        gridLabel="Task Chooser"
        allColumns={allColumns}
        distinctValues={distinctValues}
        switches={CHOOSER_SWITCHES}
        counts={{ shown: counts.shown, total: matching.length }}
        error={tab.error}
        views={views}
        left={
          <>
            {/*
              Achieve pairs the view dropdown with a Change Settings button, and the dialog
              behind it is this view's weights (manual §8.1.4). Kept beside the shared picker
              for the same reason: it is where the Chooser's own per-view settings live.
            */}
            <ToolbarButton onClick={() => setShowSettings(true)}>
              Settings…
            </ToolbarButton>

            {/*
              No count between these any more. The chip bar already says "Showing N of M",
              and this said "20 of 47" beside it saying "Showing 20 of 20" — two numbers
              about the same list that disagreed, because the grid can only count the rows
              it was handed. `counts` below gives it the real denominator instead.
            */}
            <span className="flex items-center gap-1">
              <ToolbarButton
                onClick={() => setLimit((n) => Math.max(PAGE_STEP, n - PAGE_STEP))}
                disabled={limit <= PAGE_STEP}
                title="Show ten fewer"
              >
                Show Less
              </ToolbarButton>
              <ToolbarButton
                onClick={() => setLimit((n) => n + PAGE_STEP)}
                disabled={limit >= matching.length}
                title="Show ten more"
              >
                Show More
              </ToolbarButton>
            </span>

            <ToolbarSelect
              label="Date"
              value={dateFilter}
              onChange={(value) => {
                update({ dateFilter: value as ChooserDateFilter });
                setLimit(INITIAL_LIMIT);
              }}
              options={DATE_FILTERS.map((entry) => ({
                value: entry.id,
                label: entry.label,
              }))}
            />
            {/*
              Two shortcuts into fields of the Chooser's own settings, rather than second
              mechanisms beside them — which is why neither is a `switches` entry. Next
              actions is the one worth having on the bar: it is the difference between
              "everything available" and "one thing per project", and burying the switch in
              a dialog is what made it feel like a property of the Next Action Only view.
            */}
            <ToolbarToggle
              checked={settings.onlyNextAction}
              onChange={() => update({ onlyNextAction: !settings.onlyNextAction })}
              label="Next actions"
            />
            <ToolbarToggle
              checked={settings.states.includes("postponed")}
              onChange={() =>
                update({
                  states: settings.states.includes("postponed")
                    ? settings.states.filter((state) => state !== "postponed")
                    : [...settings.states, "postponed"],
                })
              }
              label="Deferred"
            />
          </>
        }
        commandCapabilities={nodeCommands.capabilities}
      />

      {nodeCommands.dialogs}

      <div className="flex flex-none items-baseline gap-2 border-b border-rule bg-surface-raised/60 px-4 py-1.5">
        <span className="flex-none text-[0.6875rem] font-medium uppercase tracking-wider text-ink-faint">
          Project
        </span>
        <span className="truncate text-[0.8125rem] text-ink-muted">
          {breadcrumb === null
            ? "Select a row to see where it sits."
            : breadcrumb.length === 0
              ? "(No parent — top level)"
              : breadcrumb.join(" › ")}
        </span>
      </div>

      <DataGrid
        rows={rows}
        columns={gridState.columns}
        allColumns={allColumns}
        columnCtx={columnCtx}
        selectedId={tab.selectedId}
        selectedIds={tab.selectedIds}
        onSelect={tab.select}
        onOpenDetail={tab.openDetail}
        ariaLabel="Task Chooser"
        onNavigableIdsChange={tab.setNavigableIds}
        rowMenu={nodeCommands.rowMenu}
        rowSwipe={nodeCommands.rowSwipe}
        rowDrag={rowDrag}
        rowNumbers
        enableFilters={advancedFilters}
        enableSort
        sorts={gridState.sorts}
        onSortChange={gridState.toggleSort}
        onSetSort={gridState.setSort}
        filters={gridState.filters}
        onFilterChange={gridState.setFilter}
        advancedFilter={gridState.advancedFilter}
        search={gridState.search}
        distinctValues={distinctValues}
        onCountsChange={setCounts}
        widths={gridState.widths}
        onResizeColumn={gridState.setWidth}
        onResetColumnWidth={gridState.clearWidth}
        columnControls={gridState.columnControls}
        collapsedGroups={gridState.collapsedGroups}
        onToggleGroup={gridState.toggleGroup}
        density={gridState.density}
        empty={
          <div className="flex h-full items-center justify-center p-8 text-[0.9375rem] text-ink-muted">
            Nothing to choose from in this view.
          </div>
        }
      />

      <NodeDetailDrawer
        node={tab.detailNode}
        nodes={tab.nodes}
        onClose={() => tab.setDetailId(null)}
      />

      {showSettings && (
        <ChooserSettingsDialog
          open
          view={view}
          viewName={views.current?.name ?? view.label}
          settings={settings}
          onChange={update}
          onReset={reset}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
