"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  useAllSettings,
  useCopyScope,
  useReadScope,
  useResetScope,
  useSetting,
  type SettingCodec,
} from "@/components/settings/SettingsProvider";
import {
  hasViewOverrides,
  parseGridSettings,
  serializeGridSettings,
  type GridSettings,
} from "@/lib/settings/grid";
import { gridScope, WORKING_VIEW_ID } from "@/lib/settings/scopes";
import { baseViewId } from "@/lib/settings/views";
import type { ColumnMeta } from "./columns";
import { useGridState, useTabView, type GridDefaults } from "./useGridState";
import { savedViewDefaults, snapshotOf, useSavedViews } from "./useSavedViews";

/**
 * A module's views and the single working set the grid is showing.
 *
 * Named views are snapshots. Tweaks live in `grid:{moduleId}` (and optional extras
 * working scopes). When those diverge from the active view's definition the picker
 * stays on that view and shows Unsaved changes.
 *
 * `useSavedViews` still runs before `useTabView`: the allow-list needs the saved ids, and
 * wired the other way every saved view is rejected as illegal.
 */

export type BuiltInView<TView extends string = string> = { id: TView; label: string };

const GRID_CODEC: SettingCodec<GridSettings> = {
  parse: parseGridSettings,
  serialize: serializeGridSettings,
};

export type ModuleViewsOptions<TCol extends ColumnMeta, TView extends string> = {
  /** The module's settings key — `outline`, `tasks`. */
  moduleId: string;
  defaultViews: readonly BuiltInView<TView>[];
  /**
   * Which shipped default a module opens on, typed against `defaultViews` ids.
   */
  defaultViewId: NoInfer<TView>;
  columns: TCol[];
  /** Factory defaults for one shipped default view id. */
  defaultsFor: (builtInId: string) => GridDefaults;
  /**
   * Settings scopes the module keeps **per named view**, besides the grid: Chooser weights
   * (`chooser:{viewId}`), Notes mode (`notes:{viewId}` / `notes:filter` for working).
   *
   * Called with `WORKING_VIEW_ID` for the live extras row, and with a named id for that
   * view's definition. Paired by position. Must be a stable function.
   */
  viewScopes?: (viewId: string) => readonly string[];
  /**
   * When extras have no separate definition row (legacy unknown origin, or Notes' working row
   * *is* `notes:filter`), dirty is "does the working blob still look like factory defaults?"
   */
  extrasMatchDefaults?: (raw: unknown) => boolean;
};

export function useModuleViews<TCol extends ColumnMeta, TView extends string>({
  moduleId,
  defaultViews,
  defaultViewId,
  columns,
  defaultsFor,
  viewScopes,
  extrasMatchDefaults,
}: ModuleViewsOptions<TCol, TView>) {
  const seededDefaults = useMemo(
    () =>
      defaultViews.map((entry) => {
        const defaults = defaultsFor(entry.id);
        return {
          id: entry.id,
          name: entry.label,
          base: entry.id,
          settings: {
            order: defaults.order,
            widths: defaults.widths ?? {},
            filters: defaults.filters ?? {},
            advancedFilter: defaults.advancedFilter ?? null,
            search: defaults.search ?? "",
            sorts: defaults.sorts ?? [],
            groupBy: defaults.groupBy ?? [],
            collapsedGroups: defaults.collapsedGroups ?? [],
            density: defaults.density ?? "comfortable",
            switches: defaults.switches ?? {},
          },
        };
      }),
    [defaultViews, defaultsFor],
  );
  const saved = useSavedViews(moduleId, seededDefaults);
  const copyScope = useCopyScope();
  const resetScope = useResetScope();
  const readScope = useReadScope();
  const { snapshot } = useAllSettings();
  const { value: moduleSettings, update: writeModule } = useSetting(
    gridScope(moduleId),
    GRID_CODEC,
  );

  const defaultIds = useMemo(
    () => defaultViews.map((entry) => entry.id),
    [defaultViews],
  );
  const defaultIdSet = useMemo(() => new Set<string>(defaultIds), [defaultIds]);

  const allowed = useMemo(() => saved.views.map((entry) => entry.id), [saved.views]);
  const fallbackViewId = useMemo(
    () =>
      (allowed.includes(defaultViewId)
        ? defaultViewId
        : (allowed[0] ?? defaultViewId)) as TView,
    [allowed, defaultViewId],
  );

  const [viewId, setViewId] = useTabView(moduleId, allowed, fallbackViewId);

  const base = baseViewId(saved.views, viewId, defaultIds, defaultViewId) as TView;
  const current = saved.find(viewId);
  const fallback = useMemo(() => defaultsFor(base), [defaultsFor, base]);
  const defaults = savedViewDefaults(current, fallback);

  // One working set. Per-view live scopes are no longer written.
  const grid = useGridState(moduleId, columns, defaults);

  const persistExtras = useCallback(
    (fromId: string, toId: string) => {
      if (!viewScopes) return;
      const from = viewScopes(fromId);
      const to = viewScopes(toId);
      from.forEach((source, index) => {
        const target = to[index];
        if (!target || target === source) return;
        const raw = readScope(source);
        if (raw === undefined) resetScope(target);
        else copyScope(source, target);
      });
    },
    [viewScopes, readScope, resetScope, copyScope],
  );

  const loadExtras = useCallback(
    (originId: string) => {
      if (!viewScopes) return;
      const working = viewScopes(WORKING_VIEW_ID);
      const originHasDefinition = saved.find(originId) !== null;
      working.forEach((scope, index) => {
        const definition = originHasDefinition ? viewScopes(originId)[index] : undefined;
        if (!definition || definition === scope) {
          resetScope(scope);
          return;
        }
        const raw = readScope(definition);
        if (raw === undefined) resetScope(scope);
        else copyScope(definition, scope);
      });
    },
    [viewScopes, saved, readScope, resetScope, copyScope],
  );

  /**
   * Load a named definition into the working set. Dirty tweaks on the previous view
   * are discarded. Same id as now still reloads — Reset uses that.
   */
  const clearViewState = grid.clearViewState;
  const selectView = useCallback(
    (id: string) => {
      setViewId(id);
      clearViewState();
      loadExtras(id);
    },
    [setViewId, clearViewState, loadExtras],
  );

  const revert = useCallback(() => {
    selectView(viewId);
  }, [selectView, viewId]);

  const previousViewId = useRef(viewId);
  useEffect(() => {
    if (previousViewId.current === viewId) return;
    previousViewId.current = viewId;
    // URL `?view=` (and any other store write we did not go through `selectView`) is an
    // explicit navigation: load that definition. `selectView` / `saveAs` / `save`
    // already cleared; doing it again is a no-op.
    clearViewState();
    loadExtras(viewId);
  }, [viewId, clearViewState, loadExtras]);

  const extrasDirty = useMemo(() => {
    if (!viewScopes) return false;
    const working = viewScopes(WORKING_VIEW_ID);
    const originHasDefinition = saved.find(viewId) !== null;
    return working.some((scope, index) => {
      const raw = snapshot[scope];
      const definition = originHasDefinition ? viewScopes(viewId)[index] : undefined;
      if (!definition || definition === scope) {
        return extrasMatchDefaults ? !extrasMatchDefaults(raw) : raw !== undefined;
      }
      return !rawEqual(raw, snapshot[definition]);
    });
  }, [viewScopes, viewId, snapshot, extrasMatchDefaults, saved]);

  const dirty = hasViewOverrides(moduleSettings) || extrasDirty;

  const adopted = useRef(false);
  useEffect(() => {
    if (adopted.current) return;
    adopted.current = true;

    const perViewScope = gridScope(`${moduleId}.${viewId}`);
    const workingScope = gridScope(moduleId);
    if (perViewScope !== workingScope) {
      const perViewRaw = readScope(perViewScope);
      if (perViewRaw !== undefined && !hasViewOverrides(moduleSettings)) {
        const live = parseGridSettings(perViewRaw);
        writeModule({
          ...live,
          view: moduleSettings.view,
          includeDeferred: moduleSettings.includeDeferred,
        });
        resetScope(perViewScope);
      }
    }

    if (viewScopes && defaultIdSet.has(viewId)) {
      const working = viewScopes(WORKING_VIEW_ID);
      const leftover = viewScopes(viewId);
      working.forEach((scope, index) => {
        const from = leftover[index];
        if (!from || from === scope) return;
        if (readScope(scope) !== undefined) return;
        if (readScope(from) !== undefined) copyScope(from, scope);
      });
    }
    // First paint only: later Reset must not re-adopt a leftover per-view row.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount adoption
  }, []);

  return {
    viewId,
    setViewId: selectView,
    selectView,
    revert,
    dirty,
    /** The built-in `viewId` derives from; equal to `viewId` when it is one. */
    base,
    /** Active view definition, or null only for an unknown legacy id. */
    current,
    grid,
    saved,
    defaultViews: defaultViews,
    /**
     * Write the working copy over the active view, then clear dirty so the working
     * set follows the definition you just wrote.
     */
    save: () => {
      if (!current) return;
      saved.update(current.id, snapshotOf(grid));
      persistExtras(WORKING_VIEW_ID, current.id);
      grid.clearViewState();
    },
    /**
     * Deep-copy the working copy into a new named view and switch to it.
     * The source definition is untouched.
     */
    saveAs: (name: string) => {
      const id = saved.save(name, { base, ...snapshotOf(grid) });
      persistExtras(WORKING_VIEW_ID, id);
      setViewId(id);
      grid.clearViewState();
      return id;
    },
    renameCurrent: (name: string) => {
      if (current) saved.rename(current.id, name);
    },
    deleteCurrent: () => {
      if (!current) return;
      if (saved.views.length <= 1) return;
      const id = current.id;
      if (viewScopes) for (const scope of viewScopes(id)) resetScope(scope);
      const remaining = saved.views.filter((entry) => entry.id !== id);
      saved.remove(id);
      const next =
        remaining.find((entry) => entry.id === defaultViewId)?.id ??
        remaining[0]?.id ??
        defaultViewId;
      selectView(next as TView);
    },
  };
}

export type ModuleViewsApi = ReturnType<typeof useModuleViews>;

function rawEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left === undefined || right === undefined) return false;
  return JSON.stringify(left) === JSON.stringify(right);
}
