export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 200;

export type PageInfo = {
  offset: number;
  limit: number;
  returned: number;
  total: number;
  hasMore: boolean;
  nextOffset: number | null;
};

export function pageBounds(
  offset: number | undefined,
  limit: number | undefined,
  defaults: { limit?: number; max?: number } = {},
): { offset: number; limit: number } {
  return {
    offset: Math.max(0, Math.trunc(offset ?? 0)),
    limit: Math.min(
      Math.max(1, Math.trunc(limit ?? defaults.limit ?? DEFAULT_PAGE_LIMIT)),
      defaults.max ?? MAX_PAGE_LIMIT,
    ),
  };
}

export function paginate<T>(
  rows: readonly T[],
  bounds: { offset: number; limit: number },
): { items: T[]; pageInfo: PageInfo } {
  const items = rows.slice(bounds.offset, bounds.offset + bounds.limit);
  const nextOffset = bounds.offset + items.length;
  const hasMore = nextOffset < rows.length;
  return {
    items,
    pageInfo: {
      ...bounds,
      returned: items.length,
      total: rows.length,
      hasMore,
      nextOffset: hasMore ? nextOffset : null,
    },
  };
}
