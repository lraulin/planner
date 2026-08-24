/** One grid cell may expose one scalar or several independently filterable tokens. */
export type GridFilterValue = string | readonly string[] | null;

export function scalarFilterValues(value: GridFilterValue): string[] {
  const values = Array.isArray(value) ? value : value === null ? [] : [value as string];
  return values.filter((entry) => entry !== "");
}

export function filterValueBlank(value: GridFilterValue): boolean {
  return scalarFilterValues(value).length === 0;
}
