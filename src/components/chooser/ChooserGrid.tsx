"use client";

import { useCallback, useMemo, useState } from "react";
import { DataGrid, type RowDrag } from "@/components/grid/DataGrid";
import { ShowFieldsDialog } from "@/components/grid/ShowFieldsDialog";
import { useGridColumns } from "@/components/grid/useGridColumns";
import { NodeDetailDrawer } from "@/components/detail/NodeDetailDrawer";
import {
  ErrorBanner,
  TabToolbar,
  ToolbarButton,
  ToolbarSelect,
  ToolbarToggle,
} from "@/components/tabs/tabChrome";
import { useGridTab } from "@/components/tabs/useGridTab";
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
import { setTcPrioritiesAction } from "@/app/outline/actions";
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

export function ChooserGrid({ initialNodes }: { initialNodes: OutlineNode[] }) {
  const tab = useGridTab(initialNodes);
  const [viewId, setViewId] = useState<ChooserViewId>("best-overall");
  const [dateFilter, setDateFilter] = useState<ChooserDateFilter>("none");
  const [limit, setLimit] = useState(INITIAL_LIMIT);
  const [advancedFilters, setAdvancedFilters] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showFields, setShowFields] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const { settings, update, reset } = useChooserSettings(viewId);
  const view = chooserView(viewId);

  const allColumns = useMemo(() => buildChooserColumns(), []);
  const columnState = useGridColumns(
    `chooser:${viewId}`,
    allColumns,
    view.tcPriority ? CHOOSER_TODO_ORDER : CHOOSER_DEFAULT_ORDER,
  );

  /**
   * Scoring needs a day to measure against, and on the server there isn't one. `null` is
   * handled all the way down: every date term scores zero and every date band stands down,
   * so both renders agree and the date component of the ranking settles in at hydration.
   */
  const today = tab.today;

  const scored = useMemo(
    () =>
      buildChooserItems(tab.nodes, {
        today,
        viewId,
        settings,
      }),
    [tab.nodes, today, viewId, settings],
  );

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

  const rows = useMemo(
    () => chooserRows(visible, dateFilter, today, view.tcPriority),
    [visible, dateFilter, today, view.tcPriority],
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
    (dragId: string, targetId: string, zone: string): TcAssignment[] => {
      if (targetId === TC_UNRANKED_GROUP_ID) return planTcClear(tab.nodes, dragId);

      const letter = tcLetterFromGroupId(targetId);
      if (letter !== null) {
        if (!(TC_LETTERS as string[]).includes(letter)) return [];
        return planTcDropOnLetter(tab.nodes, dragId, letter as PriorityLetter);
      }

      // "inside" has no meaning in a flat list; treat it as landing after the row.
      return planTcDrop(
        tab.nodes,
        dragId,
        targetId,
        zone === "before" ? "before" : "after",
      );
    },
    [tab.nodes],
  );

  const { setSelectedId } = tab;

  const rowDrag: RowDrag | undefined = useMemo(() => {
    if (!view.tcPriority) return undefined;

    return {
      resolve: (dragId, targetId, zone) =>
        planTcFor(dragId, targetId, zone).length > 0 ? { depth: 0 } : null,
      onDrop: (dragId, targetId, zone) => {
        setSelectedId(dragId);
        applyTcPlan(planTcFor(dragId, targetId, zone));
      },
    };
  }, [view.tcPriority, planTcFor, setSelectedId, applyTcPlan]);

  /** The `Project:` line under the toolbar — the selected row's ancestor path. */
  const breadcrumb = useMemo(() => {
    if (!tab.selectedId) return null;
    return matching.find((item) => item.node.id === tab.selectedId)?.breadcrumb ?? null;
  }, [tab.selectedId, matching]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <TabToolbar>
        <ToolbarSelect
          label="View"
          value={viewId}
          onChange={(value) => {
            setViewId(value as ChooserViewId);
            setLimit(INITIAL_LIMIT);
          }}
          options={CHOOSER_VIEWS.map((entry) => ({
            value: entry.id,
            label: entry.label,
          }))}
        />
        <ToolbarButton onClick={() => setShowSettings(true)}>Settings…</ToolbarButton>

        <span className="flex items-center gap-2">
          <ToolbarButton
            onClick={() => setLimit((n) => Math.max(PAGE_STEP, n - PAGE_STEP))}
            disabled={limit <= PAGE_STEP}
          >
            Show Less
          </ToolbarButton>
          <span className="tabular text-[0.8125rem] text-ink-muted">
            {visible.length} of {matching.length}
          </span>
          <ToolbarButton
            onClick={() => setLimit((n) => n + PAGE_STEP)}
            disabled={limit >= matching.length}
          >
            Show More
          </ToolbarButton>
        </span>

        <ToolbarSelect
          label="Date"
          value={dateFilter}
          onChange={(value) => {
            setDateFilter(value as ChooserDateFilter);
            setLimit(INITIAL_LIMIT);
          }}
          options={DATE_FILTERS.map((entry) => ({
            value: entry.id,
            label: entry.label,
          }))}
        />
        <ToolbarToggle
          checked={advancedFilters}
          onChange={() => setAdvancedFilters((v) => !v)}
          label="Advanced Filters"
        />
        {/* Achieve's Deferred toggle, kept as a shortcut into the state list rather than
            a second mechanism beside it. */}
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
        <ToolbarButton onClick={() => setShowFields(true)}>Show Fields</ToolbarButton>
        <ToolbarButton
          onClick={() => tab.selectedId && tab.setEditingId(tab.selectedId)}
          disabled={!tab.selectedId}
          title="F2"
        >
          Rename
        </ToolbarButton>
        <ToolbarButton
          onClick={() => tab.selectedId && tab.openDetail(tab.selectedId)}
          disabled={!tab.selectedId}
          title="Enter"
        >
          Open
        </ToolbarButton>
      </TabToolbar>

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

      {tab.error && <ErrorBanner message={tab.error} />}

      <DataGrid
        rows={rows}
        columns={columnState.columns}
        columnCtx={columnCtx}
        selectedId={tab.selectedId}
        onSelect={tab.setSelectedId}
        onOpenDetail={tab.openDetail}
        ariaLabel="Task Chooser"
        rowMenu={tab.rowMenu}
        rowDrag={rowDrag}
        enableFilters={advancedFilters}
        collapsedGroups={collapsedGroups}
        onToggleGroup={(id) =>
          setCollapsedGroups((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          })
        }
        empty={
          <div className="flex h-full items-center justify-center p-8 text-[0.9375rem] text-ink-muted">
            Nothing to choose from in this view.
          </div>
        }
      />

      <NodeDetailDrawer node={tab.detailNode} onClose={() => tab.setDetailId(null)} />

      {showSettings && (
        <ChooserSettingsDialog
          open
          view={view}
          settings={settings}
          onChange={update}
          onReset={reset}
          onClose={() => setShowSettings(false)}
        />
      )}

      <ShowFieldsDialog
        open={showFields}
        allColumns={allColumns}
        shownIds={columnState.order}
        onShow={columnState.show}
        onHide={columnState.hide}
        onMove={columnState.move}
        onReset={columnState.reset}
        onClose={() => setShowFields(false)}
      />
    </div>
  );
}
