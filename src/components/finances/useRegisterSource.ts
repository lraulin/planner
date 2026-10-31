"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listSplitChildrenAction,
  loadRegisterBlockAction,
  loadRegisterExportAction,
  loadRegisterFacetsAction,
  loadRegisterIndexAction,
} from "@/app/(shell)/finances/actions";
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
import { useWindowedSource } from "@/components/grid/useWindowedSource";

/** Stable identity while the lists have not arrived, so nothing downstream re-renders. */
const NO_FACETS: Record<string, string[]> = {};

/**
 * What decides a view's filter lists: the view itself, not the filters on it. A set filter
 * lists every value the view's rows hold, so the lists are the same for every filter, sort
 * and search over one view.
 */
function viewKeyOf(query: RegisterQuery): string {
  return JSON.stringify([
    query.viewId,
    query.report ?? null,
    query.category,
    query.month,
  ]);
}

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
    externalSource: null,
    derivedFlow: null,
    flowOverride: null,
    notes: "",
    balanceAfterCents: null,
    budgetCategoryId: null,
    budgetCategoryName: null,
    payeeId: null,
    payeeName: null,
    parentId: null,
    splitChildCount: 0,
    splitImbalanceCents: 0,
  };
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
  wantFacets = false,
}: {
  initial: RegisterPrepared;
  query: RegisterQuery;
  /**
   * Fetch the filter lists now, because something on screen is drawn from them (a chip for a
   * ticked value). Otherwise they load the first time a menu or dialog asks, through the
   * returned `ensureFacets`.
   */
  wantFacets?: boolean;
}) {
  /**
   * Split children, held apart from `cache` and keyed by parent.
   *
   * They are not in the index and never will be (D8): they do not sort, filter, search or
   * group, and the id-addressed block loader cannot fetch them. Keeping them in their own
   * map is what stops any of the pipeline above from having to know they exist.
   */
  const [childrenByParent, setChildrenByParent] = useState<
    Map<string, TransactionListRow[]>
  >(() => new Map());
  const [expandedSplitIds, setExpandedSplitIds] = useState<Set<string>>(
    () => new Set(),
  );
  /**
   * The filter lists, for one view, fetched on demand (D10 of
   * `agent-os/specs/2026-10-13-1147-finance-narrow-ledger-reads/`). They are not in the
   * index any more, so no load pays for them. Kept until `reload()` or a new server render.
   */
  const [facets, setFacets] = useState<{
    viewKey: string;
    values: Record<string, string[]>;
  } | null>(null);
  const facetsAsked = useRef<string | null>(null);
  const {
    key,
    index,
    cache,
    setCache,
    error,
    setError,
    queryRef,
    onVisibleRange,
    pendingRowIds,
    reload,
  } = useWindowedSource({
    initial,
    query,
    queryKey: registerQueryKey,
    loadIndex: loadRegisterIndexAction,
    loadBlock: loadRegisterBlockAction,
    blockSize: REGISTER_BLOCK_SIZE,
    prefetch: REGISTER_PREFETCH,
    onNewRender: () => setFacets(null),
    onReload: () => {
      // The rows behind the lists may have changed; the next menu asks again.
      facetsAsked.current = null;
      setFacets(null);
    },
  });
  useEffect(() => {
    // A new server render means the rows may have changed under the lists.
    facetsAsked.current = null;
  }, [initial]);

  const ensureFacets = useCallback(() => {
    const asked = queryRef.current;
    const viewKey = viewKeyOf(asked);
    if (facetsAsked.current === viewKey) return;
    facetsAsked.current = viewKey;
    void loadRegisterFacetsAction(asked).then((result) => {
      // `reload()` or a new server render in the meantime means this answer may predate the
      // rows; it is dropped and the next menu asks again.
      if (facetsAsked.current !== viewKey) return;
      if (!result.ok) {
        facetsAsked.current = null;
        setError(result.error);
        return;
      }
      setFacets({ viewKey, values: result.data });
    });
  }, [queryRef, setError]);

  const loadSplitChildren = useCallback(
    async (parentId: string) => {
      const result = await listSplitChildrenAction(parentId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setChildrenByParent((current) => {
        const next = new Map(current);
        next.set(parentId, result.data);
        return next;
      });
    },
    [setError],
  );

  /** Show or hide one parent's children. Fetches them the first time, then keeps them. */
  const toggleSplit = useCallback(
    (parentId: string) => {
      setExpandedSplitIds((current) => {
        const next = new Set(current);
        if (next.has(parentId)) next.delete(parentId);
        else next.add(parentId);
        return next;
      });
      void loadSplitChildren(parentId);
    },
    [loadSplitChildren],
  );

  const viewKey = viewKeyOf(query);
  useEffect(() => {
    if (wantFacets) ensureFacets();
  }, [wantFacets, viewKey, ensureFacets]);
  const notBudgetedIds = useMemo(
    () => new Set(index.notBudgetedIds),
    [index.notBudgetedIds],
  );

  const gridRows: GridRow<RegisterTransactionRow>[] = useMemo(
    () =>
      index.entries.flatMap((entry): GridRow<RegisterTransactionRow>[] => {
        if (entry.kind === "group") {
          return [
            {
              kind: "group" as const,
              id: entry.id,
              label: entry.label,
              count: entry.count,
              depth: entry.depth,
              collapsed: false,
            },
          ];
        }
        const parent: GridRow<RegisterTransactionRow> = {
          kind: "node" as const,
          id: entry.id,
          node: asRegisterRow(
            cache.get(entry.id) ?? placeholder(entry.id),
            notBudgetedIds,
          ),
          depth: 0,
        };
        if (!expandedSplitIds.has(entry.id)) return [parent];
        const children = childrenByParent.get(entry.id) ?? [];
        return [
          parent,
          ...children.map((child) => ({
            kind: "node" as const,
            id: child.id,
            node: asRegisterRow(child, notBudgetedIds),
            depth: 1,
          })),
        ];
      }),
    [index.entries, cache, notBudgetedIds, expandedSplitIds, childrenByParent],
  );

  const patchRow = useCallback(
    (transactionId: string, patch: Partial<TransactionListRow>) => {
      setCache((current) => {
        const existing = current.get(transactionId);
        if (existing) {
          const next = new Map(current);
          next.set(transactionId, { ...existing, ...patch });
          return next;
        }
        return current;
      });
      // A child edited in place — its envelope — lives in the child map, not the cache.
      setChildrenByParent((current) => {
        for (const [parentId, rows] of current) {
          const at = rows.findIndex((row) => row.id === transactionId);
          if (at === -1) continue;
          const next = new Map(current);
          const updated = [...rows];
          updated[at] = { ...updated[at], ...patch };
          next.set(parentId, updated);
          return next;
        }
        return current;
      });
    },
    [setCache],
  );

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
  }, [notBudgetedIds, queryRef, setError]);

  const rowById = useCallback(
    (id: string | null) => {
      if (!id) return null;
      const row = cache.get(id);
      if (row) return asRegisterRow(row, notBudgetedIds);
      for (const rows of childrenByParent.values()) {
        const child = rows.find((entry) => entry.id === id);
        if (child) return asRegisterRow(child, notBudgetedIds);
      }
      return null;
    },
    [cache, notBudgetedIds, childrenByParent],
  );

  const putRow = useCallback(
    (row: TransactionListRow) => {
      setCache((current) => {
        const next = new Map(current);
        next.set(row.id, row);
        return next;
      });
    },
    [setCache],
  );

  return {
    index,
    // A drill-down must never temporarily present the previous query's money as its own.
    gridRows: key === index.queryKey ? gridRows : [],
    queryPending: key !== index.queryKey,
    pendingRowIds,
    error,
    setError,
    onVisibleRange,
    patchRow,
    reload,
    loadExportRows,
    rowById,
    putRow,
    expandedSplitIds,
    toggleSplit,
    childrenByParent,
    refreshSplitChildren: loadSplitChildren,
    counts: { shown: index.shown, total: index.total },
    distinctValues: facets?.viewKey === viewKey ? facets.values : NO_FACETS,
    ensureFacets,
    groupIds: index.groupIds,
  };
}
