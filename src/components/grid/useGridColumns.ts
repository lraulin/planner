"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import type { ColumnMeta } from "./columns";

type StoredLayout = {
  /** Column ids in display order. Only the ones listed are shown. */
  order: string[];
};

function storageKey(tabId: string): string {
  return `planner.grid.columns.${tabId}`;
}

function readStored(tabId: string): StoredLayout | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(tabId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredLayout;
    if (!parsed || !Array.isArray(parsed.order)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStored(tabId: string, layout: StoredLayout) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(tabId), JSON.stringify(layout));
  } catch {
    // Quota or private mode — column layout just does not persist.
  }
}

function resolveOrder(
  tabId: string,
  knownIds: Set<string>,
  validDefault: string[],
): string[] {
  const stored = readStored(tabId);
  if (!stored) return validDefault;
  const cleaned = stored.order.filter((id) => knownIds.has(id));
  return cleaned.length > 0 ? cleaned : validDefault;
}

/**
 * Visible column ids + order for a tab, persisted to `localStorage`. Falls back to the
 * view preset (`defaultOrder`) when nothing is stored or the stored ids no longer match
 * the available set.
 *
 * Storage is read through `useSyncExternalStore` so the server and first paint agree on
 * the preset, then the client adopts any saved layout without an effect.
 */
export function useGridColumns<TCol extends ColumnMeta>(
  tabId: string,
  allColumns: TCol[],
  defaultOrder: string[],
) {
  const byId = useMemo(() => {
    const map = new Map<string, TCol>();
    for (const column of allColumns) map.set(column.id, column);
    return map;
  }, [allColumns]);

  const knownIds = useMemo(() => new Set(byId.keys()), [byId]);

  const validDefault = useMemo(
    () => defaultOrder.filter((id) => knownIds.has(id)),
    [defaultOrder, knownIds],
  );

  const defaultKey = validDefault.join("\0");
  const knownKey = Array.from(knownIds).sort().join("\0");

  const storedKey = useSyncExternalStore(
    () => () => {},
    () => resolveOrder(tabId, knownIds, validDefault).join("\0"),
    () => defaultKey,
  );

  // Re-read when the available column set or preset changes (view switch).
  void knownKey;

  const storedOrder = useMemo(
    () => (storedKey ? storedKey.split("\0").filter(Boolean) : validDefault),
    [storedKey, validDefault],
  );

  /** Session overrides after Show Fields edits, keyed by tab id. */
  const [overrides, setOverrides] = useState<Record<string, string[]>>({});
  const [revision, setRevision] = useState(0);

  const order = overrides[tabId] ?? storedOrder;

  const persist = useCallback(
    (next: string[]) => {
      setOverrides((current) => ({ ...current, [tabId]: next }));
      writeStored(tabId, { order: next });
      setRevision((n) => n + 1);
    },
    [tabId],
  );

  // Touch revision so a write is visible even if overrides already matched.
  void revision;

  const columns = useMemo(
    () => order.map((id) => byId.get(id)).filter(Boolean) as TCol[],
    [order, byId],
  );

  const available = useMemo(
    () => allColumns.filter((column) => !order.includes(column.id)),
    [allColumns, order],
  );

  const show = useCallback(
    (id: string) => {
      if (!byId.has(id) || order.includes(id)) return;
      persist([...order, id]);
    },
    [byId, order, persist],
  );

  const hide = useCallback(
    (id: string) => {
      const column = byId.get(id);
      if (!column || column.hideable === false) return;
      if (order.length <= 1) return;
      persist(order.filter((entry) => entry !== id));
    },
    [byId, order, persist],
  );

  const move = useCallback(
    (id: string, direction: "up" | "down") => {
      const index = order.indexOf(id);
      if (index < 0) return;
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= order.length) return;
      const next = order.slice();
      [next[index], next[target]] = [next[target], next[index]];
      persist(next);
    },
    [order, persist],
  );

  const reset = useCallback(() => {
    persist(validDefault);
  }, [persist, validDefault]);

  const setOrderDirect = useCallback(
    (next: string[]) => {
      persist(next.filter((id) => byId.has(id)));
    },
    [persist, byId],
  );

  return {
    columns,
    order,
    available,
    show,
    hide,
    move,
    reset,
    setOrder: setOrderDirect,
  };
}
