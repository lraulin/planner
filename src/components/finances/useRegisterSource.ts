"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  loadRegisterBlockAction,
  loadRegisterExportAction,
  loadRegisterIndexAction,
} from "@/app/finances/actions";
import type { TransactionListRow } from "@/lib/finances/types";
import {
  REGISTER_BLOCK_SIZE,
  REGISTER_PREFETCH,
  registerQueryKey,
  type RegisterPrepared,
  type RegisterQuery,
  type RegisterTransactionRow,
} from "@/lib/finances/registerQuery";
import type { GridRow } from "@/lib/tree/slice";
import type { NodeGridRow } from "@/components/grid/columns";

function placeholder(id: string): TransactionListRow {
  return {
    id,
    accountId: "",
    accountName: "",
    accountKind: "checking",
    transactionDate: "2000-01-01",
    postedDate: null,
    pending: false,
    description: "",
    amountCents: 0,
    sourceCategory: "",
    category: null,

    derivedFlow: null,
    flowOverride: null,
    excludeFromBaseline: false,
    eventLabel: "",
    notes: "",
    tags: [],
    balanceAfterCents: null,
    budgetCategoryId: null,
    budgetCategoryName: null,
    payeeId: null,
    payeeName: null,
  };
}

function cacheFrom(prepared: RegisterPrepared): Map<string, TransactionListRow> {
  return new Map(prepared.block.rows.map((row) => [row.id, row]));
}

function asRegisterRow(
  row: TransactionListRow,
  notBudgetedIds: ReadonlySet<string>,
): RegisterTransactionRow {
  return {
    ...row,
    categoryAssignable: !notBudgetedIds.has(row.id),
  };
}

export function useRegisterSource({
  initial,
  query,
}: {
  initial: RegisterPrepared;
  query: RegisterQuery;
}) {
  const [seenInitial, setSeenInitial] = useState(initial);
  const [index, setIndex] = useState(initial.index);
  const [cache, setCache] = useState(() => cacheFrom(initial));
  const [error, setError] = useState<string | null>(null);
  const queryRef = useRef(query);
  const requestId = useRef(0);
  const inFlight = useRef<Set<string>>(new Set());
  if (initial !== seenInitial) {
    setSeenInitial(initial);
    setIndex(initial.index);
    setCache(cacheFrom(initial));
  }
  useEffect(() => {
    queryRef.current = query;
  });

  const key = registerQueryKey(query);
  const notBudgetedIds = useMemo(
    () => new Set(index.notBudgetedIds),
    [index.notBudgetedIds],
  );

  useEffect(() => {
    if (key === index.queryKey) return;
    const handle = window.setTimeout(
      () => {
        const id = ++requestId.current;
        void loadRegisterIndexAction(queryRef.current).then((result) => {
          if (id !== requestId.current) return;
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setError(null);
          setIndex(result.data.index);
          setCache(cacheFrom(result.data));
        });
      },
      query.search.trim() === "" ? 0 : 200,
    );
    return () => window.clearTimeout(handle);
  }, [key, index.queryKey, query.search]);

  const mergeRows = useCallback((rows: readonly TransactionListRow[]) => {
    if (rows.length === 0) return;
    setCache((current) => {
      const next = new Map(current);
      for (const row of rows) next.set(row.id, row);
      return next;
    });
  }, []);

  const ensureIds = useCallback(
    (ids: readonly string[]) => {
      const missing = ids.filter((id) => !cache.has(id) && !inFlight.current.has(id));
      if (missing.length === 0) return;
      const batch = missing.slice(0, REGISTER_BLOCK_SIZE);
      for (const id of batch) inFlight.current.add(id);
      void loadRegisterBlockAction(batch).then((result) => {
        for (const id of batch) inFlight.current.delete(id);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        mergeRows(result.data.rows);
      });
    },
    [cache, mergeRows],
  );

  const onVisibleRange = useCallback(
    (start: number, end: number) => {
      const from = Math.max(0, start - REGISTER_PREFETCH);
      const to = Math.min(index.entries.length - 1, end + REGISTER_PREFETCH);
      const ids: string[] = [];
      for (let i = from; i <= to; i++) {
        const entry = index.entries[i];
        if (entry?.kind === "node") ids.push(entry.id);
      }
      ensureIds(ids);
    },
    [index.entries, ensureIds],
  );

  const pendingRowIds = useMemo(() => {
    const pending = new Set<string>();
    for (const entry of index.entries) {
      if (entry.kind === "node" && !cache.has(entry.id)) pending.add(entry.id);
    }
    return pending;
  }, [index.entries, cache]);

  const gridRows: GridRow<RegisterTransactionRow>[] = useMemo(
    () =>
      index.entries.map((entry) =>
        entry.kind === "group"
          ? {
              kind: "group" as const,
              id: entry.id,
              label: entry.label,
              count: entry.count,
              depth: entry.depth,
              collapsed: false,
            }
          : {
              kind: "node" as const,
              id: entry.id,
              node: asRegisterRow(
                cache.get(entry.id) ?? placeholder(entry.id),
                notBudgetedIds,
              ),
              depth: 0,
            },
      ),
    [index.entries, cache, notBudgetedIds],
  );

  const patchRow = useCallback(
    (transactionId: string, patch: Partial<TransactionListRow>) => {
      setCache((current) => {
        const existing = current.get(transactionId);
        if (!existing) return current;
        const next = new Map(current);
        next.set(transactionId, { ...existing, ...patch });
        return next;
      });
    },
    [],
  );

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    const result = await loadRegisterIndexAction(queryRef.current);
    if (id !== requestId.current) return;
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setIndex(result.data.index);
    setCache(cacheFrom(result.data));
  }, []);

  const loadExportRows = useCallback(async (): Promise<
    NodeGridRow<RegisterTransactionRow>[]
  > => {
    const result = await loadRegisterExportAction(queryRef.current);
    if (!result.ok) {
      setError(result.error);
      return [];
    }
    return result.data.map((row) => ({
      kind: "node" as const,
      id: row.id,
      node: asRegisterRow(row, notBudgetedIds),
      depth: 0,
    }));
  }, [notBudgetedIds]);

  const rowById = useCallback(
    (id: string | null) => {
      if (!id) return null;
      const row = cache.get(id);
      return row ? asRegisterRow(row, notBudgetedIds) : null;
    },
    [cache, notBudgetedIds],
  );

  const putRow = useCallback((row: TransactionListRow) => {
    setCache((current) => {
      const next = new Map(current);
      next.set(row.id, row);
      return next;
    });
  }, []);

  return {
    index,
    gridRows,
    pendingRowIds,
    error,
    setError,
    onVisibleRange,
    patchRow,
    reload,
    loadExportRows,
    rowById,
    putRow,
    counts: { shown: index.shown, total: index.total },
    distinctValues: index.facets,
    groupIds: index.groupIds,
  };
}
