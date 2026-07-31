import type { OutlineRow } from "./types";

/**
 * Test-only row builder, shared by the `derive` and `slice` suites so widening
 * `OutlineRow` is a one-file change rather than one per suite.
 *
 * Everything defaults to empty; a test names only the fields it is about.
 */

let counter = 0;

export function row(
  partial: Partial<OutlineRow> & Pick<OutlineRow, "id" | "type">,
): OutlineRow {
  return {
    parentId: null,
    name: `node-${counter++}`,
    sortKey: "V",
    priorityLetter: null,
    priorityRank: null,
    tcPriorityLetter: null,
    tcPriorityRank: null,
    state: "not_started",
    deadline: null,
    focus: false,
    collapsed: false,
    notes: "",
    isInbox: false,
    completedAt: null,
    depth: 0,
    effortMinutes: null,
    effortLeftMinutes: null,
    actualEffortMinutes: 0,
    percentComplete: 0,
    contexts: [],
    color: null,
    category: null,
    importance: null,
    targetStart: null,
    targetEnd: null,
    deferredDate: null,
    recurrenceFrequency: "none",
    recurrenceInterval: 1,
    purpose: "",
    assignedTo: "",
    definition: "",
    range: "",
    isDream: false,
    ...partial,
  };
}
