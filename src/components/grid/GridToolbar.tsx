"use client";

import { useState, type ReactNode } from "react";
import {
  asGroupBy,
  GROUP_BY_LABELS,
  MAX_GROUP_LEVELS,
  setGroupLevel,
  type GroupBy,
} from "@/lib/tree/slice";
import {
  ErrorBanner,
  TabToolbar,
  ToolbarButton,
  ToolbarSelect,
  ToolbarToggle,
} from "@/components/tabs/tabChrome";
import { GridFilterChips } from "./GridFilterChips";
import { GridFilterDialog } from "./GridFilterDialog";
import { GridSearchBox } from "./GridSearchBox";
import { ShowFieldsDialog } from "./ShowFieldsDialog";
import type { ColumnMeta } from "./columns";
import type { GridState } from "./useGridState";

/**
 * The controls every grid gets, assembled once.
 *
 * Before this, each tab hand-built roughly eight buttons and kept its distinguishing
 * toggles in plain `useState` — so unlike everything in `useGridState` they were lost on
 * reload, and adding a capability to one grid meant coding it into that grid. A tab now
 * declares **what it has** (its columns, its switches, its group dimensions) and this
 * supplies **how you control them**.
 *
 * Everything here is driven from `GridState`, which owns the single `grid:{tabId}` scope.
 * Nothing in this component holds view state of its own except which dialog is open.
 */

/** A tab-declared toggle. Its value lives in `settings.switches[id]`. */
export type GridSwitch = {
  id: string;
  label: string;
  /**
   * Value when the user has never touched it. The tab supplies this because only the tab
   * knows whether off or on is the sane start — `includeDeferred` defaults to *showing*
   * for reasons that would be wrong for `includeGoals`.
   */
  defaultOn?: boolean;
  title?: string;
};

export function GridToolbar({
  grid,
  gridLabel,
  allColumns,
  distinctValues,
  groupDimensions = [],
  groupIds = [],
  switches = [],
  counts,
  error,
  left,
  right,
}: {
  grid: GridState;
  /** Names the grid in the filter dialog title, e.g. "Tasks". */
  gridLabel: string;
  /** Every column the tab defines, visible or not. */
  allColumns: ColumnMeta[];
  distinctValues: Record<string, string[]>;
  /**
   * Dimensions this tab offers in Group by. Empty hides the control entirely — the Day and
   * Wish List grids have nothing meaningful to group by.
   */
  groupDimensions?: readonly GroupBy[];
  /** Group ids currently in the row set, from `DataGrid`'s `onGroupIdsChange`. */
  groupIds?: readonly string[];
  switches?: readonly GridSwitch[];
  counts: { shown: number; total: number };
  error?: string | null;
  /** Tab-specific selects that come first: Result Area, View, Project scope. */
  left?: ReactNode;
  /** Tab-specific actions that come last: Rename, Open, New note. */
  right?: ReactNode;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [fieldsOpen, setFieldsOpen] = useState(false);

  const activeGroupBy = asGroupBy(grid.groupBy);
  const allCollapsed =
    groupIds.length > 0 && groupIds.every((id) => grid.collapsedGroups.has(id));

  return (
    <>
      <TabToolbar>
        {left}

        <GridSearchBox value={grid.search} onChange={grid.setSearch} />

        <ToolbarButton
          onClick={() => setFilterOpen(true)}
          title="Filter on any column, including ones this view is not showing"
        >
          Filter{grid.advancedFilter ? " ●" : "…"}
        </ToolbarButton>

        {groupDimensions.length > 0 && (
          <GroupByLevels
            dimensions={groupDimensions}
            levels={activeGroupBy}
            onChange={(index, value) =>
              grid.setGroupBy(setGroupLevel(activeGroupBy, index, value))
            }
          />
        )}

        {groupIds.length > 0 && (
          <ToolbarButton
            onClick={() => grid.setAllGroupsCollapsed(groupIds, !allCollapsed)}
            title={allCollapsed ? "Expand every group" : "Collapse every group"}
          >
            {allCollapsed ? "Expand all" : "Collapse all"}
          </ToolbarButton>
        )}

        {switches.map((entry) => (
          <ToolbarToggle
            key={entry.id}
            checked={grid.switches[entry.id] ?? entry.defaultOn ?? false}
            onChange={() =>
              grid.setSwitch(
                entry.id,
                !(grid.switches[entry.id] ?? entry.defaultOn ?? false),
              )
            }
            label={entry.label}
          />
        ))}

        <ToolbarButton onClick={() => setFieldsOpen(true)}>Show Fields</ToolbarButton>

        <ToolbarSelect
          label="Density"
          value={grid.density}
          onChange={(value) =>
            grid.setDensity(value === "compact" ? "compact" : "comfortable")
          }
          options={[
            { value: "comfortable", label: "Comfortable" },
            { value: "compact", label: "Compact" },
          ]}
        />

        <ToolbarButton
          onClick={grid.clearFilters}
          disabled={!grid.narrowing}
          title="Clear every filter and the search on this view"
        >
          Clear filters
        </ToolbarButton>

        <ToolbarButton
          onClick={grid.reset}
          title="Clear filters, sort, column layout, grouping and density for this view"
        >
          Reset this grid
        </ToolbarButton>

        {right}
      </TabToolbar>

      {error && <ErrorBanner message={error} />}

      <GridFilterChips
        columns={allColumns}
        distinctValues={distinctValues}
        filters={grid.filters}
        advancedFilter={grid.advancedFilter}
        search={grid.search}
        shown={counts.shown}
        total={counts.total}
        onClearColumn={(columnId) =>
          grid.setFilter(columnId, { mode: "options", ids: [] })
        }
        onRemoveCondition={grid.removeAdvancedCondition}
        onClearSearch={() => grid.setSearch("")}
        onClearAll={grid.clearFilters}
      />

      <GridFilterDialog
        open={filterOpen}
        gridLabel={gridLabel}
        columns={allColumns}
        visibleIds={grid.order}
        distinctValues={distinctValues}
        filter={grid.advancedFilter}
        onApply={grid.setAdvancedFilter}
        onClose={() => setFilterOpen(false)}
      />

      <ShowFieldsDialog
        open={fieldsOpen}
        allColumns={allColumns}
        shownIds={grid.order}
        onShow={grid.show}
        onHide={grid.hide}
        onMove={grid.move}
        onPlace={grid.place}
        onReset={grid.resetColumns}
        onResetGrid={grid.reset}
        onClose={() => setFieldsOpen(false)}
      />
    </>
  );
}

/**
 * Group by, one select per level, plus one empty "then by…" select to add the next.
 *
 * Progressive rather than three selects up front: most grouping is one level, and a row of
 * three `(None)`s reads as a control that is doing something when it is not. A level only
 * appears once the one above it is set, so the toolbar grows only for people using it.
 *
 * A dimension already chosen at another level is left out of the remaining selects — it is
 * still reachable, because picking it *moves* it (see `setGroupLevel`), but offering it
 * twice invites a nesting that would do nothing.
 */
function GroupByLevels({
  dimensions,
  levels,
  onChange,
}: {
  dimensions: readonly GroupBy[];
  levels: readonly GroupBy[];
  onChange: (index: number, value: GroupBy | null) => void;
}) {
  // One select per set level, and a trailing empty one while there is room to add another.
  const slots = Math.min(levels.length + 1, MAX_GROUP_LEVELS, dimensions.length);

  return (
    <>
      {Array.from({ length: slots }, (_, index) => {
        const current = levels[index] ?? "";
        const available = dimensions.filter(
          (dim) => dim === current || !levels.includes(dim),
        );

        return (
          <ToolbarSelect
            key={index}
            label={index === 0 ? "Group by" : "then by"}
            value={current}
            onChange={(value) =>
              onChange(index, value === "" ? null : (value as GroupBy))
            }
            options={[
              // Clearing a level drops the ones under it — there would be nothing for them
              // to sit inside. `setGroupLevel` enforces that.
              { value: "", label: "(None)" },
              ...available.map((dim) => ({
                value: dim,
                label: GROUP_BY_LABELS[dim],
              })),
            ]}
          />
        );
      })}
    </>
  );
}

/**
 * Read a tab-declared switch, honouring its default. Tabs need this to build their row
 * slice, which happens before the toolbar renders.
 */
export function switchValue(
  grid: GridState,
  entry: Pick<GridSwitch, "id" | "defaultOn">,
): boolean {
  return grid.switches[entry.id] ?? entry.defaultOn ?? false;
}
