"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  isCustomFilter,
  isOptionsFilter,
  optionsFilter,
  type CustomColumnFilter,
} from "@/lib/grid/customFilter";
import type { ColumnValues } from "@/lib/grid/distinct";
import { columnMenuState } from "@/lib/grid/columnMenu";
import {
  buildSetFilterEntries,
  clearSelection,
  matchesSearch,
  onlySelection,
  selectAllState,
  toggleSetEntry,
} from "@/lib/grid/setFilter";
import type { SortDirection } from "@/lib/settings/grid";
import {
  fieldNameOf,
  type ColumnControls,
  type ColumnMeta,
  type FilterKind,
} from "./columns";
import { MenuList, type MenuItem } from "./ContextMenu";
import { CustomFilterDialog } from "./CustomFilterDialog";
import {
  ALL_FILTER,
  filterActive,
  presetOptions,
  selectPreset,
  usesSetFilter,
  type ColumnFilter,
  type FilterOption,
} from "@/lib/grid/filters";
import { useDateFormatter } from "@/components/settings/SettingsProvider";

/**
 * One popover per column header, holding **everything that acts on that column**.
 *
 * Before this, the controls were scattered by mechanism rather than by target: sort was a
 * click on the label, filter was the funnel, hiding and reordering were in a toolbar dialog
 * two clicks away, and resetting a width was a double-click on a handle you could not see.
 * Knowing what you wanted to do told you nothing about where to do it.
 *
 * Modelled on AG Grid's and MUI X's **tabbed** column menu (the two references this was
 * shaped against), for the one reason that matters here: it keeps a single button in a
 * header cell that can be 48px wide. Two buttons — a funnel and a menu — do not fit beside
 * a label on the Priority column.
 *
 * The Filter tab is the default on any column that has one, so the button costs exactly what
 * the old funnel cost on the path people take most. Everything else is one tab away instead
 * of somewhere else entirely.
 */

/** How many values before the set-filter list needs its own search box. */
const SEARCH_THRESHOLD = 8;

/** The popover's `w-64`, in pixels. Only used to decide which edge it opens from. */
const POPOVER_WIDTH = 256;

/** Slack at the window edge, so a popover that just fits is not flush against it. */
const VIEWPORT_GUTTER = 8;

type MenuTab = "menu" | "filter";

export function ColumnMenuButton({
  column,
  order,
  open,
  onOpenChange,
  sorts,
  onSetSort,
  filter,
  onFilterChange,
  values,
  distinctValues,
  controls,
  widths,
  onResetWidth,
  onOpenFields,
}: {
  column: ColumnMeta;
  /** Visible column ids, in display order. */
  order: readonly string[];
  open: boolean;
  /**
   * Controlled by the header row so only one column menu is ever open, and so a right-click
   * anywhere on a header cell can open that column's menu.
   */
  onOpenChange: (open: boolean) => void;
  sorts: readonly { columnId: string; direction: SortDirection }[];
  /** Explicit-direction sort. Omit to leave the sort items out. */
  onSetSort?: (columnId: string, direction: SortDirection | null) => void;
  filter: ColumnFilter;
  /** Omit to leave the Filter tab out, as an unfilterable column should. */
  onFilterChange?: (filter: ColumnFilter) => void;
  /** Values this column holds and how many rows hold each. */
  values: ColumnValues | undefined;
  /** Plain value list, for the custom-criteria dialog's operand picker. */
  distinctValues: string[];
  controls?: ColumnControls;
  widths: Record<string, number>;
  onResetWidth?: (columnId: string) => void;
  /** Opens the Show Fields dialog, which the header row owns one of. */
  onOpenFields?: () => void;
}) {
  const formatDate = useDateFormatter();
  const [tab, setTab] = useState<MenuTab>("menu");
  const [customOpen, setCustomOpen] = useState(false);
  const [search, setSearch] = useState("");
  // Which edge the popover hangs from. Decided per open, because Show Fields and column
  // resizing both move a column across the threshold without remounting this button.
  const [alignRight, setAlignRight] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const canFilter = Boolean(column.filterValue) && onFilterChange !== undefined;
  const active = filterActive(filter);
  // The *field* name, not the header: a header can be a tick box with no word in it (the
  // Day tab's Done column), and "▾ column menu" names nothing.
  const name = fieldNameOf(column);
  const filterLabel = column.filterKind === "date" ? formatDate : column.filterLabel;

  // Measured before the popover's first paint, so it never renders off screen and then
  // jumps. Also picks the opening tab: the funnel is what this button used to be, and on a
  // filterable column that is still what it is mostly reached for.
  useLayoutEffect(() => {
    if (!open) return;
    const anchor = rootRef.current?.getBoundingClientRect();
    if (anchor) {
      setAlignRight(anchor.left + POPOVER_WIDTH > window.innerWidth - VIEWPORT_GUTTER);
    }
    setTab(canFilter ? "filter" : "menu");
    // Reset the query on the way in: a stale one would silently hide values the next time
    // the menu is opened.
    setSearch("");
  }, [open, canFilter]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) onOpenChange(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onOpenChange(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  const state = columnMenuState({
    columnId: column.id,
    order,
    sortable: Boolean(column.sortValue) && onSetSort !== undefined,
    hideable: column.hideable,
    sorts,
    widths,
  });

  function run(action: () => void) {
    onOpenChange(false);
    action();
  }

  const items: MenuItem[] = [
    {
      label: "Sort ascending",
      shortcut: "↑",
      disabled: !state.canSortAscending,
      title: column.sortValue
        ? "Click the header to cycle · Shift-click to add a second sort key"
        : "This column cannot be sorted",
      onSelect: () => run(() => onSetSort?.(column.id, "asc")),
    },
    {
      label: "Sort descending",
      shortcut: "↓",
      disabled: !state.canSortDescending,
      onSelect: () => run(() => onSetSort?.(column.id, "desc")),
    },
    {
      label: "Clear sort",
      disabled: !state.canClearSort,
      title: state.canClearSort
        ? "Drop this column's sort key; any others keep their order"
        : "This grid is not sorted by this column",
      onSelect: () => run(() => onSetSort?.(column.id, null)),
    },
    "separator",
    ...(canFilter
      ? ([
          {
            label: active ? "Filter (on)…" : "Filter…",
            onSelect: () => setTab("filter"),
          },
          "separator",
        ] as MenuItem[])
      : []),
    {
      label: "Move left",
      disabled: !controls || !state.canMoveLeft,
      title: "Or drag the column header",
      onSelect: () => run(() => controls?.move(column.id, "up")),
    },
    {
      label: "Move right",
      disabled: !controls || !state.canMoveRight,
      title: "Or drag the column header",
      onSelect: () => run(() => controls?.move(column.id, "down")),
    },
    {
      label: "Hide column",
      disabled: !controls || !state.canHide,
      title:
        column.hideable === false
          ? "This column cannot be hidden"
          : "Filters and sorts on a hidden column keep working",
      onSelect: () => run(() => controls?.hide(column.id)),
    },
    {
      label: "Reset width",
      disabled: !state.canResetWidth || !onResetWidth,
      title: "Back to this column's declared width",
      onSelect: () => run(() => onResetWidth?.(column.id)),
    },
    "separator",
    {
      label: "Show fields…",
      disabled: !onOpenFields,
      onSelect: () => run(() => onOpenFields?.()),
    },
    {
      label: "Reset columns",
      disabled: !controls,
      title: "Back to this view's preset columns, order and widths",
      onSelect: () => run(() => controls?.resetColumns()),
    },
  ];

  return (
    <div ref={rootRef} className="relative flex-none">
      <button
        type="button"
        aria-label={`${name} column menu`}
        aria-expanded={open}
        aria-controls={panelId}
        title={`${name} — sort, filter and column options`}
        onClick={() => onOpenChange(!open)}
        className={[
          "rounded px-0.5 text-[0.625rem] leading-none",
          active ? "text-priority-a" : "text-ink-faint hover:text-ink",
        ].join(" ")}
      >
        ▾
      </button>

      {open && (
        <div
          id={panelId}
          // Hangs from whichever edge keeps it on screen — the menus on the last columns
          // (Status, L.A.P.) are the ones you reach for most and were unreachable off the
          // right edge. Width must stay in step with `POPOVER_WIDTH`.
          //
          // The cap is tall enough that the Menu tab never scrolls: a menu whose last two
          // items are below a fold looks like a menu that does not have them. Only the
          // filter's value list scrolls, which is what it was always for.
          className={[
            "absolute top-full z-40 mt-1 flex max-h-[26rem] w-64 flex-col rounded border border-rule-strong bg-surface text-left shadow-lg",
            alignRight ? "right-0" : "left-0",
          ].join(" ")}
        >
          {canFilter && (
            <div
              role="tablist"
              aria-label={`${name} column menu`}
              className="flex flex-none border-b border-rule"
            >
              <MenuTabButton
                label="Filter"
                dot={active}
                selected={tab === "filter"}
                onSelect={() => setTab("filter")}
              />
              <MenuTabButton
                label="Menu"
                selected={tab === "menu"}
                onSelect={() => setTab("menu")}
              />
            </div>
          )}

          {tab === "filter" && canFilter && onFilterChange ? (
            <FilterPanel
              label={name}
              kind={column.filterKind}
              filterLabel={filterLabel}
              filter={filter}
              active={active}
              values={values}
              presets={presetOptions(column.filterKind)}
              search={search}
              onSearchChange={setSearch}
              onChange={onFilterChange}
              onOpenCustom={() => {
                onOpenChange(false);
                setCustomOpen(true);
              }}
            />
          ) : (
            <MenuPanel items={items} />
          )}
        </div>
      )}

      {onFilterChange && (
        <CustomFilterDialog
          open={customOpen}
          columnLabel={name}
          kind={column.filterKind}
          filter={isCustomFilter(filter) ? filter : null}
          distinctValues={distinctValues}
          onApply={(next: CustomColumnFilter) => onFilterChange(next)}
          onClose={() => setCustomOpen(false)}
        />
      )}
    </div>
  );
}

function MenuTabButton({
  label,
  selected,
  dot = false,
  onSelect,
}: {
  label: string;
  selected: boolean;
  /** Marks the Filter tab when something is filtered, so a closed tab still reports it. */
  dot?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={[
        "flex flex-1 items-center justify-center gap-1 px-2 py-1.5 text-[0.75rem] normal-case tracking-normal",
        selected
          ? "border-b-2 border-select-edge font-medium text-ink"
          : "border-b-2 border-transparent text-ink-muted hover:text-ink",
      ].join(" ")}
    >
      {label}
      {dot && <span className="text-[0.5rem] leading-none text-priority-a">●</span>}
    </button>
  );
}

/**
 * The menu items, in the same visual language as the row context menu — same type, same
 * label/shortcut layout — because they are the same kind of thing and there is no reason to
 * make the user read two.
 */
function MenuPanel({ items }: { items: MenuItem[] }) {
  return (
    <div role="menu" className="min-h-0 flex-1 overflow-auto py-1">
      {/*
        `MenuList` rather than a second copy of the same rows — that copy is how this popover drifted
        onto a different gap from the row menu it was written to match. `normal-case
        tracking-normal` because the tab strip above imposes uppercase on its subtree.
      */}
      <MenuList
        items={items}
        onChoose={(item) => item.onSelect()}
        rowClassName="normal-case tracking-normal"
      />
    </div>
  );
}

/**
 * Achieve's filter dropdown: the ticked value checklist on enum columns, exclusive semantic
 * bands everywhere else, and `(Custom)…` for the criteria dialog. Unchanged in behaviour by
 * the move into the tabbed menu — see `usesSetFilter` for which columns get which.
 */
function FilterPanel({
  label,
  kind,
  filterLabel,
  filter,
  active,
  values,
  presets,
  search,
  onSearchChange,
  onChange,
  onOpenCustom,
}: {
  label: string;
  kind: FilterKind | undefined;
  /** Presentation for a stored value — see `ColumnDef.filterLabel`. */
  filterLabel?: (value: string) => string;
  filter: ColumnFilter;
  active: boolean;
  values: ColumnValues | undefined;
  /** Semantic bands for this kind (priority, date, blank/non-blank). Empty for enums. */
  presets: FilterOption[];
  search: string;
  onSearchChange: (search: string) => void;
  onChange: (filter: ColumnFilter) => void;
  onOpenCustom: () => void;
}) {
  const customActive = isCustomFilter(filter) && active;
  const optionIds = isOptionsFilter(filter) ? filter.ids : [];
  // Enum columns get the ticked value checklist; every other kind gets exclusive bands —
  // see `usesSetFilter`. Matching still accepts `value:…` ids if an old filter stored one.
  const showSetFilter = usesSetFilter(kind);

  // Every entry, regardless of the search box — the search hides rows from the list but
  // must not drop them from the selection being computed.
  const allEntries = showSetFilter
    ? buildSetFilterEntries({ values, selectedIds: optionIds, labelOf: filterLabel })
    : [];
  const shown = matchesSearch(allEntries, search);
  const tickState = selectAllState(allEntries);
  const allSelected = tickState === "all";
  const noneSelected = tickState === "none";

  // A handful of states needs no search box; forty result areas do.
  const showSearch = showSetFilter && allEntries.length > SEARCH_THRESHOLD;

  const setIds = (ids: string[]) =>
    onChange(ids.length === 0 ? ALL_FILTER : optionsFilter(ids));

  return (
    <>
      {showSearch && (
        <div className="flex-none border-b border-rule p-1.5">
          <input
            type="search"
            autoFocus
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search values…"
            className="w-full rounded border border-rule bg-surface px-2 py-1 text-[0.8125rem] normal-case tracking-normal text-ink outline-none focus:border-select-edge"
          />
        </div>
      )}

      <ul
        role="listbox"
        // Values are ticked independently; bands are one-at-a-time, so the popover must not
        // advertise multi-select on a column that cannot do it.
        aria-multiselectable={showSetFilter || undefined}
        aria-label={showSetFilter ? `${label} values` : `${label} ranges`}
        className="min-h-0 flex-1 overflow-auto py-1"
      >
        {showSetFilter && (
          <>
            <li className="group flex items-center border-b border-rule/60">
              <button
                type="button"
                role="option"
                aria-selected={allSelected}
                disabled={allSelected}
                onClick={() => onChange(ALL_FILTER)}
                title={
                  allSelected
                    ? "Every value is already showing"
                    : "Show every value again"
                }
                className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1 text-left text-[0.8125rem] normal-case tracking-normal text-ink hover:bg-surface-raised disabled:cursor-default disabled:hover:bg-transparent"
              >
                <Tick state={tickState} />
                <span className="min-w-0 flex-1 truncate font-medium">
                  (Select all)
                </span>
              </button>
              {/*
                The counterpart to "only" on a value row, and the reason it is a plain
                button rather than a second checklist entry: it is an action on the list,
                not a value you can be filtered to. Picking three of thirty values means
                clearing and ticking three instead of unticking twenty-seven — the grid
                is empty in between, which the chip bar explains.
              */}
              <button
                type="button"
                aria-label={`Untick every ${label} value`}
                disabled={noneSelected || allEntries.length === 0}
                onClick={() => setIds(clearSelection())}
                title={
                  noneSelected
                    ? "Nothing is ticked"
                    : "Untick everything, then pick the few you want"
                }
                className="mr-1 flex-none rounded px-1.5 py-0.5 text-[0.6875rem] normal-case tracking-normal text-ink-faint hover:bg-surface-raised hover:text-ink disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-faint"
              >
                none
              </button>
            </li>

            {shown.length === 0 ? (
              <li className="px-3 py-3 text-[0.8125rem] normal-case tracking-normal text-ink-faint">
                {allEntries.length === 0 ? "No values to filter." : "No match."}
              </li>
            ) : (
              shown.map((entry) => (
                <li key={entry.optionId} className="group flex items-center">
                  <button
                    type="button"
                    role="option"
                    aria-selected={entry.selected}
                    onClick={() =>
                      setIds(toggleSetEntry(allEntries, optionIds, entry.optionId))
                    }
                    className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1 text-left text-[0.8125rem] normal-case tracking-normal text-ink hover:bg-surface-raised"
                  >
                    <Tick state={entry.selected ? "all" : "none"} />
                    <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                    <span className="flex-none tabular-nums text-[0.6875rem] text-ink-faint">
                      {entry.count}
                    </span>
                  </button>
                  {/*
                    Excel's "Only this". Without it, narrowing to one value out of thirty
                    means unticking twenty-nine. Dimmed until hover or focus rather than
                    hidden, so it is still tabbable — this popover has no compact
                    counterpart (there is no column header below `md`), so the
                    always-visible-action rule in `ux-principles.md` is not in play.
                  */}
                  <button
                    type="button"
                    onClick={() => setIds(onlySelection(entry.optionId))}
                    title={`Show only ${entry.label}`}
                    className="mr-1 flex-none rounded px-1.5 py-0.5 text-[0.6875rem] normal-case tracking-normal text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:bg-surface-raised hover:text-ink focus:opacity-100"
                  >
                    only
                  </button>
                </li>
              ))
            )}
          </>
        )}

        {presets.length > 0 && (
          <>
            {/*
              `(All)` is the only way out of a band, since picking one replaces the last
              rather than toggling it off — the same role `(Select all)` plays above a
              value checklist, which is why the two never appear together.
            */}
            <li>
              <button
                type="button"
                role="option"
                aria-selected={!active}
                disabled={!active}
                onClick={() => onChange(ALL_FILTER)}
                title={!active ? "Nothing is filtered out" : "Show every row again"}
                className="flex w-full items-center gap-2 border-b border-rule/60 px-2 py-1 text-left text-[0.8125rem] normal-case tracking-normal text-ink hover:bg-surface-raised disabled:cursor-default disabled:hover:bg-transparent"
              >
                <Dot selected={!active} />
                <span className="min-w-0 flex-1 truncate font-medium">(All)</span>
              </button>
            </li>

            {presets.map((preset) => {
              const selected = optionIds.includes(preset.id);
              return (
                <li key={preset.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => onChange(selectPreset(preset.id))}
                    className={[
                      "flex w-full items-center gap-2 px-2 py-1 text-left text-[0.8125rem] normal-case tracking-normal",
                      selected
                        ? "bg-select font-medium text-ink"
                        : "text-ink hover:bg-surface-raised",
                    ].join(" ")}
                  >
                    <Dot selected={selected} />
                    <span className="min-w-0 truncate">{preset.label}</span>
                  </button>
                </li>
              );
            })}
          </>
        )}
      </ul>

      <div className="flex-none border-t border-rule p-1">
        <button
          type="button"
          onClick={onOpenCustom}
          className={[
            "w-full rounded px-2 py-1 text-left text-[0.8125rem] normal-case tracking-normal hover:bg-surface-raised",
            customActive ? "font-medium text-ink" : "text-ink-muted",
          ].join(" ")}
        >
          {customActive ? "Custom criteria (on)…" : "Custom criteria…"}
        </button>
      </div>
    </>
  );
}

function Tick({ state }: { state: "all" | "some" | "none" }) {
  return (
    <span
      aria-hidden
      className={[
        "flex h-3.5 w-3.5 flex-none items-center justify-center rounded-[0.1875rem] border text-[0.625rem] leading-none",
        state === "none"
          ? "border-rule-strong text-transparent"
          : "border-select-edge bg-select-edge/20 text-ink",
      ].join(" ")}
    >
      {state === "all" ? "✓" : state === "some" ? "–" : ""}
    </span>
  );
}

/**
 * A band's indicator. Round rather than square on purpose: the shape is the only thing
 * telling you that clicking a second band drops the first, where a tick beside a value
 * promises it will add to what is already ticked.
 */
function Dot({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      className={[
        "flex h-3.5 w-3.5 flex-none items-center justify-center rounded-full border",
        selected ? "border-select-edge bg-select-edge/20" : "border-rule-strong",
      ].join(" ")}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${selected ? "bg-ink" : "bg-transparent"}`}
      />
    </span>
  );
}
