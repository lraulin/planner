import { nodeTypeEnum, type NodeState, type NodeType } from "@/db/schema";
import { asBoolean, asRecord } from "./parse";
import { SETTINGS_VERSION } from "./scopes";

/**
 * What the Outline remembers beyond its grid state: which node types are shown,
 * whether Focus only is on, whether completed/cancelled rows stay visible, and
 * whether rows are grouped by result-area category. Stored under `outline:filters`.
 *
 * Kept separate from `grid:outline` because these controls are not column filters —
 * they reshape the tree before the grid ever sees a row, and they have no column
 * id to hang off. Same pattern as `notes:filter` for Notes-specific view mode/sort.
 */

const ALL_TYPES = nodeTypeEnum.enumValues;

export type OutlineFilters = {
  types: Record<NodeType, boolean>;
  focusOnly: boolean;
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
  types: {
    result_area: true,
    goal: true,
    project: true,
    task: true,
  },
  focusOnly: false,
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

  const storedTypes = asRecord(record.types);
  const types = { ...DEFAULT_OUTLINE_FILTERS.types };
  if (storedTypes) {
    for (const type of ALL_TYPES) {
      types[type] = asBoolean(storedTypes[type], types[type]);
    }
  }

  return {
    types,
    focusOnly: asBoolean(record.focusOnly, DEFAULT_OUTLINE_FILTERS.focusOnly),
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
