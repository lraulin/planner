"use client";

import { useCallback, useMemo, useState } from "react";
import {
  applySelect,
  moveSelection,
  pruneSelection,
  selectOnly,
  type SelectMods,
} from "@/lib/grid/selection";

type MultiState = {
  focusId: string | null;
  anchorId: string | null;
  selectedIds: ReadonlySet<string>;
};

/**
 * Focus + multi-selection for a grid whose rows are identified by string ids.
 *
 * `orderedIds` is the on-screen order the arrows and Shift-range walk — usually the
 * navigable rows after filters and collapsed groups. When that list changes, ids that
 * disappeared are pruned so the selection cannot point at a row that is gone.
 */
export function useMultiSelect(
  orderedIds: readonly string[],
  initialId: string | null = null,
) {
  const [state, setState] = useState<MultiState>(() => ({
    focusId: initialId,
    anchorId: initialId,
    selectedIds: new Set(initialId ? [initialId] : []),
  }));

  // Prune during render when the ordered list changes under us (filter, delete, collapse).
  // Same "adjust state while rendering" idiom the detail URL sync uses.
  const orderedKey = orderedIds.join("\0");
  const [seenKey, setSeenKey] = useState(orderedKey);
  if (orderedKey !== seenKey) {
    setSeenKey(orderedKey);
    const pruned = pruneSelection(
      orderedIds,
      state.selectedIds,
      state.focusId,
      state.anchorId,
    );
    const sameFocus = pruned.focusId === state.focusId;
    const sameAnchor = pruned.anchorId === state.anchorId;
    const sameSet =
      pruned.selectedIds.size === state.selectedIds.size &&
      [...pruned.selectedIds].every((id) => state.selectedIds.has(id));
    if (!sameFocus || !sameAnchor || !sameSet) {
      setState({
        focusId: pruned.focusId,
        anchorId: pruned.anchorId,
        selectedIds: pruned.selectedIds,
      });
    }
  }

  const select = useCallback(
    (id: string, mods: SelectMods = {}) => {
      setState((current) => {
        const result = applySelect(
          current.selectedIds,
          current.anchorId,
          current.focusId,
          id,
          orderedIds,
          mods,
        );
        return {
          focusId: result.focusId,
          anchorId: result.anchorId,
          selectedIds: result.selectedIds,
        };
      });
    },
    [orderedIds],
  );

  const selectOne = useCallback((id: string | null) => {
    const result = selectOnly(id);
    setState({
      focusId: result.focusId,
      anchorId: result.anchorId,
      selectedIds: result.selectedIds,
    });
  }, []);

  const move = useCallback(
    (delta: number, extend: boolean) => {
      setState((current) => {
        const result = moveSelection(
          orderedIds,
          current.anchorId,
          current.focusId,
          current.selectedIds,
          delta,
          extend,
        );
        return {
          focusId: result.focusId,
          anchorId: result.anchorId,
          selectedIds: result.selectedIds,
        };
      });
    },
    [orderedIds],
  );

  const isSelected = useCallback(
    (id: string) => state.selectedIds.has(id),
    [state.selectedIds],
  );

  return useMemo(
    () => ({
      /** Primary / keyboard-focus row. */
      selectedId: state.focusId,
      selectedIds: state.selectedIds,
      anchorId: state.anchorId,
      select,
      selectOne,
      move,
      isSelected,
      setSelectedId: selectOne,
    }),
    [
      state.focusId,
      state.selectedIds,
      state.anchorId,
      select,
      selectOne,
      move,
      isSelected,
    ],
  );
}
