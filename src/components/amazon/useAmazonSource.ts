"use client";

import { useCallback, useMemo } from "react";
import {
  loadAmazonBlockAction,
  loadAmazonExportAction,
  loadAmazonIndexAction,
} from "@/app/(shell)/finances/actions";
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
import { useWindowedSource } from "@/components/grid/useWindowedSource";

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
    chargeId: null,
    orderGrandTotalCents: null,
    orderSummaryStatus: null,
    registerLabel: null,
    registerTransactionId: null,
  };
}

export function useAmazonSource({
  initial,
  query,
}: {
  initial: AmazonOrdersPrepared;
  query: AmazonOrdersQuery;
}) {
  const {
    index,
    cache,
    error,
    setError,
    queryRef,
    onVisibleRange,
    pendingRowIds,
    reload,
  } = useWindowedSource({
    initial,
    query,
    queryKey: amazonOrdersQueryKey,
    loadIndex: loadAmazonIndexAction,
    loadBlock: loadAmazonBlockAction,
    blockSize: AMAZON_BLOCK_SIZE,
    prefetch: AMAZON_PREFETCH,
  });

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
  }, [queryRef, setError]);

  const rowById = useCallback(
    (id: string | null) => {
      if (!id) return null;
      return cache.get(id) ?? null;
    },
    [cache],
  );

  const groupPaidCents = useMemo(() => {
    const paid = new Map<string, number>();
    for (const entry of index.entries) {
      if (entry.kind === "group") paid.set(entry.id, entry.paidCents);
    }
    return paid;
  }, [index.entries]);

  const groupOrderTotals = useMemo(() => {
    const totals = new Map<
      string,
      { grandTotalCents: number | null; unreconciledOrders: number }
    >();
    for (const entry of index.entries) {
      if (entry.kind === "group") {
        totals.set(entry.id, {
          grandTotalCents: entry.grandTotalCents,
          unreconciledOrders: entry.unreconciledOrders,
        });
      }
    }
    return totals;
  }, [index.entries]);

  const groupMatch = useMemo(() => {
    const match = new Map<
      string,
      { matchLabel: string | null; chargeId: string | null }
    >();
    for (const entry of index.entries) {
      if (entry.kind === "group") {
        match.set(entry.id, {
          matchLabel: entry.matchLabel,
          chargeId: entry.chargeId,
        });
      }
    }
    return match;
  }, [index.entries]);

  return {
    index,
    gridRows,
    pendingRowIds,
    groupPaidCents,
    groupOrderTotals,
    groupMatch,
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
