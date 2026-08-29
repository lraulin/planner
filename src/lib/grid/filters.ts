import { shiftDateKey } from "@/lib/schedule/geometry";
import {
  filterActive,
  isCustomFilter,
  matchesCustom,
  optionsFilter,
  parseFilterNumber,
  NONE_OPTION_ID,
  type ColumnFilter,
  type FilterKind,
} from "./customFilter";
import {
  filterValueBlank,
  scalarFilterValues,
  type GridFilterValue,
} from "./filterValue";

/**
 * Per-column filter state and the pure matching rules that power the header dropdowns.
 *
 * Achieve ships a long list of semantic presets for Priority and Deadline. Those live here
 * as pure functions so the Projects / Tasks tabs can unit-test them without a DOM, and so
 * the grid never reimplements "is this A or B?" in JSX.
 *
 * Custom multi-condition filters (`mode: "custom"`) live in `./customFilter` and are
 * mutually exclusive with the checklist (`mode: "options"`) per column.
 */

export {
  ALL_FILTER,
  NONE_FILTER,
  NONE_OPTION_ID,
  filterActive,
  isCustomFilter,
  isOptionsFilter,
  optionsFilter,
  type ColumnFilter,
  type CustomColumnFilter,
  type FilterCondition,
  type FilterJoin,
  type FilterOperator,
  type OptionsColumnFilter,
} from "./customFilter";

export type FilterOption = {
  id: string;
  label: string;
};

/**
 * Universal entries every filterable column gets, before kind-specific presets.
 * `(Custom)...` is listed here for order, but the header treats it as a dialog action
 * rather than a toggleable checklist id.
 */
export const UNIVERSAL_OPTIONS: FilterOption[] = [
  { id: "all", label: "(All)" },
  { id: "custom", label: "(Custom)..." },
  { id: "blanks", label: "(Blanks)" },
  { id: "nonblanks", label: "(NonBlanks)" },
  // Not an entry anyone ticks — `(Select none)` writes it. Listed so the chip bar can name
  // the one filter that empties a grid instead of showing a raw id.
  { id: NONE_OPTION_ID, label: "(None selected)" },
];

/**
 * All a free-text or numeric column offers as named bands: is there a value or not.
 *
 * Everything narrower on such a column is a phrase or a threshold, which is Custom
 * criteria's job — a checklist of every distinct project name or effort string is a list of
 * the rows themselves, not a way to choose among options.
 */
export const BLANK_PRESETS: FilterOption[] = [
  { id: "blanks", label: "(Blanks)" },
  { id: "nonblanks", label: "(NonBlanks)" },
];

/**
 * Named bands on the number line. A checklist of formatted amounts (`$12.34`, `$1,200.00`)
 * is a list of the rows; what you actually pick is a side of zero — or Custom for a
 * threshold. Register Amount is the load-bearing case (deposits vs spend).
 */
export const NUMBER_PRESETS: FilterOption[] = [
  { id: "positive", label: "(Positive)" },
  { id: "negative", label: "(Negative)" },
  { id: "zero", label: "(Zero)" },
];

/**
 * Priority presets from screenshot 10.55.58, plus the "up to letter + unprioritized"
 * bands that keep blanks visible so you can still assign them. Values are the strings
 * `formatPriority` produces (`A1`, `B2`, …) or `""` / null for unset.
 *
 * Achieve's "Only As / Only As & Bs / …" hide blanks. The `*-and-unprioritized` variants
 * are the daily-use pattern: drop letters already decided (often D) without hiding work
 * that still needs a letter.
 *
 * Achieve's `Ranked` / `Unranked` / `Only Ranked As` / `Only Unranked As` are **gone**. They
 * split a letter into the numbered and the bare, and a node no longer has a bare letter —
 * `Ranked` would mean the same as `Prioritized` and `Unranked` would always be empty. A
 * filter that cannot exclude anything is worse than absent: it reads as a broken filter.
 */
export const PRIORITY_PRESETS: FilterOption[] = [
  { id: "only-a1", label: "Only A1" },
  { id: "only-as", label: "Only As" },
  { id: "as-and-unprioritized", label: "As & Unprioritized" },
  { id: "only-as-bs", label: "Only As & Bs" },
  { id: "as-bs-and-unprioritized", label: "As Bs & Unprioritized" },
  { id: "only-as-bs-cs", label: "Only As Bs & Cs" },
  { id: "as-bs-cs-and-unprioritized", label: "As Bs Cs & Unprioritized" },
  { id: "only-bs", label: "Only Bs" },
  { id: "only-bs-cs", label: "Only Bs & Cs" },
  { id: "only-cs", label: "Only Cs" },
  { id: "only-ds", label: "Only Ds" },
  { id: "prioritized", label: "Prioritized" },
  { id: "unprioritized", label: "Unprioritized" },
];

/**
 * Date presets from screenshot 10.57.07. Values are `YYYY-MM-DD` or null.
 *
 * These are **bands of the calendar relative to today**, not values — which is why a date
 * column offers them instead of a checklist. A list of the ISO dates a column happens to
 * hold answers "which rows exist", never "what is overdue", and it goes stale the moment a
 * deadline moves; `(Today & Past)` keeps meaning the same thing tomorrow.
 */
export const DATE_PRESETS: FilterOption[] = [
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
 * The semantic bands a column kind offers, without the universal entries or the values.
 *
 * Exactly one of these and the set filter is ever on screen — see `usesSetFilter`. Enum
 * columns are the checklist case and have no bands; every other kind is bands only.
 *
 * `filterOptions` still returns everything together, because the chip bar resolves any
 * option id — preset, value or universal — through one lookup.
 */
export function presetOptions(kind: FilterKind | undefined): FilterOption[] {
  if (kind === "enum") return [];
  if (kind === "priority") return PRIORITY_PRESETS;
  if (kind === "date") return DATE_PRESETS;
  if (kind === "number") return [...NUMBER_PRESETS, ...BLANK_PRESETS];
  return BLANK_PRESETS;
}

/**
 * Whether the column funnel shows the set-filter checklist of distinct values.
 *
 * **Only enum columns.** A checklist of ticked values is the right control when the values
 * are a closed set someone could have picked from a dropdown — State, Status, Icon,
 * Category — because ticking three of five states is a choice among the options themselves.
 *
 * It is the wrong control everywhere else, and wrong in two different ways:
 *
 * - **Open-ended values** (name, notes, effort, cost, priority ranks). The list is as long
 *   as the grid and grows with it; you would be picking rows, not narrowing by a property.
 *   Priority also has real bands — "Only As", "As & Bs", unprioritized — that a list of
 *   `A1 / A2 / B` cannot express.
 * - **Dates.** The distinct dates a column holds are an accident of the data, and a filter
 *   naming them is stale as soon as a deadline moves. What you actually want is a band
 *   relative to today (`(Past)`, `(Today & Past)`, `(Next 7 Days)`) or a threshold —
 *   `> 2026-08-01 AND <= 2026-08-31` — which is Custom criteria.
 *
 * Those columns get `presetOptions` instead, chosen one at a time. Anything finer than a
 * named band is Custom criteria, which offers `<` `<=` `>` `>=` joined by And/Or.
 */
export function usesSetFilter(kind: FilterKind | undefined): boolean {
  return kind === "enum" || kind === "tags";
}

/**
 * Presets are **mutually exclusive**: picking one replaces whatever the column had.
 *
 * They describe overlapping bands of one axis, so an OR of two is nearly always either
 * redundant ("Only As" or "Only As & Bs" is just the latter) or a way to build a range
 * nobody meant. A radio list also stops the funnel from claiming a column is filtered four
 * ways at once. `(All)` is the way back out; Custom criteria is the way to combine.
 */
export function selectPreset(id: string): ColumnFilter {
  return optionsFilter([id]);
}

/**
 * Every option id a column can hold, in one list: universal entries, kind presets, and the
 * distinct values present in the current rows.
 *
 * The header no longer renders this — it builds a set filter from the values and reads
 * presets separately. This remains the one place an arbitrary stored option id can be
 * turned back into a label, which is what the chip bar needs.
 */
export function filterOptions(
  kind: FilterKind | undefined,
  distinctValues: string[],
): FilterOption[] {
  const presets =
    kind === "priority"
      ? PRIORITY_PRESETS
      : kind === "date"
        ? DATE_PRESETS
        : kind === "number"
          ? NUMBER_PRESETS
          : [];

  const values = distinctValues
    .filter((value) => value !== "")
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ id: `value:${value}`, label: value }));

  return [...UNIVERSAL_OPTIONS, ...presets, ...values];
}

/**
 * Whether a cell's filter value passes the column's selection.
 *
 * Options mode: any selected option matching is enough (OR). Custom mode: And/Or of
 * conditions — see `matchesCustom`.
 *
 * `today` is `YYYY-MM-DD` (or null before hydration). Date presets that need a clock treat
 * an unknown today as "match everything", so the server and first paint do not disagree.
 */
export function matchesFilter(
  value: GridFilterValue,
  filter: ColumnFilter,
  kind: FilterKind | undefined,
  today: string | null,
): boolean {
  if (!filterActive(filter)) return true;
  if (isCustomFilter(filter)) return matchesCustom(value, filter, kind);
  return filter.ids.some((id) => matchesOption(value, id, kind, today));
}

function matchesOption(
  value: GridFilterValue,
  id: string,
  kind: FilterKind | undefined,
  today: string | null,
): boolean {
  // A cleared checklist. Checked ahead of everything else — including the date presets,
  // which have their own `none` meaning "blank" — so it can never be read as a band.
  if (id === NONE_OPTION_ID) return false;

  if (id === "blanks") return filterValueBlank(value);
  if (id === "nonblanks") return !filterValueBlank(value);

  if (id.startsWith("value:")) {
    const wanted = id.slice("value:".length);
    return scalarFilterValues(value).includes(wanted);
  }

  if (kind === "priority") {
    const values = scalarFilterValues(value);
    return values.length === 0
      ? matchesPriority(null, id)
      : values.some((entry) => matchesPriority(entry, id));
  }

  if (kind === "date") {
    const values = scalarFilterValues(value);
    return values.length === 0
      ? matchesDeadline(null, id, today)
      : values.some((entry) => matchesDeadline(entry, id, today));
  }

  if (kind === "number") {
    const values = scalarFilterValues(value);
    return values.length === 0
      ? matchesNumberBand(null, id)
      : values.some((entry) => matchesNumberBand(entry, id));
  }

  // Enum / text with no matching preset id: treat unknown ids as open (do not hide rows).
  return true;
}

function matchesNumberBand(value: string | null, id: string): boolean {
  const magnitude = value === null || value === "" ? null : parseFilterNumber(value);

  switch (id) {
    case "positive":
      return magnitude !== null && magnitude > 0;
    case "negative":
      return magnitude !== null && magnitude < 0;
    case "zero":
      return magnitude !== null && magnitude === 0;
    default:
      return true;
  }
}

function matchesPriority(value: string | null, id: string): boolean {
  const raw = value ?? "";
  const letter = raw.charAt(0);
  const prioritized =
    letter === "A" || letter === "B" || letter === "C" || letter === "D";

  switch (id) {
    case "only-a1":
      return raw === "A1";
    case "only-as":
      return letter === "A";
    case "as-and-unprioritized":
      return letter === "A" || !prioritized;
    case "only-as-bs":
      return letter === "A" || letter === "B";
    case "as-bs-and-unprioritized":
      return letter === "A" || letter === "B" || !prioritized;
    case "only-as-bs-cs":
      return letter === "A" || letter === "B" || letter === "C";
    case "as-bs-cs-and-unprioritized":
      // Exclude Ds only — the usual daily cut once something is marked irrelevant.
      return letter === "A" || letter === "B" || letter === "C" || !prioritized;
    case "only-bs":
      return letter === "B";
    case "only-bs-cs":
      return letter === "B" || letter === "C";
    case "only-cs":
      return letter === "C";
    case "only-ds":
      return letter === "D";
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

/** Shift a `YYYY-MM-DD` calendar day by `delta` whole days (day-label arithmetic). */
export function shiftDays(isoDate: string, delta: number): string {
  return shiftDateKey(isoDate, delta);
}

/**
 * Apply every active column filter to a node row's filter values.
 *
 * `values` is keyed by column id and must carry an entry for **every filterable column the
 * tab defines**, not merely the visible ones — a column hidden by Show Fields still filters.
 * A blank cell is `null`; a *missing key* means the column does not exist at all.
 *
 * That distinction is the whole point. A filter naming a column the grid cannot supply a
 * value for is treated as **inert**, not as "every cell is blank": the latter fails every
 * row, so a layout saved before a column was renamed would silently empty the grid with no
 * funnel on screen to explain it. `useGridState` degrades a stale column `order` the same
 * way rather than stranding the tab.
 */
export function rowPassesFilters(
  values: Record<string, GridFilterValue>,
  filters: Record<string, ColumnFilter>,
  kinds: Record<string, FilterKind | undefined>,
  today: string | null,
): boolean {
  for (const [columnId, filter] of Object.entries(filters)) {
    if (!filterActive(filter)) continue;
    if (!(columnId in values)) continue;
    if (!matchesFilter(values[columnId], filter, kinds[columnId], today)) {
      return false;
    }
  }
  return true;
}
