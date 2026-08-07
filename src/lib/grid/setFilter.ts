import { NONE_OPTION_ID } from "./customFilter";
import type { ColumnValues } from "./distinct";

/**
 * The set filter: the checkbox list of the values a column actually holds, the way AG Grid
 * and Excel present one.
 *
 * The old dropdown was a flat list of every distinct value with a tick beside the chosen
 * ones. That is fine for four states and unusable for forty result areas — no way to find a
 * value, no sense of how much each one covers, and on the State column the entries were
 * Achieve's two-letter codes, which nobody picks from.
 *
 * This module is only the *list*: which entries exist, what they read as, how many rows
 * each covers, and which are ticked. The selection model underneath is unchanged —
 * `OptionsColumnFilter.ids`, OR'd, empty meaning unfiltered — so nothing about matching or
 * persistence moves.
 */

export type SetFilterEntry = {
  /** The option id this row toggles: `value:X`, or `blanks`. */
  optionId: string;
  /** What the user reads. */
  label: string;
  /** How many rows carry it. */
  count: number;
  /** Whether it is currently selected. */
  selected: boolean;
};

export const BLANKS_OPTION_ID = "blanks";

/** The option id a concrete value toggles. Mirrors `matchesOption` in `./filters`. */
export function valueOptionId(value: string): string {
  return `value:${value}`;
}

/**
 * Build the list for one column.
 *
 * `search` narrows by **label**, not by stored value — on the State column you look for
 * "progress", not "IP".
 *
 * Entries sort by label so the list is scannable; `(Blanks)` sits last because it is the
 * absence of a value rather than one of them, and is omitted entirely when no row is blank.
 *
 * **An empty selection shows every entry as ticked.** Nothing selected means nothing is
 * being filtered out, so every value is on screen — drawing them all unticked would say the
 * opposite of what the grid is doing. The one selection that does draw everything unticked
 * is `NONE_OPTION_ID`, which is the cleared checklist `(Select none)` leaves behind.
 */
export function buildSetFilterEntries({
  values,
  selectedIds,
  labelOf,
  search = "",
}: {
  values: ColumnValues | undefined;
  selectedIds: readonly string[];
  /** Presentation for a stored value — see `ColumnDef.filterLabel`. */
  labelOf?: (value: string) => string;
  search?: string;
}): SetFilterEntry[] {
  if (!values) return [];

  const active = selectedIds.filter((id) => id !== "all" && id !== NONE_OPTION_ID);
  // An explicitly cleared checklist and an empty one look identical in `ids` otherwise, and
  // they mean opposite things — see `NONE_OPTION_ID`.
  const showAll = active.length === 0 && !selectedIds.includes(NONE_OPTION_ID);
  const selected = new Set(active);

  const entries: SetFilterEntry[] = Array.from(values.counts, ([value, count]) => ({
    optionId: valueOptionId(value),
    label: labelOf ? labelOf(value) : value,
    count,
    selected: showAll || selected.has(valueOptionId(value)),
  }));

  entries.sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" }),
  );

  if (values.blanks > 0) {
    entries.push({
      optionId: BLANKS_OPTION_ID,
      label: "(Blanks)",
      count: values.blanks,
      selected: showAll || selected.has(BLANKS_OPTION_ID),
    });
  }

  return matchesSearch(entries, search);
}

/** Narrow a built list by its labels. Blank query returns everything. */
export function matchesSearch(
  entries: readonly SetFilterEntry[],
  search: string,
): SetFilterEntry[] {
  const query = search.trim().toLocaleLowerCase();
  if (query === "") return [...entries];
  return entries.filter((entry) => entry.label.toLocaleLowerCase().includes(query));
}

/**
 * State of the `(Select all)` box.
 *
 * `all` when nothing is filtered out — which is what an empty selection means — and `none`
 * once the checklist has been cleared. A column with no values at all reads as `all`: there
 * is nothing being hidden.
 */
export function selectAllState(
  entries: readonly SetFilterEntry[],
): "all" | "some" | "none" {
  if (entries.every((entry) => entry.selected)) return "all";
  if (entries.every((entry) => !entry.selected)) return "none";
  return "some";
}

/**
 * Toggle one entry, returning the new option ids.
 *
 * The first untick from "everything showing" has to name every *other* value, because the
 * stored model lists what to keep rather than what to drop. That is what makes unticking
 * one state behave the way it looks like it should.
 *
 * Ticking the last missing entry lands back on `[]` — unfiltered — rather than a list of
 * every current value. This matters beyond tidiness: a stored list naming everything that
 * existed at the time would silently exclude any value added later.
 *
 * From a cleared checklist the first tick selects exactly that entry, since `(Select none)`
 * already said the others are out. Unticking the last remaining entry lands back on cleared,
 * which is the `(Select none)` state rather than "show everything".
 */
export function toggleSetEntry(
  allEntries: readonly SetFilterEntry[],
  selectedIds: readonly string[],
  optionId: string,
): string[] {
  const cleared = selectedIds.includes(NONE_OPTION_ID);
  const active = selectedIds.filter((id) => id !== "all" && id !== NONE_OPTION_ID);
  const everything = allEntries.map((entry) => entry.optionId);

  const current = cleared ? [] : active.length === 0 ? everything : active;
  const next = current.includes(optionId)
    ? current.filter((id) => id !== optionId)
    : [...current, optionId];

  if (next.length === 0) return clearSelection();

  const coversEverything =
    everything.length > 0 && everything.every((id) => next.includes(id));
  return coversEverything ? [] : next;
}

/** Select this value and nothing else — Excel's "Only". */
export function onlySelection(optionId: string): string[] {
  return [optionId];
}

/**
 * Untick everything — `(Select none)`.
 *
 * The grid goes empty for as long as this stands, which is the honest reading of the click
 * and is exactly what makes it useful: on a column with thirty values, picking the three you
 * want means clearing and ticking three rather than unticking twenty-seven. The chip bar
 * still names the column, so an empty grid is never unexplained.
 */
export function clearSelection(): string[] {
  return [NONE_OPTION_ID];
}
