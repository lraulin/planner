/** CSS custom properties for stacked trends and Sankey. Index 7 is Other. */
export const CHART_CAT_VARS = [
  "var(--chart-cat-1)",
  "var(--chart-cat-2)",
  "var(--chart-cat-3)",
  "var(--chart-cat-4)",
  "var(--chart-cat-5)",
  "var(--chart-cat-6)",
  "var(--chart-cat-7)",
  "var(--chart-cat-8)",
] as const;

export function chartCatVar(index: number): string {
  return CHART_CAT_VARS[index] ?? CHART_CAT_VARS[CHART_CAT_VARS.length - 1];
}
