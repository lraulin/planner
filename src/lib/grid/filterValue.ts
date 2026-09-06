/**
 * What one grid cell contributes to filtering and search: a single value, or nothing.
 *
 * This used to also admit `readonly string[]`, for a cell exposing several independently
 * filterable tokens. `filterValues` was retired with tags
 * (`specs/2026-09-02-1050-retire-tags-and-legacy-category/`), and every producer since
 * declares `(row) => string | null` — the column defs, the register fields, the Amazon
 * fields — so the array arm had become unreachable, and the branch reading it needed an
 * `as string` cast to convince the compiler of what was already true.
 */
export type GridFilterValue = string | null;

/**
 * The value as a list, with blank dropped.
 *
 * Still a list, and still a function rather than an inline check: `search.ts` uses it as a
 * `flatMap` callback over every column, and the "blank is not a value" rule belongs in one
 * place — it is what `blanks` / `nonblanks` filter on.
 */
export function scalarFilterValues(value: GridFilterValue): string[] {
  return value === null || value === "" ? [] : [value];
}

export function filterValueBlank(value: GridFilterValue): boolean {
  return scalarFilterValues(value).length === 0;
}
