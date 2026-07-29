import type { FilterKind } from "./columns";

/**
 * Per-column filter state and the pure matching rules that power the header dropdowns.
 *
 * Achieve ships a long list of semantic presets for Priority and Deadline. Those live here
 * as pure functions so the Projects / Tasks tabs can unit-test them without a DOM, and so
 * the grid never reimplements "is this A or B?" in JSX.
 */

export type ColumnFilter = {
  /** Preset id, a distinct value, or `all`. */
  id: string;
};

export const ALL_FILTER: ColumnFilter = { id: "all" };

export type FilterOption = {
  id: string;
  label: string;
};

/** Universal entries every filterable column gets, before kind-specific presets. */
export const UNIVERSAL_OPTIONS: FilterOption[] = [
  { id: "all", label: "(All)" },
  { id: "blanks", label: "(Blanks)" },
  { id: "nonblanks", label: "(NonBlanks)" },
];

/**
 * Priority presets from screenshot 10.55.58. Values are the strings `formatPriority`
 * produces (`A1`, `A`, `B2`, …) or `""` / null for unset.
 */
export const PRIORITY_PRESETS: FilterOption[] = [
  { id: "only-a1", label: "Only A1" },
  { id: "only-ranked-as", label: "Only Ranked As" },
  { id: "only-unranked-as", label: "Only Unranked As" },
  { id: "only-as", label: "Only As" },
  { id: "only-as-bs", label: "Only As & Bs" },
  { id: "only-as-bs-cs", label: "Only As Bs & Cs" },
  { id: "only-bs", label: "Only Bs" },
  { id: "only-bs-cs", label: "Only Bs & Cs" },
  { id: "only-cs", label: "Only Cs" },
  { id: "only-ds", label: "Only Ds" },
  { id: "ranked", label: "Ranked" },
  { id: "unranked", label: "Unranked" },
  { id: "prioritized", label: "Prioritized" },
  { id: "unprioritized", label: "Unprioritized" },
];

/** Deadline presets from screenshot 10.57.07. Values are `YYYY-MM-DD` or null. */
export const DEADLINE_PRESETS: FilterOption[] = [
  { id: "none", label: "(None)" },
  { id: "has-date", label: "(Has Date)" },
  { id: "past-and-none", label: "(Past & None)" },
  { id: "past", label: "(Past)" },
  { id: "last-7-days", label: "(Last 7 Days)" },
  { id: "yesterday", label: "(Yesterday)" },
  { id: "today-past-and-none", label: "(Today Past & None)" },
  { id: "today-and-past", label: "(Today & Past)" },
  { id: "today", label: "(Today)" },
  { id: "tomorrow", label: "(Tomorrow)" },
  { id: "next-7-days", label: "(Next 7 Days)" },
  { id: "next-14-days", label: "(Next 14 Days)" },
  { id: "today-and-future", label: "(Today & Future)" },
  { id: "today-future-and-none", label: "(Today Future & None)" },
];

/**
 * Options shown in a column's filter dropdown: universal + kind presets + distinct values
 * found in the current rows (so a State filter lists the states that are actually present).
 */
export function filterOptions(
  kind: FilterKind | undefined,
  distinctValues: string[],
): FilterOption[] {
  const presets =
    kind === "priority" ? PRIORITY_PRESETS : kind === "date" ? DEADLINE_PRESETS : [];

  const values = distinctValues
    .filter((value) => value !== "")
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ id: `value:${value}`, label: value }));

  return [...UNIVERSAL_OPTIONS, ...presets, ...values];
}

/**
 * Whether a cell's filter value passes the active filter.
 *
 * `today` is `YYYY-MM-DD` (or null before hydration). Date presets that need a clock treat
 * an unknown today as "match everything", so the server and first paint do not disagree.
 */
export function matchesFilter(
  value: string | null,
  filter: ColumnFilter,
  kind: FilterKind | undefined,
  today: string | null,
): boolean {
  const id = filter.id;
  if (id === "all") return true;

  if (id === "blanks") return value === null || value === "";
  if (id === "nonblanks") return value !== null && value !== "";

  if (id.startsWith("value:")) {
    const wanted = id.slice("value:".length);
    return (value ?? "") === wanted;
  }

  if (kind === "priority") {
    return matchesPriority(value, id);
  }

  if (kind === "date") {
    return matchesDeadline(value, id, today);
  }

  // Enum / text with no matching preset id: treat unknown ids as open (do not hide rows).
  return true;
}

function matchesPriority(value: string | null, id: string): boolean {
  const raw = value ?? "";
  const letter = raw.charAt(0);
  const ranked = raw.length > 1;
  const prioritized =
    letter === "A" || letter === "B" || letter === "C" || letter === "D";

  switch (id) {
    case "only-a1":
      return raw === "A1";
    case "only-ranked-as":
      return letter === "A" && ranked;
    case "only-unranked-as":
      return raw === "A";
    case "only-as":
      return letter === "A";
    case "only-as-bs":
      return letter === "A" || letter === "B";
    case "only-as-bs-cs":
      return letter === "A" || letter === "B" || letter === "C";
    case "only-bs":
      return letter === "B";
    case "only-bs-cs":
      return letter === "B" || letter === "C";
    case "only-cs":
      return letter === "C";
    case "only-ds":
      return letter === "D";
    case "ranked":
      return prioritized && ranked;
    case "unranked":
      // Unranked among those that have a letter: bare A/B/C/D, not empty.
      return prioritized && !ranked;
    case "prioritized":
      return prioritized;
    case "unprioritized":
      return !prioritized;
    default:
      return true;
  }
}

function matchesDeadline(
  value: string | null,
  id: string,
  today: string | null,
): boolean {
  const blank = value === null || value === "";

  switch (id) {
    case "none":
      return blank;
    case "has-date":
      return !blank;
    default:
      break;
  }

  // Presets that need a clock: open until hydrated so SSR and client agree.
  if (!today) return true;

  if (id === "past-and-none") return blank || value < today;
  if (id === "past") return !blank && value < today;
  if (id === "today") return value === today;
  if (id === "today-and-past") return !blank && value <= today;
  if (id === "today-past-and-none") return blank || value <= today;
  if (id === "today-and-future") return !blank && value >= today;
  if (id === "today-future-and-none") return blank || value >= today;

  if (id === "yesterday") {
    return value === shiftDays(today, -1);
  }
  if (id === "tomorrow") {
    return value === shiftDays(today, 1);
  }
  if (id === "last-7-days") {
    if (blank) return false;
    const from = shiftDays(today, -7);
    return value >= from && value < today;
  }
  if (id === "next-7-days") {
    if (blank) return false;
    const to = shiftDays(today, 7);
    return value > today && value <= to;
  }
  if (id === "next-14-days") {
    if (blank) return false;
    const to = shiftDays(today, 14);
    return value > today && value <= to;
  }

  return true;
}

/** Shift a `YYYY-MM-DD` calendar day by `delta` whole days, in UTC. */
export function shiftDays(isoDate: string, delta: number): string {
  const ms = Date.parse(`${isoDate}T00:00:00Z`) + delta * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Apply every active column filter to a node row's filter values.
 * `values` is keyed by column id.
 */
export function rowPassesFilters(
  values: Record<string, string | null>,
  filters: Record<string, ColumnFilter>,
  kinds: Record<string, FilterKind | undefined>,
  today: string | null,
): boolean {
  for (const [columnId, filter] of Object.entries(filters)) {
    if (filter.id === "all") continue;
    if (!matchesFilter(values[columnId] ?? null, filter, kinds[columnId], today)) {
      return false;
    }
  }
  return true;
}
