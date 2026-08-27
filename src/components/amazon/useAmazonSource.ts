"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  loadAmazonBlockAction,
  loadAmazonExportAction,
  loadAmazonIndexAction,
} from "@/app/finances/actions";
import type { AmazonItemListRow } from "@/lib/amazon/types";
import {
  AMAZON_BLOCK_SIZE,
  AMAZON_PREFETCH,
  amazonOrdersQueryKey,
  type AmazonOrdersPrepared,
  type AmazonOrdersQuery,
} from "@/lib/amazon/ordersQuery";
import type { GridRow } from "@/lib/tree/slice";
import type { NodeGridRow } from "@/components/grid/columns";

function placeholder(id: string): AmazonItemListRow {
  return {
    id,
    orderId: "",
    amazonOrderId: "",
    channel: "retail",
    orderDate: "",
    orderStatus: "",
    productName: "",
    asin: "",
    quantity: 1,
    unitPriceCents: null,
    itemPaidCents: null,
    discountsCents: null,
    paymentLast4: null,
    paymentMethod: "",
    subscribeAndSave: false,
    shipmentStatus: "",
    shippingOption: "",
    website: "",
    currency: "USD",
    refundCount: 0,
    billName: null,
    matchLabel: null,
  };
}

function cacheFrom(prepared: AmazonOrdersPrepared): Map<string, AmazonItemListRow> {
  return new Map(prepared.block.rows.map((row) => [row.id, row]));
}

export function useAmazonSource({
  initial,
  query,
}: {
  initial: AmazonOrdersPrepared;
  query: AmazonOrdersQuery;
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

  const key = amazonOrdersQueryKey(query);

  useEffect(() => {
    if (key === index.queryKey) return;
    const handle = window.setTimeout(
      () => {
        const id = ++requestId.current;
        void loadAmazonIndexAction(queryRef.current).then((result) => {
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

  const mergeRows = useCallback((rows: readonly AmazonItemListRow[]) => {
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
      const batch = missing.slice(0, AMAZON_BLOCK_SIZE);
      for (const id of batch) inFlight.current.add(id);
      void loadAmazonBlockAction(batch).then((result) => {
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
      const from = Math.max(0, start - AMAZON_PREFETCH);
      const to = Math.min(index.entries.length - 1, end + AMAZON_PREFETCH);
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

  const gridRows: GridRow<AmazonItemListRow>[] = useMemo(
    () =>
      index.entries.map((entry): GridRow<AmazonItemListRow> => {
        if (entry.kind === "group") {
          return {
            kind: "group",
            id: entry.id,
            label: entry.label,
            count: entry.count,
            depth: entry.depth,
            collapsed: false,
          };
        }
        return {
          kind: "node",
          id: entry.id,
          node: cache.get(entry.id) ?? placeholder(entry.id),
          depth: 0,
        };
      }),
    [index.entries, cache],
  );

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    const result = await loadAmazonIndexAction(queryRef.current);
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
    NodeGridRow<AmazonItemListRow>[]
  > => {
    const result = await loadAmazonExportAction(queryRef.current);
    if (!result.ok) {
      setError(result.error);
      return [];
    }
    return result.data.map((row) => ({
      kind: "node" as const,
      id: row.id,
      node: row,
      depth: 0,
    }));
  }, []);

  const rowById = useCallback(
    (id: string | null) => {
      if (!id) return null;
      return cache.get(id) ?? null;
    },
    [cache],
  );

  return {
    index,
    gridRows,
    pendingRowIds,
    error,
    setError,
    onVisibleRange,
    reload,
    loadExportRows,
    rowById,
    counts: { shown: index.shown, total: index.total },
    distinctValues: index.facets,
    groupIds: index.groupIds,
  };
}
