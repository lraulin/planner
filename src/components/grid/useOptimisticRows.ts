"use client";

import { useCallback, useState, useTransition } from "react";

/**
 * Optimistic edits over a server list — Notes, Time Charts, Wishes. An edit is a patch laid
 * on its row at once; the write runs behind it. A rejected write drops every patch and
 * reports through `setError`. A successful one keeps the patches until the server sends the
 * list again: clearing them when the write settles would flash the old values first.
 */
export function useOptimisticRows<Row extends { id: string }>(
  serverRows: readonly Row[],
  setError: (message: string | null) => void,
) {
  const [patches, setPatches] = useState<Record<string, Partial<Row>>>({});
  const [baseline, setBaseline] = useState(serverRows);
  if (serverRows !== baseline) {
    setBaseline(serverRows);
    if (Object.keys(patches).length > 0) setPatches({});
  }
  const [, startTransition] = useTransition();

  /** Lay the pending patches over `rows`. */
  const withPatches = (rows: readonly Row[]): Row[] =>
    rows.map((row) => (patches[row.id] ? { ...row, ...patches[row.id] } : row));

  const patch = useCallback((id: string, changes: Partial<Row>) => {
    setPatches((current) => ({ ...current, [id]: { ...current[id], ...changes } }));
  }, []);

  const clearPatches = useCallback(() => setPatches({}), []);

  const apply = useCallback(
    (action: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
      setError(null);
      startTransition(async () => {
        const result = await action();
        if (!result.ok) {
          setError(result.error);
          setPatches({});
        }
      });
    },
    [setError],
  );

  return { withPatches, patch, clearPatches, apply };
}
