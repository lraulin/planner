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
    dateCompleted: null,
    createdAt: new Date("2026-01-01T12:00:00.000Z"),
    updatedAt: new Date("2026-01-01T12:00:00.000Z"),
    depth: 0,
    effortMinutes: null,
    effortLeftMinutes: null,
    actualEffortMinutes: 0,
    percentComplete: 0,
    contexts: [],
    actualStartDate: null,
    description: "",
    effortDriven: null,
    leadTimeMinutes: null,
    deadlineLeadTimeMinutes: null,
    place: "",
    expectedCost: null,
    costLow: null,
    costHigh: null,
    costToDate: null,
    color: null,
    category: null,
    importance: null,
    targetStart: null,
    targetEnd: null,
    deferredDate: null,
    recurrenceFrequency: "none",
    purpose: "",
    assignedTo: "",
    definition: "",
    range: "",
    isDream: false,
    contactId: null,
    ...partial,
  };
}
