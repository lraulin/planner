"use client";

import { useCallback, useMemo } from "react";
import { useSetting, type SettingCodec } from "@/components/settings/SettingsProvider";
import { useViewStateUrl } from "@/components/url/useViewStateUrl";
import {
  DEFAULT_GRID_SETTINGS,
  hasActiveFilters,
  parseGridSettings,
  serializeGridSettings,
  type GridSettings,
  type GridSort,
} from "@/lib/settings/grid";
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
    (id: string) => {
      if (!byId.has(id) || order.includes(id)) return;
      setOrder([...order, id]);
    },
    [byId, order, setOrder],
  );

  const hide = useCallback(
    (id: string) => {
      const column = byId.get(id);
      if (!column || column.hideable === false) return;
      // Never hide the last column; the grid would have nothing to render a row into.
      if (order.length <= 1) return;
      setOrder(order.filter((entry) => entry !== id));
    },
    [byId, order, setOrder],
  );

  const move = useCallback(
    (id: string, direction: "up" | "down") => {
      const index = order.indexOf(id);
      if (index < 0) return;
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= order.length) return;

      const next = order.slice();
      [next[index], next[target]] = [next[target], next[index]];
      setOrder(next);
    },
    [order, setOrder],
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
    (columnId: string, ids: string[]) => {
      patch((current) => ({
        ...current,
        filters: { ...current.filters, [columnId]: ids },
      }));
    },
    [patch],
  );

  const clearFilters = useCallback(() => {
    patch((current) => ({ ...current, filters: {} }));
  }, [patch]);

  /** Achieve's header cycle: unsorted → ascending → descending → unsorted. */
  const toggleSort = useCallback(
    (columnId: string) => {
      patch((current) => {
        const sort: GridSort | null =
          current.sort?.columnId !== columnId
            ? { columnId, direction: "asc" }
            : current.sort.direction === "asc"
              ? { columnId, direction: "desc" }
              : null;
        return { ...current, sort };
      });
    },
    [patch],
  );

  const clearSort = useCallback(() => {
    patch((current) => ({ ...current, sort: null }));
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
    setOrder,
    resetColumns,

    widths: settings.widths,
    setWidth,
    clearWidth,

    filters: settings.filters,
    setFilter,
    clearFilters,
    filtersActive: hasActiveFilters(settings.filters),

    sort: settings.sort,
    toggleSort,
    clearSort,

    collapsedGroups,
    toggleGroup,

    view: settings.view,
    setView,

    /** Forget everything this tab remembers, including its sub-view. */
    reset,
    defaults: DEFAULT_GRID_SETTINGS,
  };
}
