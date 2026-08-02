/**
 * Multi-row selection helpers for the shared grid.
 *
 * The grid keeps one **focus** row (keyboard home, drawer target, context for single-row
 * commands) and a **set** of selected ids. Shift extends a range from an anchor; ⌘/Ctrl
 * toggles membership. Plain click replaces the set.
 */

export type SelectMods = {
  /** Shift: select the range from the anchor to the target. */
  extend?: boolean;
  /** ⌘/Ctrl: add or remove the target without clearing the rest. */
  toggle?: boolean;
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
 * - neither: single-select the target.
 */
export function applySelect(
  current: ReadonlySet<string>,
  anchorId: string | null,
  focusId: string | null,
  targetId: string,
  orderedIds: readonly string[],
  mods: SelectMods = {},
): SelectResult {
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
      // Never leave the user with zero selection — a grid always has a focus row when
      // rows exist. Dropping the last id would strand keyboard commands.
      if (next.size > 1) next.delete(targetId);
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

/** Replace the whole selection with one id (or clear). */
export function selectOnly(id: string | null): SelectResult {
  return {
    selectedIds: new Set(id ? [id] : []),
    anchorId: id,
    focusId: id,
  };
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

/** Drop ids that no longer appear in the ordered list (filtered out, deleted, …). */
export function pruneSelection(
  orderedIds: readonly string[],
  selectedIds: ReadonlySet<string>,
  focusId: string | null,
  anchorId: string | null,
): SelectResult {
  const visible = new Set(orderedIds);
  const next = new Set([...selectedIds].filter((id) => visible.has(id)));
  let nextFocus = focusId && visible.has(focusId) ? focusId : null;
  let nextAnchor = anchorId && visible.has(anchorId) ? anchorId : null;

  if (next.size === 0 && orderedIds.length > 0) {
    // Prefer the row that used to be focus's neighbour.
    const oldIndex = focusId ? orderedIds.indexOf(focusId) : -1;
    // focusId is gone, so find its former place via the original selection order.
    // orderedIds no longer contains it; fall back to first visible.
    const fallback =
      oldIndex >= 0
        ? orderedIds[Math.min(oldIndex, orderedIds.length - 1)]
        : orderedIds[0];
    return selectOnly(fallback);
  }

  if (nextFocus === null && next.size > 0) {
    nextFocus =
      [...next].sort((a, b) => orderedIds.indexOf(a) - orderedIds.indexOf(b))[0] ??
      null;
  }
  if (nextAnchor === null) nextAnchor = nextFocus;

  // If focus was pruned out of the set entirely, put it back on the set.
  if (nextFocus && !next.has(nextFocus)) next.add(nextFocus);

  return { selectedIds: next, anchorId: nextAnchor, focusId: nextFocus };
}
