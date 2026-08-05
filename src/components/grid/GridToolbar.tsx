"use client";

import { useState, type ReactNode } from "react";
import {
  asGroupBy,
  GROUP_BY_LABELS,
  MAX_GROUP_LEVELS,
  setGroupLevel,
  type GroupBy,
} from "@/lib/tree/slice";
import type { GridDensity } from "@/lib/settings/grid";
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
  rowActions,
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
  /**
   * Rename and Open for the selected row. Every node tab had these, spelled out identically,
   * and `ux-principles.md` requires them: `F2` and `Enter` are the real bindings, and a
   * shortcut with no visible button fails the person who does not know it yet. One prop
   * rather than fourteen lines per tab means they cannot drift apart.
   */
  rowActions?: {
    selectedId: string | null;
    onRename: (id: string) => void;
    onOpen: (id: string) => void;
  };
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

        <DensityToggle value={grid.density} onChange={grid.setDensity} />

        {/*
          There is no "Clear filters" button here any more. It was disabled in exactly the
          state where the chip bar is absent, so it could only ever be pressed while the
          chip bar was on screen offering "Clear all" — a control whose only two states are
          "unavailable" and "duplicated" is one control too many.
        */}

        <ToolbarButton
          onClick={grid.reset}
          title="Clear filters, sort, column layout, grouping and density for this view"
        >
          Reset this grid
        </ToolbarButton>

        {rowActions && (
          <>
            <ToolbarButton
              onClick={() =>
                rowActions.selectedId && rowActions.onRename(rowActions.selectedId)
              }
              disabled={!rowActions.selectedId}
              title="F2"
            >
              Rename
            </ToolbarButton>
            <ToolbarButton
              onClick={() =>
                rowActions.selectedId && rowActions.onOpen(rowActions.selectedId)
              }
              disabled={!rowActions.selectedId}
              title="Enter"
            >
              Open
            </ToolbarButton>
          </>
        )}

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
 * Row height, as two buttons rather than a labelled dropdown.
 *
 * It is a binary choice whose options are visible at a glance, which is a segmented control,
 * not a `<select>` — the old one spent a word of label plus a collapsed menu on something
 * that fits in eleven characters. The current state is the pressed button, so the control
 * says what it is doing without a label explaining that it is Density.
 */
function DensityToggle({
  value,
  onChange,
}: {
  value: GridDensity;
  onChange: (density: GridDensity) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Row height"
      className="flex flex-none overflow-hidden rounded border border-rule"
    >
      {(
        [
          ["comfortable", "Roomy", "Taller rows, easier inline editing"],
          ["compact", "Dense", "More rows per screen"],
        ] as const
      ).map(([density, label, title]) => (
        <button
          key={density}
          type="button"
          aria-pressed={value === density}
          title={title}
          onClick={() => onChange(density)}
          className={[
            "min-h-tap px-2 py-1 text-[0.8125rem] leading-none whitespace-nowrap transition-colors md:min-h-0",
            value === density
              ? "bg-select text-ink"
              : "text-ink-muted hover:bg-surface-raised hover:text-ink",
          ].join(" ")}
        >
          {label}
        </button>
      ))}
    </div>
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
