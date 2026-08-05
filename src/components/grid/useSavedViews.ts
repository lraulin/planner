"use client";

import { useCallback, useMemo } from "react";
import {
  useResetScope,
  useSetting,
  type SettingCodec,
} from "@/components/settings/SettingsProvider";
import { gridScope, viewsScope } from "@/lib/settings/scopes";
import {
  addSavedView,
  findSavedView,
  isValidViewId,
  MAX_SAVED_VIEWS,
  parseSavedViews,
  removeSavedView,
  renameSavedView,
  serializeSavedViews,
  updateSavedView,
  type SavedView,
  type SavedViews,
  type SavedViewSettings,
} from "@/lib/settings/views";
import type { GridDefaults } from "./useGridState";
import type { GridState } from "./useGridState";

const CODEC: SettingCodec<SavedViews> = {
  parse: parseSavedViews,
  serialize: serializeSavedViews,
};

/**
 * A tab's saved views: the catalogue, and the two commands that change it.
 *
 * Saving copies what the grid is holding **right now** into a new view, then switches to it.
 * From that moment the view behaves exactly like a built-in one — its own
 * `grid:{tab}.{id}` scope keeps whatever you adjust, and Reset this grid returns to what you
 * saved. That is the whole feature: a view was already nothing but stored settings, so
 * saving one is copying three values and giving them a name.
 */
export function useSavedViews(tabId: string) {
  const { value, patch } = useSetting(viewsScope(tabId), CODEC);
  const resetScope = useResetScope();

  const save = useCallback(
    (name: string, snapshot: Omit<SavedView, "id" | "name">) => {
      // Random rather than sequential: a sequential id could be reissued after a delete and
      // would inherit the deleted view's leftover `grid:` scope.
      const id = newViewId();
      patch((current) => addSavedView(current, { id, name, ...snapshot }));
      return id;
    },
    [patch],
  );

  const remove = useCallback(
    (id: string) => {
      patch((current) => removeSavedView(current, id));
      // The view's own grid scope goes with it. Left behind it would be an orphan row that
      // nothing can reach — and a recycled id would inherit it.
      resetScope(gridScope(`${tabId}.${id}`));
    },
    [patch, resetScope, tabId],
  );

  const rename = useCallback(
    (id: string, name: string) => {
      patch((current) => renameSavedView(current, id, name));
    },
    [patch],
  );

  /**
   * Write the grid back into the view you are on. The counterpart to `save`: without it every
   * adjustment you wanted to keep had to become a new view.
   */
  const update = useCallback(
    (id: string, settings: SavedViewSettings) => {
      patch((current) => updateSavedView(current, id, settings));
    },
    [patch],
  );

  return useMemo(
    () => ({
      views: value.views,
      atCapacity: value.views.length >= MAX_SAVED_VIEWS,
      find: (id: string) => findSavedView(value, id),
      save,
      remove,
      rename,
      update,
    }),
    [value, save, remove, rename, update],
  );
}

export type SavedViewsApi = ReturnType<typeof useSavedViews>;

/**
 * What a saved view captures, read off a live grid. See `lib/settings/views.ts`.
 *
 * Every value here is the **resolved** one — what the grid is showing, not what the user has
 * explicitly stored. That is the point: you are naming the grid in front of you, so a switch
 * left at its default is captured at the position you can see it in.
 */
export function snapshotOf(grid: GridState): SavedViewSettings {
  return {
    order: grid.order,
    filters: grid.filters,
    groupBy: grid.groupBy,
    switches: grid.switches,
  };
}

/**
 * A saved view's settings as grid defaults, or the tab's own when the id is a built-in.
 * `order` falls back to the tab's preset, so a view saved before a column existed still
 * opens rather than stranding the tab.
 */
export function savedViewDefaults(
  view: SavedView | null,
  fallback: GridDefaults,
): GridDefaults {
  if (!view) return fallback;
  return {
    order: view.order ?? fallback.order,
    filters: view.filters,
    groupBy: view.groupBy,
    switches: view.switches,
  };
}

function newViewId(): string {
  const id = `saved-${Math.random().toString(36).slice(2, 10)}`;
  // Belt and braces: the id becomes part of a scope key, and an invalid one would be
  // rejected by the settings store after the view had already been added.
  return isValidViewId(id) ? id : "saved-fallback";
}
