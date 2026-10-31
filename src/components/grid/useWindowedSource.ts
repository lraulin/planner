"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { QueryResult } from "@/app/actionResult";

/** One line of a windowed grid's index: a group header, or the id of a row to fetch. */
export type WindowedIndexEntry =
  | { kind: "group"; id: string; label: string; count: number; depth: number }
  | { kind: "node"; id: string };

/** What the server sends for one query: every line in display order, without row data. */
export type WindowedIndex<Entry extends WindowedIndexEntry> = {
  queryKey: string;
  entries: Entry[];
  shown: number;
  total: number;
  groupIds: string[];
};

/** A server render or index reload: the index plus the first block of rows. */
export type WindowedPrepared<Index, Row> = { index: Index; block: { rows: Row[] } };

function cacheFrom<Row extends { id: string }>(
  prepared: WindowedPrepared<unknown, Row>,
): Map<string, Row> {
  return new Map(prepared.block.rows.map((row) => [row.id, row]));
}

/**
 * The engine behind a grid too large to send whole (Register, Amazon orders): the server
 * sends an index of ids for the current query, and rows are fetched by id in blocks as they
 * scroll into view, `prefetch` lines either side.
 *
 * A new query key re-fetches the index (debounced while a search is being typed); answers
 * that arrive after a newer request are dropped.
 *
 * For state the caller derives from the rows, such as filter lists: `onNewRender` runs when
 * a new server render replaces the index — during render, so it may only set state — and
 * `onReload` runs after `reload()` has replaced it.
 */
export function useWindowedSource<
  Row extends { id: string },
  Entry extends WindowedIndexEntry,
  Index extends WindowedIndex<Entry>,
  Query extends { search: string },
>({
  initial,
  query,
  queryKey,
  loadIndex,
  loadBlock,
  blockSize,
  prefetch,
  onNewRender,
  onReload,
}: {
  initial: WindowedPrepared<Index, Row>;
  query: Query;
  queryKey: (query: Query) => string;
  loadIndex: (query: Query) => Promise<QueryResult<WindowedPrepared<Index, Row>>>;
  loadBlock: (ids: readonly string[]) => Promise<QueryResult<{ rows: Row[] }>>;
  blockSize: number;
  prefetch: number;
  onNewRender?: () => void;
  onReload?: () => void;
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
    onNewRender?.();
  }
  useEffect(() => {
    queryRef.current = query;
  });

  const key = queryKey(query);

  useEffect(() => {
    if (key === index.queryKey) return;
    const handle = window.setTimeout(
      () => {
        const id = ++requestId.current;
        void loadIndex(queryRef.current).then((result) => {
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
  }, [key, index.queryKey, query.search, loadIndex]);

  const mergeRows = useCallback((rows: readonly Row[]) => {
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
      const batch = missing.slice(0, blockSize);
      for (const id of batch) inFlight.current.add(id);
      void loadBlock(batch).then((result) => {
        for (const id of batch) inFlight.current.delete(id);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        mergeRows(result.data.rows);
      });
    },
    [cache, mergeRows, blockSize, loadBlock],
  );

  const onVisibleRange = useCallback(
    (start: number, end: number) => {
      const from = Math.max(0, start - prefetch);
      const to = Math.min(index.entries.length - 1, end + prefetch);
      const ids: string[] = [];
      for (let i = from; i <= to; i++) {
        const entry = index.entries[i];
        if (entry?.kind === "node") ids.push(entry.id);
      }
      ensureIds(ids);
    },
    [index.entries, ensureIds, prefetch],
  );

  const pendingRowIds = useMemo(() => {
    const pending = new Set<string>();
    for (const entry of index.entries) {
      if (entry.kind === "node" && !cache.has(entry.id)) pending.add(entry.id);
    }
    return pending;
  }, [index.entries, cache]);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    const result = await loadIndex(queryRef.current);
    if (id !== requestId.current) return;
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setIndex(result.data.index);
    setCache(cacheFrom(result.data));
    onReload?.();
  }, [loadIndex, onReload]);

  return {
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
  };
}
