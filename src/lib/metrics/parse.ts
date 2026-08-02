/** Parse a DB `numeric` string (or number) into a finite number, else null. */
export function parseNumeric(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n =
    typeof raw === "number" ? raw : Number(String(raw).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Format a number for display without trailing junk (1.618, 80, 86.5). */
export function formatMetricNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  // Prefer shortest accurate representation for typical metric decimals.
  if (Number.isInteger(n)) return String(n);
  const fixed = n.toFixed(6).replace(/\.?0+$/, "");
  return fixed;
}

/** `YYYY-MM-DD` today in local calendar (for default entry date). */
export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** True when s looks like `YYYY-MM-DD`. */
export function isDateKey(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}
