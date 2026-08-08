"use client";

import { useMemo } from "react";
import { useCopyScope, useResetScope } from "@/components/settings/SettingsProvider";
import { gridScope } from "@/lib/settings/scopes";
import { baseViewId } from "@/lib/settings/views";
import type { ColumnMeta } from "./columns";
import { useGridState, useTabView, type GridDefaults } from "./useGridState";
import { savedViewDefaults, snapshotOf, useSavedViews } from "./useSavedViews";

/**
 * A module's views and the grid state of whichever one is selected.
 *
 * Every view-capable grid used to spell out the same four steps in its own body — read the
 * catalogue, widen the allow-list, pick the view, key the grid state by it. Five copies of a
 * sequence whose **order is load-bearing** is four copies too many: `useSavedViews` has to run
 * before `useTabView`, because the allow-list needs the saved ids, and wired the other way
 * round every saved view is silently rejected as illegal and the module falls back to its
 * default — which looks exactly like saving having done nothing. The previous cycle shipped
 * that bug once and found it by driving the app.
 *
 * So the sequence lives here once, and a module declares what it has: its built-in views, which
 * one it opens on, and what each of those views defaults to.
 */

export type BuiltInView<TView extends string = string> = { id: TView; label: string };

export type ModuleViewsOptions<TCol extends ColumnMeta, TView extends string> = {
  /** The module's settings key — `outline`, `tasks`. Unchanged from the old `tabId`. */
  moduleId: string;
  builtIn: readonly BuiltInView<TView>[];
  /**
   * Which of `builtIn` the module opens on — typed against their ids, so renaming a preset
   * cannot leave the default pointing at a view that no longer exists. That failure mode is
   * quiet and nasty: `useTabView` would fall back *to* the missing id and the module would open
   * on nothing.
   */
  defaultViewId: NoInfer<TView>;
  /**
   * Whether the default view stores its grid state in the module's own scope (`grid:outline`)
   * rather than a per-view one (`grid:outline.all`).
   *
   * True for the modules that had no view picker before this cycle: their stored column
   * layouts, widths and filters live at the bare scope, and gaining a picker must not orphan
   * them. This is less a special case than the existing contract read out loud —
   * `GridSettings.view` is already nullable with null meaning "the module's default", so the
   * bare scope already *is* where the default view's state lives.
   *
   * Modules with several presets (Tasks, Projects, Goals) leave it off: none of their views is
   * "the module with nothing chosen", and `grid:tasks.active-status` is already written.
   */
  defaultViewSharesModuleScope?: boolean;
  columns: TCol[];
  /**
   * What a built-in view opens as. Only ever called with a **built-in** id — a saved view's own
   * settings are layered over this by `savedViewDefaults`, so `defaultsFor` never has to know
   * that saved views exist.
   */
  defaultsFor: (builtInId: string) => GridDefaults;
  /**
   * Settings scopes the module keeps **per view**, besides the grid's own: the Task Chooser's
   * weights (`chooser:{viewId}`), Notes' mode / sort / filter (`notes:{viewId}`).
   *
   * These are what let a module carry settings no column can hold, and they work by being keyed
   * off the selected view — so they need no copying to *read*. But saving does: a new view's
   * scope starts empty, so without this the module's own settings would snap back to their
   * defaults the moment you named the grid you were looking at. `saveAs` forks each one.
   *
   * Must be stable (module scope). Called for both the source and the new view, and paired by
   * position, so return the same scopes in the same order every time.
   */
  viewScopes?: (viewId: string) => readonly string[];
};

export function useModuleViews<TCol extends ColumnMeta, TView extends string>({
  moduleId,
  builtIn,
  defaultViewId,
  defaultViewSharesModuleScope = false,
  columns,
  defaultsFor,
  viewScopes,
}: ModuleViewsOptions<TCol, TView>) {
  // Before `useTabView`, always. See the header note.
  const saved = useSavedViews(moduleId);
  const copyScope = useCopyScope();
  const resetScope = useResetScope();

  const builtInIds = useMemo(() => builtIn.map((entry) => entry.id), [builtIn]);

  /**
   * Saved ids join the built-ins so `useTabView` treats them as legal selections. A view is a
   * legal choice exactly while it exists; delete it and the stored preference falls back rather
   * than leaving the module pointing at nothing.
   */
  const allowed = useMemo(
    () => [...builtInIds, ...saved.views.map((entry) => entry.id)],
    [builtInIds, saved.views],
  );

  const [viewId, setViewId] = useTabView(moduleId, allowed, defaultViewId);

  /**
   * The built-in whose defaults *and behaviour* apply. Modules that resolve behaviour from the
   * view id — the Task Chooser's scoring, above all — are handed this rather than `viewId`,
   * because `saved-a1b2c3d4` is not one of their presets.
   *
   * Typed as a built-in id rather than a bare string, which is the whole point: it can be
   * passed straight to a module's own `chooserView`-style lookup without a cast at the call
   * site. Sound because `baseViewId` only ever returns a member of `builtInIds` or
   * `defaultViewId`, and both are `TView`.
   */
  const base = baseViewId(saved.views, viewId, builtInIds, defaultViewId) as TView;

  const current = saved.find(viewId);

  /**
   * Memoised on `base`, because a `defaultsFor` may well build its arrays on the way out —
   * Projects' returns a different column order per view from a `switch`. `useGridState`
   * memoises on the *identity* of `defaults.order`, so a fresh array every render would
   * recompute the visible column set every render for no reason.
   *
   * This is why `defaultsFor` has to be a stable function: declare it at module scope, not as
   * an inline arrow in the component body.
   */
  const fallback = useMemo(() => defaultsFor(base), [defaultsFor, base]);

  /**
   * The wrapper object itself needs no memo — `useGridState` reads the fields off it
   * immediately and memoises on those, and a saved view's own arrays come from the parsed
   * settings blob, which is already stable.
   */
  const defaults = savedViewDefaults(current, fallback);

  const scope =
    defaultViewSharesModuleScope && viewId === defaultViewId
      ? moduleId
      : `${moduleId}.${viewId}`;

  const grid = useGridState(scope, columns, defaults);

  return {
    viewId,
    setViewId,
    /** The built-in `viewId` derives from; equal to `viewId` when it is one. */
    base,
    /** Null while a built-in view is selected. */
    current,
    grid,
    saved,
    builtIn,
    /**
     * Capture the grid as it stands under a new name, and switch to it. `base` travels with it
     * so the new view inherits the behaviour of the preset it was made from, and so that saving
     * from a saved view never nests.
     *
     * Two forks ride along so the new view opens on what you could see, not on defaults:
     * 1. The live **grid** scope (widths, sort, search, and anything else not in the catalogue).
     * 2. The module's own per-view scopes (`viewScopes`) — Chooser weights, Notes mode, etc.
     *
     * Without (1), a Filter… expression lived only in the source grid scope and vanished the
     * moment the empty new scope took over — even after the catalogue started capturing it for
     * Reset. Without (2), the Chooser's date filter and Notes' Nested/Flat snapped back.
     */
    saveAs: (name: string) => {
      const id = saved.save(name, { base, ...snapshotOf(grid) });

      const fromGrid = gridScope(scope);
      const toGrid = gridScope(
        defaultViewSharesModuleScope && id === defaultViewId
          ? moduleId
          : `${moduleId}.${id}`,
      );
      if (toGrid !== fromGrid) copyScope(fromGrid, toGrid);

      if (viewScopes) {
        const from = viewScopes(viewId);
        const to = viewScopes(id);
        from.forEach((scopeName, index) => {
          const target = to[index];
          if (target && target !== scopeName) copyScope(scopeName, target);
        });
      }

      setViewId(id);
      return id;
    },
    /** Write the grid back into the selected saved view, keeping its name and id. */
    updateCurrent: () => {
      if (current) saved.update(current.id, snapshotOf(grid));
    },
    renameCurrent: (name: string) => {
      if (current) saved.rename(current.id, name);
    },
    /** Delete the selected saved view and fall back, rather than stranding the grid. */
    deleteCurrent: () => {
      if (!current) return;
      setViewId(defaultViewId);
      // The module's own scopes go with it, for the reason `useSavedViews.remove` clears the
      // grid scope: left behind they are rows nothing can reach, and a recycled id would
      // inherit them.
      if (viewScopes) for (const scope of viewScopes(current.id)) resetScope(scope);
      saved.remove(current.id);
    },
  };
}

export type ModuleViewsApi = ReturnType<typeof useModuleViews>;
