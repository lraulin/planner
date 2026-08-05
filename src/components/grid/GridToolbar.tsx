"use client";

import { useMemo, useState, type ReactNode } from "react";
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
import { useRegisterCommands } from "@/components/shell/CommandProvider";
import { OverflowMenu } from "@/components/shell/OverflowMenu";
import type { Command } from "@/lib/commands/registry";
import { GridFilterChips } from "./GridFilterChips";
import { GridFilterDialog } from "./GridFilterDialog";
import { GridSearchBox } from "./GridSearchBox";
import { ShowFieldsDialog } from "./ShowFieldsDialog";
import { ViewPicker } from "./ViewPicker";
import type { ColumnMeta } from "./columns";
import type { GridState } from "./useGridState";
import type { ModuleViewsApi } from "./useModuleViews";

const EMPTY_GROUP_DIMENSIONS: readonly GroupBy[] = [];
const EMPTY_GROUP_IDS: readonly string[] = [];
const EMPTY_SWITCHES: readonly GridSwitch[] = [];

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
  groupDimensions = EMPTY_GROUP_DIMENSIONS,
  groupIds = EMPTY_GROUP_IDS,
  switches = EMPTY_SWITCHES,
  counts,
  error,
  rowActions,
  views,
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
  /**
   * This grid's views, from `useModuleViews`. Supplying it renders the View select and
   * registers Save / Update / Rename / Delete.
   *
   * A prop rather than something each grid hand-places in `left`, which is what the last cycle
   * did three times: `data-grid.md` — "a tab declares what it has, it does not assemble
   * buttons. If you find yourself adding a control to one grid, add it to `GridToolbar`
   * instead and let every grid have it."
   */
  views?: ModuleViewsApi;
  /** Tab-specific selects that come first: Result Area, Project scope. */
  left?: ReactNode;
  /** Tab-specific actions that come last: Rename, Open, New note. */
  right?: ReactNode;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [fieldsOpen, setFieldsOpen] = useState(false);

  const activeGroupBy = asGroupBy(grid.groupBy);
  const allCollapsed =
    groupIds.length > 0 && groupIds.every((id) => grid.collapsedGroups.has(id));

  const selectedId = rowActions?.selectedId ?? null;
  const onRename = rowActions?.onRename;
  const onOpen = rowActions?.onOpen;
  const { reset: resetGrid, setAllGroupsCollapsed } = grid;

  /*
   * What this grid can do, published once for both the `⌘K` palette and the `⋯` menu.
   *
   * `hasOwnControl` marks the ones still holding a button on the bar: the palette lists
   * everything, `⋯` lists only what is not already visible. Memoised because
   * `useRegisterCommands` re-registers whenever this array changes, and re-registering sets
   * state — a fresh array each render would be an infinite loop.
   */
  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [
      {
        id: "view.filter",
        label: "Filter…",
        group: "view",
        keywords: "advanced condition where",
        hasOwnControl: true,
        run: () => setFilterOpen(true),
      },
      {
        id: "view.fields",
        label: "Show Fields",
        group: "view",
        keywords: "columns hide customize current view",
        run: () => setFieldsOpen(true),
      },
      {
        id: "view.reset",
        label: "Reset this grid",
        group: "view",
        keywords: "clear default columns layout",
        title: "Clear filters, sort, column layout, grouping and density for this view",
        run: resetGrid,
      },
    ];

    if (groupIds.length > 0) {
      list.splice(1, 0, {
        id: "view.collapse-all",
        label: allCollapsed ? "Expand all" : "Collapse all",
        group: "view",
        keywords: "groups",
        hasOwnControl: true,
        run: () => setAllGroupsCollapsed(groupIds, !allCollapsed),
      });
    }

    if (onRename && onOpen) {
      // Disabled rather than absent when nothing is selected: `registry.ts` — a command that
      // vanishes teaches you it does not exist. `title` is what says why.
      list.push(
        {
          id: "record.rename",
          label: "Rename",
          group: "record",
          shortcut: "F2",
          disabled: selectedId === null,
          title: selectedId === null ? "Select a row first" : undefined,
          hasOwnControl: true,
          run: () => selectedId && onRename(selectedId),
        },
        {
          id: "record.open",
          label: "Open",
          group: "record",
          shortcut: "⏎",
          disabled: selectedId === null,
          title: selectedId === null ? "Select a row first" : undefined,
          hasOwnControl: true,
          run: () => selectedId && onOpen(selectedId),
        },
      );
    }

    return list;
  }, [
    resetGrid,
    setAllGroupsCollapsed,
    groupIds,
    allCollapsed,
    selectedId,
    onRename,
    onOpen,
  ]);

  useRegisterCommands(commands);

  return (
    <>
      {/*
        "for this grid", not "for this view": there is now a View select on this bar, and
        Save / Update / Rename / Delete view are among the commands inside this menu. A label
        saying "this view" next to a control that changes the view would read as the menu
        acting on whichever view is selected.
      */}
      <TabToolbar pinned={<OverflowMenu label="More commands for this grid" />}>
        {/*
          Ahead of `left`: the view decides what the rest of the bar is even showing, and a
          module's own scope pickers narrow within it.
        */}
        {views && <ViewPicker views={views} />}
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

        <DensityToggle value={grid.density} onChange={grid.setDensity} />

        {/*
          There is no "Clear filters" button here any more. It was disabled in exactly the
          state where the chip bar is absent, so it could only ever be pressed while the
          chip bar was on screen offering "Clear all" — a control whose only two states are
          "unavailable" and "duplicated" is one control too many.

          "Show Fields" and "Reset this grid" are gone from the bar too, into `⋯` and the
          palette. Neither is used often enough to hold width on every grid on every screen
          forever — which is the test `data-grid.md` asks a toolbar button to pass. They are
          not hidden: `⋯` is one click away and visible on touch, which is what keeps them
          legal under `ux-principles.md`.
        */}

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
