import type { OutlineNode } from "@/lib/tree/types";
import type { PlanEntryPatch } from "@/lib/planning/mutations";
import type { ResultAreaReview } from "@/lib/planning/queries";

/** What one plan has decided about one node, as the wizard holds it in memory. */
export type EntryValue = {
  focus: boolean;
  reviewed: boolean;
  rewrite: string;
  committedMinutes: number | null;
};

export const EMPTY_ENTRY: EntryValue = {
  focus: false,
  reviewed: false,
  rewrite: "",
  committedMinutes: null,
};

/**
 * What every step needs from the wizard shell. Steps do not talk to the server directly;
 * they call `patchEntry`, which updates local state first so a checkbox never lags behind
 * the click that set it.
 */
export type StepContext = {
  planId: string;
  nodes: OutlineNode[];
  entries: Map<string, EntryValue>;
  entryFor: (nodeId: string) => EntryValue;
  patchEntry: (nodeId: string, patch: PlanEntryPatch) => void;
  resultAreaReviews: Map<string, ResultAreaReview>;
  previousRewrites: Map<string, { rewrite: string; weekStart: string }>;
  onError: (message: string) => void;
};

export const STEP_LABELS = [
  "Select Week",
  "Result Areas",
  "Dreams & Goals",
  "Fixed Time",
  "Time Budget",
  "Schedule Blocks",
] as const;

export const STEP_HINTS = [
  "Choose the week to plan and how deep a review to run.",
  "Review each Result Area's mission and guiding principles, and decide which are this week's focus.",
  "Reread your dreams and top goals, and restate each one in your own words.",
  "Pick the week's Time Chart and block off meetings and other fixed commitments.",
  "Decide how much of the week each project gets. Committed time cannot exceed what you have.",
  "Drag each project onto the week until its committed time is scheduled.",
] as const;
