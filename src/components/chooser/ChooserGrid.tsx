"use client";

import { useMemo, useState } from "react";
import { DataGrid } from "@/components/grid/DataGrid";
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
} from "@/lib/chooser/views";
import type { ChooserDateFilter, ChooserViewId } from "@/lib/chooser/types";
import type { OutlineNode } from "@/lib/tree/types";
import {
  buildChooserColumns,
  CHOOSER_DEFAULT_ORDER,
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
    CHOOSER_DEFAULT_ORDER,
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
    () => chooserRows(visible, dateFilter, today),
    [visible, dateFilter, today],
  );

  const columnCtx: ChooserColumnCtx = useMemo(
    () => ({ ...tab.cellHandlers, facts }),
    [tab.cellHandlers, facts],
  );

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
        <ToolbarToggle
          checked={settings.includeDeferred}
          onChange={() => update({ includeDeferred: !settings.includeDeferred })}
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
