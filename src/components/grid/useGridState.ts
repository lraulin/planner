"use client";

import { useCallback, useMemo } from "react";
import { useSetting, type SettingCodec } from "@/components/settings/SettingsProvider";
import { useViewStateUrl } from "@/components/url/useViewStateUrl";
import {
  DEFAULT_GRID_SETTINGS,
  hasActiveFilters,
  hasAnyNarrowing,
  MAX_SORT_KEYS,
  parseGridSettings,
  resolveAdvancedFilter,
  resolveSwitches,
  serializeGridSettings,
  type GridDensity,
  type GridSettings,
  type GridSort,
  type SortDirection,
} from "@/lib/settings/grid";
import { EMPTY_CROSS_FILTER, type CrossColumnFilter } from "@/lib/grid/crossFilter";
import type { ColumnFilter } from "@/lib/grid/customFilter";

/** Module-level so the default `defaults` object cannot churn the memos below. */
const EMPTY_GROUP_BY: string[] = [];
import { hideField, moveField, placeField, showField } from "@/lib/grid/fieldOrder";
import { gridScope } from "@/lib/settings/scopes";
import type { ColumnControls, ColumnMeta } from "./columns";

/**
 * Everything one grid tab remembers: which columns are shown and in what order and width,
 * which filters and sort are active, which groups are collapsed, and which sub-view is
 * selected.
 *
 * **One hook owns the whole `grid:{tabId}` scope on purpose.** A write replaces the scope's
 * value, so two hooks each persisting their own field would silently clobber each other —
 * changing a filter would reset the column layout. Everything a tab stores therefore
 * travels through the single `patch` below.
 *
 * This replaces `useGridColumns`, which held only the column order and kept it in
 * `localStorage`.
 */

const CODEC: SettingCodec<GridSettings> = {
  parse: parseGridSettings,
  serialize: serializeGridSettings,
};

export type GridState = ReturnType<typeof useGridState>;

/**
 * The tab's selected sub-view, stored one level above the per-view state.
 *
 * It cannot live in the same scope as the columns and filters, because that scope *is*
 * keyed by view (`grid:tasks.active-status`) — the Tasks views show different columns, and
 * one shared layout would fight whichever view you were not looking at. So the tab scope
 * (`grid:tasks`) holds which view you are on, and each view scope holds how it looks.
 *
 * `?view=` overrides the store when present and legal; the store supplies the default when
 * the param is absent. Changing the view writes both (replace in history, so flipping
 * views does not spam Back).
 */
export function useTabView<T extends string>(
  tabId: string,
  /**
   * Every id the picker offers — built-in **and** saved. A saved view is a legal selection
   * exactly while it exists; delete it and the stored preference falls back rather than
   * leaving the tab pointing at a view that is gone.
   */
  allowed: readonly T[],
  fallback: T,
) {
  const { value, patch } = useSetting(gridScope(tabId), CODEC);
  const { view: urlView, setView: setUrlView } = useViewStateUrl();

  // A view removed since the preference was written falls back rather than rendering a
  // tab with no rows and no explanation. URL wins when it names a still-legal view.
  const stored =
    value.view !== null && (allowed as readonly string[]).includes(value.view)
      ? (value.view as T)
      : fallback;

  const view =
    urlView !== null && (allowed as readonly string[]).includes(urlView)
      ? (urlView as T)
      : stored;

  const setView = useCallback(
    (next: T) => {
      patch((current) => ({ ...current, view: next }));
      setUrlView(next);
    },
    [patch, setUrlView],
  );

  return [view, setView] as const;
}

/**
 * Whether postponed rows show in a Tasks/Projects-style grid. Lives on the **tab** scope
 * (`grid:tasks`), not the per-view scope — one toggle covers every sub-view, and it must
 * survive a reload. Defaults to showing (see `DEFAULT_GRID_SETTINGS.includeDeferred`).
 */
export function useIncludeDeferred(tabId: string) {
  const { value, patch } = useSetting(gridScope(tabId), CODEC);

  const setIncludeDeferred = useCallback(
    (next: boolean) => {
      patch((current) => ({ ...current, includeDeferred: next }));
    },
    [patch],
  );

  return [value.includeDeferred, setIncludeDeferred] as const;
}

/**
 * What a view opens as, before the user has chosen anything.
 *
 * This is what makes a view **a collection of settings** rather than a mode: everything here
 * is an ordinary stored value the user can see, change and clear. A view that also carried
 * behaviour reachable no other way would be a mode wearing a preset's name.
 */
export type GridDefaults = {
  /**
   * Visible column ids, in order. The view's preset — a stored `null` follows it and a
   * stored `[]` is the user having hidden everything, which is why it cannot just be a
   * default value on the field.
   */
  order: string[];
  /**
   * How this tab groups before the user chooses — Projects opens on Achieve's
   * Category → Result Area arrangement, most tabs on nothing.
   *
   * Same contract as `defaultOrder`: a stored `null` follows this, a stored `[]` is the
   * user having turned grouping off. Without the distinction, picking Group by → (None) on
   * a tab that groups by default would appear to do nothing.
   */
  groupBy?: string[];
  /**
   * Column filters the view opens with — "Active Tasks" is a State filter, not a hidden
   * row predicate. They arrive as ordinary chips: visible, removable, and restored by
   * Reset this grid.
   */
  filters?: Record<string, ColumnFilter>;
  /**
   * Advanced (cross-column) filter the view opens with. Same contract as `filters`: a saved
   * view's Filter… expression is a default, not a mode, and Reset this grid puts it back.
   */
  advancedFilter?: CrossColumnFilter | null;
  /**
   * Toolbar switch positions the view opens with, by the id the tab declared.
   *
   * A saved view records where the switches were; this is how they come back. It does **not**
   * make a switch a property of the view — `data-grid.md`'s rule is that a view may not carry
   * behaviour reachable no other way, and every switch here stays on the toolbar, toggleable
   * and combinable. Only the *position* travels, exactly as a column's visibility does.
   *
   * Resolution is per key, not per map (`resolveSwitches`): the user's stored position wins,
   * then this, then the `defaultOn` the tab declared.
   */
  switches?: Record<string, boolean>;
};

const NO_FILTERS: Record<string, ColumnFilter> = {};

export function useGridState<TCol extends ColumnMeta>(
  tabId: string,
  allColumns: TCol[],
  defaults: GridDefaults,
) {
  const defaultOrder = defaults.order;
  const defaultGroupBy = defaults.groupBy ?? EMPTY_GROUP_BY;
  const defaultFilters = defaults.filters ?? NO_FILTERS;
  const defaultAdvancedFilter = defaults.advancedFilter ?? null;
  const defaultSwitches = defaults.switches;
  const { value: settings, patch, reset } = useSetting(gridScope(tabId), CODEC);

  /**
   * The view's switch positions under the user's own. Unlike `order` / `filters` / `groupBy`
   * this needs no nullable field, because a switch the user has not touched is simply an absent
   * key — see `resolveSwitches`.
   */
  const resolvedSwitches = useMemo(
    () => resolveSwitches(defaultSwitches, settings.switches),
    [defaultSwitches, settings.switches],
  );

  const byId = useMemo(() => {
    const map = new Map<string, TCol>();
    for (const column of allColumns) map.set(column.id, column);
    return map;
  }, [allColumns]);

  /**
   * The view's preset, minus any column this view does not actually offer. Tabs build
   * their column list per view, so a preset written for a wider view must not resolve to
   * ids that no longer exist.
   */
  const validDefault = useMemo(
    () => defaultOrder.filter((id) => byId.has(id)),
    [defaultOrder, byId],
  );

  /**
   * Stored order wins, but only for columns this view still has. If nothing recognisable
   * survives, fall back to the preset rather than showing an empty grid — a layout saved
   * before a column was renamed should degrade, not strand the tab.
   */
  const order = useMemo(() => {
    if (settings.order === null) return validDefault;
    const cleaned = settings.order.filter((id) => byId.has(id));
    return cleaned.length > 0 ? cleaned : validDefault;
  }, [settings.order, byId, validDefault]);

  const columns = useMemo(
    () => order.map((id) => byId.get(id)).filter((column) => column !== undefined),
    [order, byId],
  );

  const available = useMemo(
    () => allColumns.filter((column) => !order.includes(column.id)),
    [allColumns, order],
  );

  const collapsedGroups = useMemo(
    () => new Set(settings.collapsedGroups),
    [settings.collapsedGroups],
  );

  /**
   * Stored filters, or the view's defaults while the user has not touched them. Everything
   * downstream — the grid, the chips, the funnels, `narrowing` — reads this, so a default
   * filter is indistinguishable from one the user set. That is the point.
   */
  const filters = settings.filters ?? defaultFilters;

  /**
   * Advanced filter with the same "null follows the view" contract as column filters.
   *
   * - `null` in the grid scope → view default (or none).
   * - An empty expression (`conditions: []`) → explicitly cleared, so Clear all can turn a
   *   saved view's advanced filter off without Reset.
   * - A non-empty expression → that filter.
   *
   * Empty expressions are inactive (`crossFilterActive`), so callers still see `null` when
   * nothing is narrowing — one shape for the chip bar and `hasAnyNarrowing`.
   */
  const advancedFilter = resolveAdvancedFilter(
    settings.advancedFilter,
    defaultAdvancedFilter,
  );

  const setOrder = useCallback(
    (next: string[]) => {
      patch((current) => ({ ...current, order: next.filter((id) => byId.has(id)) }));
    },
    [patch, byId],
  );

  const show = useCallback(
    (id: string, atIndex?: number) => {
      if (!byId.has(id) || order.includes(id)) return;
      if (atIndex === undefined) {
        setOrder(showField(order, id));
        return;
      }
      setOrder(placeField(order, id, atIndex));
    },
    [byId, order, setOrder],
  );

  const hide = useCallback(
    (id: string) => {
      const column = byId.get(id);
      if (!column || column.hideable === false) return;
      // Never hide the last column; the grid would have nothing to render a row into.
      if (order.length <= 1) return;
      setOrder(hideField(order, id));
    },
    [byId, order, setOrder],
  );

  const move = useCallback(
    (id: string, direction: "up" | "down") => {
      setOrder(moveField(order, id, direction));
    },
    [order, setOrder],
  );

  /** Drag reorder / drop at index — moves or inserts `id` so it lands at `toIndex`. */
  const place = useCallback(
    (id: string, toIndex: number) => {
      if (!byId.has(id)) return;
      setOrder(placeField(order, id, toIndex));
    },
    [byId, order, setOrder],
  );

  /** Back to the view's preset, leaving filters, sort and widths alone. */
  const resetColumns = useCallback(() => {
    patch((current) => ({ ...current, order: null, widths: {} }));
  }, [patch]);

  const setWidth = useCallback(
    (columnId: string, width: number) => {
      patch((current) => ({
        ...current,
        widths: { ...current.widths, [columnId]: width },
      }));
    },
    [patch],
  );

  const clearWidth = useCallback(
    (columnId: string) => {
      patch((current) => {
        const widths = { ...current.widths };
        delete widths[columnId];
        return { ...current, widths };
      });
    },
    [patch],
  );

  const setFilter = useCallback(
    (columnId: string, filter: ColumnFilter) => {
      patch((current) => ({
        ...current,
        // Editing one column materialises the view's other defaults alongside it, so the
        // rest of the preset does not silently vanish the first time a funnel is touched.
        filters: { ...(current.filters ?? defaultFilters), [columnId]: filter },
      }));
    },
    [patch, defaultFilters],
  );

  /**
   * Clear everything narrowing the rows — column filters, the advanced filter and the
   * search — in one action. Column layout, sort and group collapse are untouched: the user
   * asked to see all their rows, not to give up their view.
   */
  const clearFilters = useCallback(() => {
    patch((current) => ({
      ...current,
      // Explicitly empty, not null: "show me everything" has to survive a reload. Reset this
      // grid is how you get the view's defaults back. The advanced filter uses an empty
      // expression for the same reason — null would follow the view's default again.
      filters: {},
      advancedFilter: EMPTY_CROSS_FILTER,
      search: "",
    }));
  }, [patch]);

  const setAdvancedFilter = useCallback(
    (filter: CrossColumnFilter | null) => {
      // Active filters store as themselves. Clearing stores an empty expression rather than
      // null: null means "follow the view's default", and a user who just cleared a saved
      // view's Filter… must not see it bounce back.
      const next = filter && filter.conditions.length > 0 ? filter : EMPTY_CROSS_FILTER;
      patch((current) => ({ ...current, advancedFilter: next }));
    },
    [patch],
  );

  const removeAdvancedCondition = useCallback(
    (index: number) => {
      patch((current) => {
        // When the scope still follows the view default (`null`), edit the effective filter
        // so removing a chip materialises the rest rather than wiping the default entirely.
        const source = current.advancedFilter ?? defaultAdvancedFilter;
        if (!source || source.conditions.length === 0) return current;
        const conditions = source.conditions.filter(
          (_, position) => position !== index,
        );
        return {
          ...current,
          advancedFilter:
            conditions.length > 0 ? { ...source, conditions } : EMPTY_CROSS_FILTER,
        };
      });
    },
    [patch, defaultAdvancedFilter],
  );

  const setSearch = useCallback(
    (search: string) => {
      patch((current) => ({ ...current, search }));
    },
    [patch],
  );

  const setGroupBy = useCallback(
    (groupBy: string[]) => {
      // Collapsed group ids encode the dimensions they came from, so they are meaningless
      // against a new grouping and would silently hide the wrong sections.
      patch((current) => ({ ...current, groupBy, collapsedGroups: [] }));
    },
    [patch],
  );

  const setDensity = useCallback(
    (density: GridDensity) => {
      patch((current) => ({ ...current, density }));
    },
    [patch],
  );

  const setSwitch = useCallback(
    (id: string, value: boolean) => {
      patch((current) => ({
        ...current,
        switches: { ...current.switches, [id]: value },
      }));
    },
    [patch],
  );

  /**
   * Achieve's header cycle: unsorted → ascending → descending → unsorted.
   *
   * A plain click **replaces** the whole sort with this one column, so the common case is
   * unchanged and there is no way to accumulate sort keys by accident. `additive` (Shift-
   * click) instead cycles this column's own key while leaving the others in place, which is
   * the only way to build a secondary sort.
   *
   * Cycling an additive key to "unsorted" removes just that key. Removing the primary
   * promotes the next one rather than clearing everything — the user asked to drop one
   * criterion, not to abandon the ordering.
   */
  const toggleSort = useCallback(
    (columnId: string, additive = false) => {
      patch((current) => {
        const existing = current.sorts.find((entry) => entry.columnId === columnId);

        if (!additive) {
          // Cycle only when this column is already the sole key; otherwise start fresh at
          // ascending, so clicking a new header never lands on "unsorted".
          const isSoleKey = current.sorts.length === 1 && existing !== undefined;
          if (!isSoleKey)
            return { ...current, sorts: [{ columnId, direction: "asc" }] };
          return {
            ...current,
            sorts:
              existing.direction === "asc"
                ? [{ columnId, direction: "desc" as const }]
                : [],
          };
        }

        if (!existing) {
          if (current.sorts.length >= MAX_SORT_KEYS) return current;
          return {
            ...current,
            sorts: [...current.sorts, { columnId, direction: "asc" }],
          };
        }

        const sorts: GridSort[] =
          existing.direction === "asc"
            ? current.sorts.map((entry) =>
                entry.columnId === columnId
                  ? { columnId, direction: "desc" as const }
                  : entry,
              )
            : current.sorts.filter((entry) => entry.columnId !== columnId);

        return { ...current, sorts };
      });
    },
    [patch],
  );

  /**
   * Set one column's sort key outright, or drop it with `null`. What the column menu's
   * Sort ascending / Sort descending / Clear sort call.
   *
   * A direction **replaces** the whole sort, exactly as a plain header click does — a menu
   * pick must not silently leave a secondary key behind that the user cannot see they
   * chose. Clearing removes only this column's key and promotes whatever was under it, so
   * dropping one criterion is not the same as abandoning the ordering.
   */
  const setSort = useCallback(
    (columnId: string, direction: SortDirection | null) => {
      patch((current) =>
        direction === null
          ? {
              ...current,
              sorts: current.sorts.filter((entry) => entry.columnId !== columnId),
            }
          : { ...current, sorts: [{ columnId, direction }] },
      );
    },
    [patch],
  );

  const clearSort = useCallback(() => {
    patch((current) => ({ ...current, sorts: [] }));
  }, [patch]);

  const toggleGroup = useCallback(
    (groupId: string) => {
      patch((current) => {
        const next = new Set(current.collapsedGroups);
        if (next.has(groupId)) next.delete(groupId);
        else next.add(groupId);
        return { ...current, collapsedGroups: [...next] };
      });
    },
    [patch],
  );

  /**
   * Collapse every group the grid currently has, or open all of them.
   *
   * Collapsing stores the ids rather than a single "all collapsed" flag, so a group added
   * later (a new result area) arrives **open**. A flag would silently swallow it, and the
   * user would have no reason to suspect a section existed.
   */
  const setAllGroupsCollapsed = useCallback(
    (groupIds: readonly string[], collapsed: boolean) => {
      patch((current) => ({
        ...current,
        collapsedGroups: collapsed ? [...groupIds] : [],
      }));
    },
    [patch],
  );

  const setView = useCallback(
    (view: string | null) => {
      patch((current) => ({ ...current, view }));
    },
    [patch],
  );

  /**
   * The layout commands bundled for `DataGrid`'s column menu and header drag-to-reorder.
   * One object rather than six props at eight call sites, and memoized so the header row
   * does not re-render on every keystroke elsewhere in the tab.
   */
  const columnControls: ColumnControls = useMemo(
    () => ({ show, hide, move, place, resetColumns, resetGrid: reset }),
    [show, hide, move, place, resetColumns, reset],
  );

  return {
    columns,
    order,
    available,
    show,
    hide,
    move,
    place,
    setOrder,
    resetColumns,
    columnControls,

    widths: settings.widths,
    setWidth,
    clearWidth,

    filters,
    setFilter,
    clearFilters,
    filtersActive: hasActiveFilters(filters),

    advancedFilter,
    setAdvancedFilter,
    removeAdvancedCondition,
    /** A blank builder to seed the dialog with when nothing is stored yet. */
    emptyAdvancedFilter: EMPTY_CROSS_FILTER,

    search: settings.search,
    setSearch,

    /** True when column filters, the advanced filter or the search are narrowing rows. */
    narrowing: hasAnyNarrowing(filters, advancedFilter, settings.search),

    sorts: settings.sorts,
    /**
     * The primary key, for the callers that only ask "is this grid sorted at all?" —
     * manual-order grids disable drag on any sort, and do not care which.
     */
    sort: settings.sorts[0] ?? null,
    toggleSort,
    setSort,
    clearSort,

    groupBy: settings.groupBy ?? defaultGroupBy,
    setGroupBy,

    collapsedGroups,
    toggleGroup,
    setAllGroupsCollapsed,

    density: settings.density,
    setDensity,

    switches: resolvedSwitches,
    setSwitch,

    view: settings.view,
    setView,

    /** Forget everything this tab remembers, including its sub-view. */
    reset,
    defaults: DEFAULT_GRID_SETTINGS,
  };
}
