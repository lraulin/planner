/**
 * Multi-row selection helpers for the shared grid.
 *
 * The grid keeps one **focus** row (keyboard home, drawer target, context for single-row
 * commands) and a **set** of selected ids. Shift extends a range from an anchor; ⌘/Ctrl
 * toggles membership. Plain click replaces the set. Clicking a cell control on a selected
 * row does not.
 */

export type SelectMods = {
  /** Shift: select the range from the anchor to the target. */
  extend?: boolean;
  /** ⌘/Ctrl: add or remove the target without clearing the rest. */
  toggle?: boolean;
  /**
   * Click on a cell control (`select`, `input`, `button`). Must not collapse a
   * multi-selection the row is already in — that edit applies to the selection.
   * An unselected row is a single-row edit, so the selection becomes that row.
   * Shift/⌘ are ignored: a click on a date picker must not toggle membership.
   */
  cellControl?: boolean;
};

export type SelectResult = {
  selectedIds: Set<string>;
  /** Start of the next Shift-range. */
  anchorId: string | null;
  /** Keyboard focus / primary row. */
  focusId: string | null;
};

/** Inclusive range of ids between `fromId` and `toId` in display order. */
export function rangeIds(
  orderedIds: readonly string[],
  fromId: string,
  toId: string,
): string[] {
  const from = orderedIds.indexOf(fromId);
  const to = orderedIds.indexOf(toId);
  if (from === -1 && to === -1) return [];
  if (from === -1) return [toId];
  if (to === -1) return [fromId];
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  return orderedIds.slice(lo, hi + 1);
}

/**
 * Apply a click / keyboard select against the current multi-selection.
 *
 * - **extend** (Shift): range from anchor → target; anchor stays put.
 * - **toggle** (⌘/Ctrl): flip membership of the target; becomes the new anchor.
 * - **cellControl**: keep a multi-selection the target is already in; otherwise
 *   single-select. Spreadsheet/register UIs treat a cell edit inside a
 *   selection as a bulk edit — replacing the set first would make it a
 *   surprising one-row exception.
 * - none of the above: single-select the target.
 */
export function applySelect(
  current: ReadonlySet<string>,
  anchorId: string | null,
  focusId: string | null,
  targetId: string,
  orderedIds: readonly string[],
  mods: SelectMods = {},
  options: { allowEmpty?: boolean } = {},
): SelectResult {
  if (mods.cellControl) {
    if (current.has(targetId)) {
      return {
        // Same Set identity so a native `<select>` opening on a selected row
        // does not re-render the cell and dismiss the picker.
        selectedIds: current instanceof Set ? current : new Set(current),
        anchorId,
        focusId,
      };
    }
    return selectOnly(targetId);
  }

  if (mods.extend && anchorId) {
    return {
      selectedIds: new Set(rangeIds(orderedIds, anchorId, targetId)),
      anchorId,
      focusId: targetId,
    };
  }

  if (mods.toggle) {
    const next = new Set(current);
    if (next.has(targetId)) {
      // Never-empty grids keep a focus row when rows exist. Budget tables allow empty
      // (empty means "assign all"), so the last checkbox can uncheck.
      if (next.size > 1 || options.allowEmpty) next.delete(targetId);
    } else {
      next.add(targetId);
    }
    // Focus follows the clicked row even when it was removed, so long as something else
    // is still selected: pick a neighbour from the remaining set.
    let nextFocus = targetId;
    if (!next.has(targetId)) {
      nextFocus =
        [...next].sort((a, b) => orderedIds.indexOf(a) - orderedIds.indexOf(b))[0] ??
        null;
    }
    return {
      selectedIds: next,
      anchorId: targetId,
      focusId: nextFocus,
    };
  }

  return {
    selectedIds: new Set([targetId]),
    anchorId: targetId,
    focusId: targetId,
  };
}

/**
 * Rows a cell edit should write, given the current selection.
 *
 * Editing a cell on a row that is already in a multi-selection applies to every
 * selected row, in display order. A cell on a row outside the selection, or a
 * selection of one, writes only that row.
 */
export function idsForFieldEdit(
  editedId: string,
  selectedIds: ReadonlySet<string>,
  orderedIds: readonly string[],
): string[] {
  if (selectedIds.has(editedId) && selectedIds.size > 1) {
    return orderedIds.filter((id) => selectedIds.has(id));
  }
  return [editedId];
}

/** Replace the whole selection with one id (or clear). */
export function selectOnly(id: string | null): SelectResult {
  return {
    selectedIds: new Set(id ? [id] : []),
    anchorId: id,
    focusId: id,
  };
}

/** Header checkbox: every navigable row, more than the focus, or none. */
export type SelectAllState = "all" | "some" | "none";

/**
 * Select every id in display order. Keep keyboard focus where it is when that row is
 * still on screen; otherwise land on the first row.
 */
export function selectAll(
  orderedIds: readonly string[],
  focusId: string | null = null,
): SelectResult {
  if (orderedIds.length === 0) {
    return { selectedIds: new Set(), anchorId: null, focusId: null };
  }
  const nextFocus = focusId && orderedIds.includes(focusId) ? focusId : orderedIds[0];
  return {
    selectedIds: new Set(orderedIds),
    anchorId: nextFocus,
    focusId: nextFocus,
  };
}

/**
 * Visual state of the header checkbox.
 *
 * Never-empty grids treat a lone focus row as **none** (clicking the header means
 * select-all, not "this one row is a partial selection"). `allowEmpty` treats a real
 * empty set as none, and a single selected row among several as **some**.
 */
export function selectAllHeaderState(
  orderedIds: readonly string[],
  selectedIds: ReadonlySet<string>,
  options: { allowEmpty?: boolean } = {},
): SelectAllState {
  if (orderedIds.length === 0) return "none";
  let selectedCount = 0;
  for (const id of orderedIds) {
    if (selectedIds.has(id)) selectedCount += 1;
  }
  if (selectedCount === orderedIds.length) return "all";
  if (options.allowEmpty) return selectedCount === 0 ? "none" : "some";
  return selectedCount <= 1 ? "none" : "some";
}

/**
 * Header click: none/some → all; all → the focus row (never-empty) or empty
 * (`allowEmpty`).
 */
export function toggleSelectAll(
  orderedIds: readonly string[],
  selectedIds: ReadonlySet<string>,
  focusId: string | null,
  options: { allowEmpty?: boolean } = {},
): SelectResult {
  const state = selectAllHeaderState(orderedIds, selectedIds, options);
  if (state !== "all") return selectAll(orderedIds, focusId);
  if (options.allowEmpty) return selectOnly(null);
  const keep =
    focusId && orderedIds.includes(focusId) ? focusId : (orderedIds[0] ?? null);
  return selectOnly(keep);
}

/**
 * Move focus by `delta` rows. With `extend`, grows/shrinks the range from the anchor;
 * without, replaces the selection with the new focus.
 */
export function moveSelection(
  orderedIds: readonly string[],
  anchorId: string | null,
  focusId: string | null,
  selectedIds: ReadonlySet<string>,
  delta: number,
  extend: boolean,
): SelectResult {
  if (orderedIds.length === 0) {
    return { selectedIds: new Set(), anchorId: null, focusId: null };
  }

  const currentIndex = focusId ? orderedIds.indexOf(focusId) : -1;
  const nextIndex =
    currentIndex === -1
      ? delta > 0
        ? 0
        : orderedIds.length - 1
      : Math.min(Math.max(currentIndex + delta, 0), orderedIds.length - 1);
  const nextId = orderedIds[nextIndex];

  if (extend) {
    const anchor = anchorId ?? focusId ?? nextId;
    return {
      selectedIds: new Set(rangeIds(orderedIds, anchor, nextId)),
      anchorId: anchor,
      focusId: nextId,
    };
  }

  return selectOnly(nextId);
}

/**
 * Ids that should actually move when a multi-selection is dragged.
 *
 * If both a parent and a child are selected, the child rides along with the parent — moving
 * it separately would try to place it relative to a target that is also moving. Display
 * order is preserved so a block of siblings lands as a block.
 */
export function selectionMoveRoots(
  selectedIds: ReadonlySet<string>,
  orderedIds: readonly string[],
  parentIdOf: (id: string) => string | null,
): string[] {
  return orderedIds.filter((id) => {
    if (!selectedIds.has(id)) return false;
    let parent = parentIdOf(id);
    while (parent !== null) {
      if (selectedIds.has(parent)) return false;
      parent = parentIdOf(parent);
    }
    return true;
  });
}

/**
 * Row that should keep keyboard focus after `vanishedId` leaves the list.
 *
 * Prefer the nearest still-visible neighbour above it — that is the user's
 * place. If nothing above survived (the vanished row was first, or everything
 * above left too), take the nearest still-visible neighbour below. Returns
 * null when the vanished id was never in the previous list, or when nothing
 * remains.
 */
export function neighborAfterRemoval(
  previousIds: readonly string[],
  nextIds: readonly string[],
  vanishedId: string | null,
): string | null {
  if (nextIds.length === 0 || vanishedId === null) return null;
  const prevIndex = previousIds.indexOf(vanishedId);
  if (prevIndex === -1) return null;

  const visible = new Set(nextIds);
  for (let i = prevIndex - 1; i >= 0; i--) {
    const id = previousIds[i];
    if (visible.has(id)) return id;
  }
  for (let i = prevIndex + 1; i < previousIds.length; i++) {
    const id = previousIds[i];
    if (visible.has(id)) return id;
  }
  return nextIds[0] ?? null;
}

/**
 * Drop ids that no longer appear in the ordered list (filtered out, deleted, …).
 *
 * `previousOrderedIds` is the on-screen order from before this change. Without
 * it the vanished focus cannot be placed — it is already gone from `orderedIds`
 * — and the only remaining fallback is the first visible row, which jumps the
 * viewport to the top.
 */
export function pruneSelection(
  orderedIds: readonly string[],
  selectedIds: ReadonlySet<string>,
  focusId: string | null,
  anchorId: string | null,
  previousOrderedIds: readonly string[] = orderedIds,
): SelectResult {
  if (orderedIds.length === 0) {
    return { selectedIds: new Set(), anchorId: null, focusId: null };
  }

  const visible = new Set(orderedIds);
  const next = new Set([...selectedIds].filter((id) => visible.has(id)));

  if (next.size === 0) {
    // Whole selection vanished: land on the neighbour above (or below) the old
    // focus. Unknown vanished id (never on the previous list): first visible,
    // same as the `?select=` landing before ancestors have expanded.
    const neighbour = neighborAfterRemoval(previousOrderedIds, orderedIds, focusId);
    return selectOnly(neighbour ?? orderedIds[0]);
  }

  // Some of the selection remains. Focus stays if it is still selected; if it
  // vanished, land on the nearest still-selected row. Do not recruit a
  // neighbour that was never in the set — that is how deleting one of three
  // grew the highlight onto an unrelated previous item.
  const remaining = orderedIds.filter((id) => next.has(id));
  const nextFocus =
    focusId && next.has(focusId)
      ? focusId
      : (neighborAfterRemoval(previousOrderedIds, remaining, focusId) ??
        remaining[0] ??
        null);
  const nextAnchor = anchorId && next.has(anchorId) ? anchorId : nextFocus;

  return { selectedIds: next, anchorId: nextAnchor, focusId: nextFocus };
}
