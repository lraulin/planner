import type { PriorityLetter } from "@/db/schema";

type Priority = {
  priorityLetter: PriorityLetter | null;
  priorityRank: number | null;
};

export type OrganizerOutcome =
  | ({
      kind: "task";
      name: string;
      effortMinutes: number | null;
      destinationProjectId: string | null;
      deadline: string | null;
      contexts: string[];
      notes: string;
      completed: boolean;
      newProject: ({ name: string } & Priority) | null;
    } & Priority)
  | ({
      kind: "project";
      name: string;
      parentProjectId: string | null;
      deadline: string | null;
      contexts: string[];
      notes: string;
    } & Priority)
  | ({
      kind: "calendar";
      subject: string;
      location: string;
      startAt: string;
      endAt: string;
      allDay: boolean;
      projectId: string | null;
      contexts: string[];
      notes: string;
    } & Priority)
  | {
      kind: "defer";
      deferredUntil: string;
      deadline: string | null;
      followUpName: string;
    }
  | { kind: "delete" }
  | { kind: "reference_note"; title: string; body: string };

export function organizerOutcomeError(
  outcome: OrganizerOutcome,
  options: { today: string; hasChildren: boolean },
): string | null {
  if (
    options.hasChildren &&
    (outcome.kind === "calendar" || outcome.kind === "reference_note")
  ) {
    return "Move, convert, or delete the subtasks before replacing this branch.";
  }

  if (outcome.kind === "defer") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(outcome.deferredUntil)) {
      return "Choose a return date.";
    }
    if (outcome.deferredUntil <= options.today) {
      return "The return date must be later than today.";
    }
  }

  if (outcome.kind === "calendar") {
    const startAt = new Date(outcome.startAt);
    const endAt = new Date(outcome.endAt);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      return "Choose a valid start and end time.";
    }
    if (endAt <= startAt) return "End time must be after start time.";
  }

  if (outcome.kind === "task") {
    if (outcome.effortMinutes !== null && outcome.effortMinutes < 0) {
      return "Effort cannot be negative.";
    }
    if (outcome.newProject && !outcome.newProject.name.trim()) {
      return "Name the new project for this task.";
    }
  }

  return null;
}
