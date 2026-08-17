"use client";

import {
  useImperativeHandle,
  useMemo,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import {
  asGridGroupBy,
  GROUP_BY_LABELS,
  MAX_GROUP_LEVELS,
  setGroupLevel,
  type GridGroupBy,
} from "@/lib/grid/grouping";
import type { GridDensity } from "@/lib/settings/grid";
import {
  ErrorBanner,
  TabToolbar,
  ToolbarButton,
  ToolbarSegments,
  ToolbarSelect,
  ToolbarToggle,
  type ToolbarSegment,
} from "@/components/tabs/tabChrome";
import { useRegisterCommands } from "@/components/shell/CommandProvider";

import type { Command } from "@/lib/commands/registry";
import { gridViewLayoutCommands } from "@/lib/commands/gridViewCommands";
import { scopeCommand, type CommandScope } from "@/lib/commands/scope";
import { hasAnyNarrowing } from "@/lib/settings/grid";
import { GridFilterChips } from "./GridFilterChips";
import { GridFilterDialog } from "./GridFilterDialog";
import { GridSearchBox } from "./GridSearchBox";
import { ShowFieldsDialog } from "./ShowFieldsDialog";
import { ViewPicker } from "./ViewPicker";
import { CommandBar, hasVerbRow } from "./CommandBar";
import {
  buildGridCommands,
  type GridCommandCapabilities,
} from "@/lib/grid/commandDeck";
import type { ColumnMeta } from "./columns";
import type { GridState } from "./useGridState";
import type { ModuleViewsApi } from "./useModuleViews";

const EMPTY_GROUP_DIMENSIONS: readonly GridGroupBy[] = [];
const EMPTY_GROUP_IDS: readonly string[] = [];
const EMPTY_SWITCHES: readonly GridSwitch[] = [];

/**
 * The controls every grid gets, assembled once, in two rows.
 *
 * Before this, each tab hand-built roughly eight buttons and kept its distinguishing
 * toggles in plain `useState` — so unlike everything in `useGridState` they were lost on
 * reload, and adding a capability to one grid meant coding it into that grid. A tab now
 * declares **what it has** (its columns, its switches, its group dimensions, its command
 * capabilities) and this supplies **how you control them**.
 *
 * Row 1 (`CommandBar`) is the **page verb row**: the promoted icon buttons and the selection
 * chip. Named menus live in the shell, above the page bar. Row 2 is the **lens**: which view,
 * which scope, what is filtered out, how it is grouped, how tall the rows are.
 *
 * Everything here is driven from `GridState`, which owns the single `grid:{tabId}` scope.
 * Nothing in this component holds view state of its own except which dialog is open.
 */

/** Imperative entry so a page-level menu can open this grid's dialogs. */
export type GridToolbarHandle = {
  openFilter: () => void;
  openFields: () => void;
  reset: () => void;
  clearFilters: () => void;
};

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
  views,
  left,
  right,
  commandCapabilities,
  hostCommands,
  commandRow = true,
  commandScope,
  toolbarRef,
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
  groupDimensions?: readonly GridGroupBy[];
  /** Group ids currently in the row set, from `DataGrid`'s `onGroupIdsChange`. */
  groupIds?: readonly string[];
  switches?: readonly GridSwitch[];
  counts: { shown: number; total: number };
  error?: string | null;
  /**
   * This grid's views, from `useModuleViews`. Supplying it renders the View select and
   * registers Save / Save as / Rename / Delete.
   *
   * A prop rather than something each grid hand-places in `left`, which is what the last cycle
   * did three times: `data-grid.md` — "a tab declares what it has, it does not assemble
   * buttons. If you find yourself adding a control to one grid, add it to `GridToolbar`
   * instead and let every grid have it."
   */
  views?: ModuleViewsApi;
  /**
   * Commands belonging to the surface *around* this grid, merged into its command row.
   *
   * For a grid that is one mode of a larger tab rather than a module of its own — the
   * Weekly Schedule's Agenda. That tab already draws a command row; a second one below it
   * would be two menu bars stacked, and dropping the tab's own row instead would leave
   * `New Time Chart…` with no visible path on a desktop.
   */
  hostCommands?: readonly Command[];
  /** Tab-specific selects that come first: Result Area, Project scope. */
  left?: ReactNode;
  /** Tab-specific actions that come last: Rename, Open, New note. */
  right?: ReactNode;
  /**
   * What can be done to a row here, and what this page can make. Everything on the command row —
   * the menus, the icon buttons, the selection chip — comes from this one object, and so does the
   * grid's half of the palette and of every row menu.
   *
   * Omitted for a grid with no item actions at all: the command row then holds only the `View` menu
   * and the panel toggle.
   */
  commandCapabilities?: GridCommandCapabilities;
  /**
   * Draw this grid's icon/selection row. Default on. Two grids on one page pass
   * false so they do not stack two verb rows; the application menu is in the
   * shell either way. Commands still register, so the catalog stays complete.
   */
  commandRow?: boolean;
  /**
   * When two grids share a page, stamp their View commands so `view.filter` on
   * one cannot last-wins the other. Labels name the grid (`Filter for
   * Subscriptions & bills…`). Omit on a lone grid — ids stay `view.filter`.
   */
  commandScope?: CommandScope;
  /** Page-level Filter… / Show Fields / Reset act on the focused grid through this. */
  toolbarRef?: Ref<GridToolbarHandle>;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [fieldsOpen, setFieldsOpen] = useState(false);

  // A grid scope may outlive a dimension. Keep only dimensions this tab currently offers,
  // so a retired or cross-module value degrades to ungrouped instead of occupying a picker.
  const activeGroupBy = asGridGroupBy(grid.groupBy).filter((dimension) =>
    groupDimensions.includes(dimension),
  );
  const allCollapsed =
    groupIds.length > 0 && groupIds.every((id) => grid.collapsedGroups.has(id));

  const { reset: resetScope, setAllGroupsCollapsed, clearFilters } = grid;
  const revertView = views?.revert;
  const resetGrid = revertView ?? resetScope;
  const filtersNarrowing = hasAnyNarrowing(
    grid.filters,
    grid.advancedFilter,
    grid.search,
  );

  /*
   * There was a `rowActions` prop here that took a selection plus Open and Rename and built a
   * two-command capabilities object from it. It existed because the node tabs each spelled those
   * two buttons out by hand; by the end the Task Chooser was its only caller, and the Chooser now
   * declares full capabilities like every other projection of the tree. A shim with one caller is
   * a shim to delete.
   */
  const deckCommands = useMemo(
    () => (commandCapabilities ? buildGridCommands(commandCapabilities) : []),
    [commandCapabilities],
  );

  /*
   * What this grid can do, published once for every surface: the menu bar, the icon row, the
   * Commands panel, a row's context menu, `⋯`, and the `⌘K` palette.
   *
   * `ownControl` marks the ones whose control is a *widget* on the lens row rather than a command
   * button — Filter and the group collapse toggle. `⋯` skips exactly those, because down on a phone
   * that widget is the thing still on screen. Everything else, including the commands promoted to
   * the desktop icon row, stays in `⋯`.
   *
   * Memoised because `useRegisterCommands` re-registers whenever this array changes, and
   * re-registering sets state — a fresh array each render would be an infinite loop.
   */
  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [...(hostCommands ?? []), ...deckCommands];

    // Dual-grid pages publish focused + scoped layout commands themselves so
    // View lists Filter… (focused) before Filter for [name]…. A scoped toolbar
    // that also published would insert the named rows first (child mounts first).
    if (!commandScope) {
      list.push(
        ...gridViewLayoutCommands({
          openFilter: () => setFilterOpen(true),
          clearFilters,
          openFields: () => setFieldsOpen(true),
          reset: resetGrid,
          filtersActive: filtersNarrowing,
          resetTitle: revertView
            ? "Put the grid back to the named view it drifted from"
            : "Clear filters, sort, column layout, grouping and density for this grid",
        }),
      );
    }

    if (groupIds.length > 0) {
      const collapse: Command = {
        id: "view.collapse-all",
        label: allCollapsed ? "Expand all groups" : "Collapse all groups",
        group: "view",
        menu: "view",
        section: "Layout",
        icon: allCollapsed ? "expand" : "collapse",
        keywords: "groups",
        ownControl: true,
        run: () => setAllGroupsCollapsed(groupIds, !allCollapsed),
      };
      if (commandScope) {
        list.push(
          scopeCommand(
            collapse,
            commandScope,
            `${collapse.label} in ${commandScope.label}`,
          ),
        );
      } else {
        list.push(collapse);
      }
    }

    return list;
  }, [
    hostCommands,
    deckCommands,
    resetGrid,
    clearFilters,
    filtersNarrowing,
    setAllGroupsCollapsed,
    groupIds,
    allCollapsed,
    revertView,
    commandScope,
  ]);

  useRegisterCommands(commands);

  useImperativeHandle(
    toolbarRef,
    () => ({
      openFilter: () => setFilterOpen(true),
      openFields: () => setFieldsOpen(true),
      reset: resetGrid,
      clearFilters,
    }),
    [resetGrid, clearFilters],
  );

  return (
    <>
      {/*
        "for this grid", not "for this view": there is now a View select on this bar, and
        Save / Save as / Rename / Delete view are among the commands inside this menu. A label
        saying "this view" next to a control that changes the view would read as the menu
        acting on whichever view is selected.
      */}
      <TabToolbar
        commandRow={
          commandRow && hasVerbRow(commands, commandCapabilities?.selection) ? (
            <CommandBar
              commands={commands}
              selection={commandCapabilities?.selection}
            />
          ) : undefined
        }
      >
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
        {/*
          This is the group collapse, not the *item* collapse. They were both called
          "Collapse all" while they lived on the same row; the command is now "Collapse all
          groups" and the tree's is "Collapse all items", because the two ended up next to
          each other in one Organize/Layout pair of menus and had to say which was which.
        */}

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

          "Show Fields" and "Reset this grid" have no button either. They live in `View ▸
          Layout`, which is where you would look for them, and in the palette and `⋯`.
          Neither is used often enough to hold width on every grid on every screen forever —
          the test `data-grid.md` asks a toolbar button to pass. A named menu is what makes
          that demotion cost nothing: they are one click away *and* findable by reading,
          which the old unsorted `⋯` was not.
        */}

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
const DENSITY_SEGMENTS: readonly ToolbarSegment<GridDensity>[] = [
  {
    value: "comfortable",
    label: "Roomy",
    title: "Taller rows, easier inline editing",
  },
  { value: "compact", label: "Dense", title: "More rows per screen" },
];

function DensityToggle({
  value,
  onChange,
}: {
  value: GridDensity;
  onChange: (density: GridDensity) => void;
}) {
  return (
    <ToolbarSegments
      ariaLabel="Row height"
      options={DENSITY_SEGMENTS}
      value={value}
      onChange={onChange}
    />
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
  dimensions: readonly GridGroupBy[];
  levels: readonly GridGroupBy[];
  onChange: (index: number, value: GridGroupBy | null) => void;
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
              onChange(index, value === "" ? null : (value as GridGroupBy))
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
