/**
 * Which schedules should become templates on a target envelope.
 *
 * Re-runnable: skip completed, skip anything already attached to any envelope, skip ids
 * not in the optional picker set. Does not Apply — it only decides which schedule-template
 * lines to write.
 *
 * Spec: `agent-os/specs/2026-08-22-2242-budget-goal-templates/` D3.
 */

import { newTemplateId, type ScheduleTemplate, type Template } from "./types";

export type ScheduleCandidate = {
  id: string;
  name: string;
  completed: boolean;
};

export type EnvelopeTemplates = {
  categoryId: string;
  name: string;
  isIncome: boolean;
  templates: readonly Template[];
};

export function attachedScheduleIds(
  envelopes: readonly EnvelopeTemplates[],
): Set<string> {
  const attached = new Set<string>();
  for (const envelope of envelopes) {
    for (const template of envelope.templates) {
      if (template.type === "schedule") attached.add(template.scheduleId);
    }
  }
  return attached;
}

/** Default target: a spending envelope named Bills, else the first spending envelope. */
export function defaultScheduleTarget(
  envelopes: readonly EnvelopeTemplates[],
): string | null {
  const spending = envelopes.filter((envelope) => !envelope.isIncome);
  const bills = spending.find((envelope) => envelope.name.toLowerCase() === "bills");
  return bills?.categoryId ?? spending[0]?.categoryId ?? null;
}

export function schedulesToAdd(params: {
  existing: readonly EnvelopeTemplates[];
  candidates: readonly ScheduleCandidate[];
  targetId: string;
  scheduleIds?: readonly string[];
}): ScheduleTemplate[] {
  const attached = attachedScheduleIds(params.existing);
  const picked = params.scheduleIds === undefined ? null : new Set(params.scheduleIds);

  const lines: ScheduleTemplate[] = [];
  for (const candidate of params.candidates) {
    if (candidate.completed) continue;
    if (attached.has(candidate.id)) continue;
    if (picked && !picked.has(candidate.id)) continue;
    lines.push({
      id: newTemplateId(),
      directive: "template",
      type: "schedule",
      priority: 0,
      scheduleId: candidate.id,
    });
  }
  return lines;
}
