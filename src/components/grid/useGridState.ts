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
  serializeGridSettings,
  type GridDensity,
  type GridSettings,
  type GridSort,
} from "@/lib/settings/grid";
import { EMPTY_CROSS_FILTER, type CrossColumnFilter } from "@/lib/grid/crossFilter";
import { hideField, moveField, placeField, showField } from "@/lib/grid/fieldOrder";
import { gridScope } from "@/lib/settings/scopes";
import type { ColumnMeta } from "./columns";

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

export function useGridState<TCol extends ColumnMeta>(
  tabId: string,
  allColumns: TCol[],
  defaultOrder: string[],
  /**
   * How this tab groups before the user chooses — Projects opens on Achieve's
   * Category → Result Area arrangement, most tabs on nothing.
   *
   * Same contract as `defaultOrder`: a stored `null` follows this, a stored `[]` is the
   * user having turned grouping off. Without the distinction, picking Group by → (None) on
   * a tab that groups by default would appear to do nothing.
   */
  defaultGroupBy: string[] = [],
) {
  const { value: settings, patch, reset } = useSetting(gridScope(tabId), CODEC);

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
    (columnId: string, filter: GridSettings["filters"][string]) => {
      patch((current) => ({
        ...current,
        filters: { ...current.filters, [columnId]: filter },
      }));
    },
    [patch],
  );

  /**
   * Clear everything narrowing the rows — column filters, the advanced filter and the
   * search — in one action. Column layout, sort and group collapse are untouched: the user
   * asked to see all their rows, not to give up their view.
   */
  const clearFilters = useCallback(() => {
    patch((current) => ({
      ...current,
      filters: {},
      advancedFilter: null,
      search: "",
    }));
  }, [patch]);

  const setAdvancedFilter = useCallback(
    (filter: CrossColumnFilter | null) => {
      // An empty condition list is stored as null rather than an empty expression, so the
      // chip bar and `hasAnyNarrowing` have one shape to test instead of two.
      const next = filter && filter.conditions.length > 0 ? filter : null;
      patch((current) => ({ ...current, advancedFilter: next }));
    },
    [patch],
  );

  const removeAdvancedCondition = useCallback(
    (index: number) => {
      patch((current) => {
        if (!current.advancedFilter) return current;
        const conditions = current.advancedFilter.conditions.filter(
          (_, position) => position !== index,
        );
        return {
          ...current,
          advancedFilter:
            conditions.length > 0 ? { ...current.advancedFilter, conditions } : null,
        };
      });
    },
    [patch],
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

    widths: settings.widths,
    setWidth,
    clearWidth,

    filters: settings.filters,
    setFilter,
    clearFilters,
    filtersActive: hasActiveFilters(settings.filters),

    advancedFilter: settings.advancedFilter,
    setAdvancedFilter,
    removeAdvancedCondition,
    /** A blank builder to seed the dialog with when nothing is stored yet. */
    emptyAdvancedFilter: EMPTY_CROSS_FILTER,

    search: settings.search,
    setSearch,

    /** True when column filters, the advanced filter or the search are narrowing rows. */
    narrowing: hasAnyNarrowing(settings),

    sorts: settings.sorts,
    /**
     * The primary key, for the callers that only ask "is this grid sorted at all?" —
     * manual-order grids disable drag on any sort, and do not care which.
     */
    sort: settings.sorts[0] ?? null,
    toggleSort,
    clearSort,

    groupBy: settings.groupBy ?? defaultGroupBy,
    setGroupBy,

    collapsedGroups,
    toggleGroup,
    setAllGroupsCollapsed,

    density: settings.density,
    setDensity,

    switches: settings.switches,
    setSwitch,

    view: settings.view,
    setView,

    /** Forget everything this tab remembers, including its sub-view. */
    reset,
    defaults: DEFAULT_GRID_SETTINGS,
  };
}
