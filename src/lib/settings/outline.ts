import type { NodeState } from "@/db/schema";
import { asBoolean, asRecord } from "./parse";
import { SETTINGS_VERSION } from "./scopes";

/**
 * What the Outline remembers beyond its grid state: whether completed/cancelled rows stay
 * visible, and whether rows are grouped by result-area category. Stored under
 * `outline:filters`.
 *
 * Kept separate from `grid:outline` because neither is a column filter — both reshape the
 * tree before the grid ever sees a row, and neither has a column id to hang off. Same
 * pattern as `notes:filter` for Notes-specific view mode/sort.
 *
 * **`types` and `focusOnly` used to live here and are gone.** Both were column filters
 * wearing toolbar checkboxes — type is the `icon` / `type` column, focus is the `focus`
 * column — and both were implemented by dropping a node's whole subtree with it, so a
 * focused task under an unfocused project vanished and unticking "Result Areas" emptied
 * the grid. Column filters keep ancestors instead (`lib/grid/ancestors.ts`), which is both
 * the correct behaviour and one place to define it. Old blobs still parse; the two fields
 * are simply ignored.
 */

export type OutlineFilters = {
  /**
   * When false (the default), completed and cancelled nodes are hidden — matching
   * the active views on Projects / Tasks / Goals. Children of a hidden parent drop
   * with it so the tree never shows orphans.
   */
  showCompleted: boolean;
  /**
   * When true, root result areas are laid under category group headers (Achieve's
   * "By category"). Off by default so a fresh outline shows the plain tree.
   */
  byCategory: boolean;
};

export const DEFAULT_OUTLINE_FILTERS: OutlineFilters = {
  showCompleted: false,
  byCategory: false,
};

/** Settled states the outline can hide when `showCompleted` is off. */
export function isSettledOutlineState(state: NodeState): boolean {
  return state === "completed" || state === "cancelled";
}

export function parseOutlineFilters(value: unknown): OutlineFilters {
  const record = asRecord(value);
  if (!record) return DEFAULT_OUTLINE_FILTERS;

  return {
    showCompleted: asBoolean(
      record.showCompleted,
      DEFAULT_OUTLINE_FILTERS.showCompleted,
    ),
    // Older blobs predate this flag; missing means the plain tree, not "group by
    // category because we cannot tell".
    byCategory: asBoolean(record.byCategory, DEFAULT_OUTLINE_FILTERS.byCategory),
  };
}

export function serializeOutlineFilters(settings: OutlineFilters): unknown {
  return { v: SETTINGS_VERSION, ...settings };
}
