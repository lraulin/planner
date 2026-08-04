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

/** The option id a concrete value toggles. Mirrors `matchesOption` in `components/grid/filters`. */
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
 * opposite of what the grid is doing.
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

  const active = selectedIds.filter((id) => id !== "all");
  const showAll = active.length === 0;
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
 * `all` when nothing is filtered out — which is what an empty selection means. There is
 * deliberately no `none`: the selection model cannot express "show no rows", and a control
 * that can put the grid in a state it cannot describe is worse than one without it. Picking
 * a single value is one click on its label (`onlySelection`) rather than unticking the rest.
 */
export function selectAllState(entries: readonly SetFilterEntry[]): "all" | "some" {
  return entries.every((entry) => entry.selected) ? "all" : "some";
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
 */
export function toggleSetEntry(
  allEntries: readonly SetFilterEntry[],
  selectedIds: readonly string[],
  optionId: string,
): string[] {
  const active = selectedIds.filter((id) => id !== "all");
  const everything = allEntries.map((entry) => entry.optionId);

  const current = active.length === 0 ? everything : active;
  const next = current.includes(optionId)
    ? current.filter((id) => id !== optionId)
    : [...current, optionId];

  // Unticking the last one would show nothing, which the model reads as "show everything" —
  // the opposite of the click. Keep it as the only selection instead.
  if (next.length === 0) return [optionId];

  const coversEverything =
    everything.length > 0 && everything.every((id) => next.includes(id));
  return coversEverything ? [] : next;
}

/** Select this value and nothing else — Excel's "Only". */
export function onlySelection(optionId: string): string[] {
  return [optionId];
}
