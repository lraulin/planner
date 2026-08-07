import { nodeStateEnum, type NodeState } from "@/db/schema";
import {
  asBoolean,
  asFiniteNumber,
  asKnownStringArray,
  asOneOf,
  asRecord,
} from "@/lib/settings/parse";
import { SETTINGS_VERSION } from "@/lib/settings/scopes";
import { DEFAULT_WEIGHTS, type ChooserWeights } from "./score";
import type { ChooserDateFilter, ChooserSettings, ChooserViewId } from "./types";
import { DATE_FILTERS, defaultSettings } from "./views";

const DATE_FILTER_IDS: readonly ChooserDateFilter[] = DATE_FILTERS.map(
  (entry) => entry.id,
);

/**
 * Reading and writing the Task Chooser's per-view settings blob.
 *
 * This used to live inside `useChooserSettings` alongside the `localStorage` access, which
 * made the one part worth testing — the merge over defaults — reachable only through a
 * React hook. The storage moved to `user_settings`; the parsing moved here.
 */

const ALL_STATES: readonly NodeState[] = nodeStateEnum.enumValues;

/**
 * Merge stored values over the view's defaults, ignoring anything malformed. A weight that
 * arrives as a string, a `NaN`, or a key we have since renamed falls back rather than
 * poisoning the ordering.
 */
export function parseChooserSettings(
  value: unknown,
  viewId: ChooserViewId,
): ChooserSettings {
  const base = defaultSettings(viewId);
  const stored = asRecord(value);
  if (!stored) return base;

  const weights: ChooserWeights = { ...base.weights };
  const storedWeights = asRecord(stored.weights);
  if (storedWeights) {
    for (const key of Object.keys(DEFAULT_WEIGHTS) as (keyof ChooserWeights)[]) {
      weights[key] = asFiniteNumber(storedWeights[key], weights[key]);
    }
  }

  return {
    weights,
    onlyNextAction: asBoolean(stored.onlyNextAction, base.onlyNextAction),
    useTaskPriorityOrder: asBoolean(
      stored.useTaskPriorityOrder,
      base.useTaskPriorityOrder,
    ),
    /**
     * Only states that still exist in the schema, so renaming or dropping one degrades to
     * "that state is not shown" rather than to a filter that silently matches nothing. An
     * explicitly empty list is honoured — "show me nothing" is a legal, if odd, choice, and
     * quietly overriding it would make the checkboxes lie.
     */
    states: asKnownStringArray(stored.states, ALL_STATES, base.states) as NodeState[],
    hidePlanned: asBoolean(stored.hidePlanned, base.hidePlanned),
    /**
     * Membership-checked against the list the dropdown offers, so a band we later rename or
     * drop degrades to "no date filter" rather than to a filter that quietly matches nothing.
     */
    dateFilter: asOneOf(stored.dateFilter, DATE_FILTER_IDS, base.dateFilter),
  };
}

export function serializeChooserSettings(settings: ChooserSettings): unknown {
  return { v: SETTINGS_VERSION, ...settings };
}
