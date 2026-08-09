import type { NodeState } from "@/db/schema";
import { STATE_CODES, STATE_LABELS } from "@/lib/tree/hierarchy";
import { isSettled } from "@/lib/tree/completionCascade";
import { optionsFilter, type ColumnFilter } from "./customFilter";
import { BLANKS_OPTION_ID } from "./setFilter";

/**
 * The State filters a view opens with, built the way the user would build them.
 *
 * "Active Tasks" used to be a hardcoded `keep` predicate inside `sliceTree` — invisible, not
 * clearable, and impossible to combine with anything. It is a **set filter over the State
 * column** now: the same shape the funnel writes when you untick two boxes, so the chip bar
 * names it, `Clear all` removes it, and the funnel opens with those two boxes already
 * unticked instead of claiming everything is showing.
 *
 * A view is only a collection of settings if its settings are the ordinary kind.
 *
 * Ticked ids rather than excluded ones because that is what the set filter stores — see
 * `setFilter.ts`. It also degrades the right way: a state added to the enum later is *not*
 * in a stored list, so it stays hidden until the user ticks it, rather than silently
 * appearing in a view that never meant to include it.
 */

/** Every state a `<select>` offers, in Achieve's order. */
const ALL_STATES = Object.keys(STATE_LABELS) as NodeState[];

/** Work that is still yours to do — everything except completed and cancelled. */
export const OPEN_STATES: NodeState[] = ALL_STATES.filter((state) => !isSettled(state));

/** Finished or abandoned. The complement of `OPEN_STATES`. */
export const SETTLED_STATES: NodeState[] = ALL_STATES.filter(isSettled);

/**
 * How a State column stores its filter values. The narrow column filters on Achieve's
 * two-letter codes and the wide one on full labels, because each filters on what its own
 * cell shows — see `abbrStateColumn` / `stateColumn`.
 */
export type StateEncoding = "code" | "label";

export function encodeState(state: NodeState, encoding: StateEncoding): string {
  return encoding === "code" ? STATE_CODES[state] : STATE_LABELS[state];
}

/** A set filter ticking exactly `states`. */
export function stateFilter(
  states: readonly NodeState[],
  encoding: StateEncoding,
  options: { includeBlanks?: boolean } = {},
): ColumnFilter {
  const ids = states.map((state) => `value:${encodeState(state, encoding)}`);
  if (options.includeBlanks) ids.push(BLANKS_OPTION_ID);
  return optionsFilter(ids);
}

/**
 * The default filters for a view that shows open work, keyed by the State column that view
 * actually has. Returns a fresh object per call so no two views can share one by reference.
 */
export function openStateFilters(
  columnId: string,
  encoding: StateEncoding,
  options: { includeBlanks?: boolean } = {},
): Record<string, ColumnFilter> {
  return { [columnId]: stateFilter(OPEN_STATES, encoding, options) };
}

/** The mirror image: a "Completed" view. Cancelled counts, for the reason `isSettled` says. */
export function settledStateFilters(
  columnId: string,
  encoding: StateEncoding,
): Record<string, ColumnFilter> {
  return { [columnId]: stateFilter(SETTLED_STATES, encoding) };
}
