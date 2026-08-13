"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { PriorityLetter } from "@/db/schema";
import { organizeInboxItemAction } from "@/app/organize/actions";
import { requestQuickCapture } from "@/components/capture/event";
import {
  CheckboxField,
  ContextsField,
  DateField,
  EffortField,
  FieldGrid,
  PriorityField,
  TextArea,
  TextField,
} from "@/components/detail/fields";
import {
  ProjectPicker,
  type ProjectPickerValue,
} from "@/components/projects/ProjectPicker";
import { formatBindings, matchBindings } from "@/lib/commands/bindings";
import { COMMIT_FORM } from "@/lib/commands/chords";
import type { OrganizerOutcome } from "@/lib/organizer/types";
import { fromDateKey, shiftDateKey, toDateKey } from "@/lib/schedule/geometry";
import type { OutlineNode } from "@/lib/tree/types";

const PROCESS_CHORD = formatBindings(COMMIT_FORM) ?? "⌘⏎";

type OutcomeKind = OrganizerOutcome["kind"];

const OUTCOMES: {
  kind: OutcomeKind;
  label: string;
  hint: string;
}[] = [
  { kind: "task", label: "Task", hint: "File it as work you can complete." },
  { kind: "project", label: "Project", hint: "Make it a multi-step outcome." },
  { kind: "calendar", label: "Calendar", hint: "Put this leaf directly in time." },
  { kind: "defer", label: "Defer", hint: "Bring it back to Inbox on a later day." },
  { kind: "delete", label: "Delete", hint: "Remove this branch permanently." },
  {
    kind: "reference_note",
    label: "Not actionable",
    hint: "Keep this leaf as reference material.",
  },
];

export function OrganizerView({
  nodes,
  queue,
  today,
  nowIso,
}: {
  nodes: readonly OutlineNode[];
  queue: readonly OutlineNode[];
  today: string;
  nowIso: string;
}) {
  if (queue.length === 0) return <OrganizerEmpty />;
  return (
    <OrganizerItemForm
      key={queue[0].id}
      item={queue[0]}
      total={queue.length}
      nodes={nodes}
      today={today}
      nowIso={nowIso}
    />
  );
}

function OrganizerEmpty() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-surface px-4 py-10 sm:px-6 md:px-8">
      <div className="mx-auto max-w-xl rounded-xl border border-rule bg-surface-raised/45 p-8 text-center shadow-[var(--elev-1)]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-select-edge/50 font-mono text-select-edge">
          ✓
        </div>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-ink">
          Inbox is clear
        </h1>
        <p className="mt-2 text-[0.875rem] leading-6 text-ink-muted">
          Everything currently in Inbox has a decision or is waiting behind a dated
          shelf.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <button
            type="button"
            onClick={requestQuickCapture}
            className="min-h-tap rounded bg-select-edge px-4 text-[0.8125rem] font-medium text-white"
          >
            Quick capture
          </button>
          <Link
            href="/plan/overview"
            className="flex min-h-tap items-center justify-center rounded border border-rule px-4 text-[0.8125rem] text-ink hover:bg-surface-raised"
          >
            Back to Overview
          </Link>
        </div>
      </div>
    </div>
  );
}

function OrganizerItemForm({
  item,
  total,
  nodes,
  today,
  nowIso,
}: {
  item: OutlineNode;
  total: number;
  nodes: readonly OutlineNode[];
  today: string;
  nowIso: string;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<OutcomeKind>("task");
  const [name, setName] = useState(item.name);
  const [priorityLetter, setPriorityLetter] = useState<PriorityLetter | null>(
    item.priorityLetter,
  );
  const [priorityRank, setPriorityRank] = useState(item.priorityRank);
  const [effortMinutes, setEffortMinutes] = useState(item.effortMinutes);
  const [deadline, setDeadline] = useState<Date | null>(item.deadline);
  const [contexts, setContexts] = useState(item.contexts ?? []);
  const [notes, setNotes] = useState(item.notes);
  const [destination, setDestination] = useState<ProjectPickerValue>({ kind: "none" });
  const [createProject, setCreateProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectLetter, setNewProjectLetter] = useState<PriorityLetter | null>(null);
  const [newProjectRank, setNewProjectRank] = useState<number | null>(null);
  const [completed, setCompleted] = useState(false);
  const [deferredUntil, setDeferredUntil] = useState<Date | null>(
    fromDateKey(shiftDateKey(today, 1)),
  );
  const [followUpName, setFollowUpName] = useState("");
  const [referenceTitle, setReferenceTitle] = useState(item.name);
  const [referenceBody, setReferenceBody] = useState(item.notes);
  const [calendarSubject, setCalendarSubject] = useState(item.name);
  const [calendarLocation, setCalendarLocation] = useState("");
  const initialTimes = useMemo(
    () => defaultAppointmentTimes(new Date(nowIso)),
    [nowIso],
  );
  const [calendarStart, setCalendarStart] = useState(initialTimes.start);
  const [calendarEnd, setCalendarEnd] = useState(initialTimes.end);
  const [allDay, setAllDay] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lossyBlocked = item.hasChildren;
  const selectedParentId = destination.kind === "node" ? destination.nodeId : null;

  function buildOutcome(): OrganizerOutcome {
    const priority = { priorityLetter, priorityRank };
    const deadlineKey = deadline ? toDateKey(deadline) : null;
    switch (kind) {
      case "task":
        return {
          kind,
          name,
          ...priority,
          effortMinutes,
          destinationProjectId: selectedParentId,
          deadline: deadlineKey,
          contexts,
          notes,
          completed,
          newProject: createProject
            ? {
                name: newProjectName,
                priorityLetter: newProjectLetter,
                priorityRank: newProjectRank,
              }
            : null,
        };
      case "project":
        return {
          kind,
          name,
          ...priority,
          parentProjectId: selectedParentId,
          deadline: deadlineKey,
          contexts,
          notes,
        };
      case "calendar": {
        const date = calendarStart.slice(0, 10);
        const startAt = allDay ? new Date(`${date}T00:00:00`) : new Date(calendarStart);
        const endAt = allDay
          ? new Date(new Date(`${date}T00:00:00`).setDate(startAt.getDate() + 1))
          : new Date(calendarEnd);
        return {
          kind,
          subject: calendarSubject,
          location: calendarLocation,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          allDay,
          ...priority,
          projectId: selectedParentId,
          contexts,
          notes,
        };
      }
      case "defer":
        return {
          kind,
          deferredUntil: deferredUntil ? toDateKey(deferredUntil) : "",
          deadline: deadlineKey,
          followUpName,
        };
      case "delete":
        return { kind };
      case "reference_note":
        return { kind, title: referenceTitle, body: referenceBody };
    }
  }

  async function process() {
    if (saving) return;
    setSaving(true);
    setError(null);
    let result;
    try {
      result = await organizeInboxItemAction(item.id, buildOutcome());
    } catch {
      setSaving(false);
      setError("Check the visible fields and try again.");
      return;
    }
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!matchBindings(event, COMMIT_FORM)) return;
      event.preventDefault();
      void process();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-surface">
      <main className="mx-auto flex min-h-full max-w-[72rem] flex-col px-4 pb-28 pt-5 sm:px-6 md:px-8 md:pb-24 md:pt-8">
        <header className="flex flex-col gap-3 border-b border-rule pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-ink-faint">
              Item 1 of {total}
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink md:text-2xl">
              {item.name || "Untitled Inbox item"}
            </h1>
            <p className="mt-1 text-[0.8125rem] text-ink-muted">
              Decide what this is. The next Inbox item appears only after this decision
              is saved.
            </p>
          </div>
          {item.hasChildren && (
            <div className="rounded border border-rule bg-surface-raised px-3 py-2 text-[0.75rem] text-ink-muted">
              This branch contains {item.childCount}{" "}
              {item.childCount === 1 ? "subtask" : "subtasks"}.
            </div>
          )}
        </header>

        <section className="mt-5">
          <h2 className="text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-muted">
            What is it?
          </h2>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {OUTCOMES.map((outcome) => {
              const blocked =
                lossyBlocked &&
                (outcome.kind === "calendar" || outcome.kind === "reference_note");
              return (
                <button
                  key={outcome.kind}
                  type="button"
                  disabled={blocked}
                  onClick={() => setKind(outcome.kind)}
                  className={`min-h-tap rounded-lg border p-3 text-left transition-colors ${
                    kind === outcome.kind
                      ? "border-select-edge bg-select/45 shadow-[var(--elev-1)]"
                      : "border-rule bg-surface-raised/35 hover:border-rule-strong hover:bg-surface-raised"
                  } disabled:cursor-not-allowed disabled:opacity-45`}
                >
                  <span className="block text-[0.875rem] font-semibold text-ink">
                    {outcome.label}
                  </span>
                  <span className="mt-0.5 block text-[0.75rem] leading-5 text-ink-muted">
                    {blocked
                      ? "Unavailable while this item has subtasks."
                      : outcome.hint}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-5 rounded-xl border border-rule bg-surface-raised/35 p-4 md:p-5">
          {kind === "task" && (
            <div className="space-y-5">
              <FieldGrid columns={3}>
                <TextField label="Name" value={name} onChange={setName} />
                <PriorityField
                  letter={priorityLetter}
                  rank={priorityRank}
                  onChange={(letter, rank) => {
                    setPriorityLetter(letter);
                    setPriorityRank(rank);
                  }}
                />
                <EffortField
                  label="Effort"
                  value={effortMinutes}
                  onChange={setEffortMinutes}
                />
              </FieldGrid>
              <ProjectDestination
                label={
                  createProject
                    ? "Parent for new project"
                    : "Destination (result area, goal, or project)"
                }
                nodes={nodes}
                value={destination}
                onChange={setDestination}
              />
              <CheckboxField
                label="Create a new project for this task"
                checked={createProject}
                onChange={setCreateProject}
              />
              {createProject && (
                <FieldGrid>
                  <TextField
                    label="New project name"
                    value={newProjectName}
                    onChange={setNewProjectName}
                  />
                  <PriorityField
                    label="Project priority"
                    letter={newProjectLetter}
                    rank={newProjectRank}
                    onChange={(letter, rank) => {
                      setNewProjectLetter(letter);
                      setNewProjectRank(rank);
                    }}
                  />
                </FieldGrid>
              )}
              <FieldGrid>
                <DateField label="Deadline" value={deadline} onChange={setDeadline} />
                <ContextsField value={contexts} onChange={setContexts} />
              </FieldGrid>
              <CheckboxField
                label="Mark completed"
                checked={completed}
                onChange={setCompleted}
              />
              <TextArea
                label="Notes"
                value={notes}
                onChange={setNotes}
                rows={5}
                markdown
              />
            </div>
          )}

          {kind === "project" && (
            <div className="space-y-5">
              <FieldGrid>
                <TextField label="Name" value={name} onChange={setName} />
                <PriorityField
                  letter={priorityLetter}
                  rank={priorityRank}
                  onChange={(letter, rank) => {
                    setPriorityLetter(letter);
                    setPriorityRank(rank);
                  }}
                />
              </FieldGrid>
              <ProjectDestination
                label="Parent (result area, goal, or project)"
                nodes={nodes}
                value={destination}
                onChange={setDestination}
              />
              <FieldGrid>
                <DateField label="Deadline" value={deadline} onChange={setDeadline} />
                <ContextsField value={contexts} onChange={setContexts} />
              </FieldGrid>
              <TextArea
                label="Notes"
                value={notes}
                onChange={setNotes}
                rows={5}
                markdown
              />
            </div>
          )}

          {kind === "calendar" && (
            <div className="space-y-5">
              <FieldGrid>
                <TextField
                  label="Subject"
                  value={calendarSubject}
                  onChange={setCalendarSubject}
                />
                <TextField
                  label="Location"
                  value={calendarLocation}
                  onChange={setCalendarLocation}
                />
              </FieldGrid>
              <CheckboxField label="All day" checked={allDay} onChange={setAllDay} />
              <CalendarTiming
                allDay={allDay}
                start={calendarStart}
                end={calendarEnd}
                onStart={setCalendarStart}
                onEnd={setCalendarEnd}
              />
              <FieldGrid>
                <PriorityField
                  letter={priorityLetter}
                  rank={priorityRank}
                  onChange={(letter, rank) => {
                    setPriorityLetter(letter);
                    setPriorityRank(rank);
                  }}
                />
                <ContextsField value={contexts} onChange={setContexts} />
              </FieldGrid>
              <ProjectDestination
                label="Project"
                nodes={nodes}
                value={destination}
                onChange={setDestination}
              />
              <TextArea
                label="Notes"
                value={notes}
                onChange={setNotes}
                rows={4}
                markdown
              />
            </div>
          )}

          {kind === "defer" && (
            <div className="space-y-5">
              <p className="text-[0.8125rem] leading-6 text-ink-muted">
                The branch stays in Inbox but disappears from the processing queue until
                the return date.
              </p>
              <FieldGrid>
                <DateField
                  label="Return to Inbox"
                  value={deferredUntil}
                  onChange={setDeferredUntil}
                  min={shiftDateKey(today, 1)}
                />
                <DateField label="Deadline" value={deadline} onChange={setDeadline} />
              </FieldGrid>
              <TextField
                label="Follow-up action"
                value={followUpName}
                onChange={setFollowUpName}
                placeholder="Optional subtask to create"
                hint="Created beneath this item and held by the same dated shelf."
              />
            </div>
          )}

          {kind === "delete" && (
            <div className="rounded-lg border border-priority-a/35 bg-priority-a/8 p-4">
              <h2 className="text-[0.875rem] font-semibold text-priority-a">
                Delete this {item.hasChildren ? "branch" : "item"}
              </h2>
              <p className="mt-1 text-[0.8125rem] leading-6 text-ink-muted">
                Pressing Process permanently removes “{item.name || "Untitled item"}”
                {item.hasChildren
                  ? ` and its ${item.childCount} ${item.childCount === 1 ? "subtask" : "subtasks"}.`
                  : "."}
              </p>
            </div>
          )}

          {kind === "reference_note" && (
            <div className="space-y-4">
              <p className="text-[0.8125rem] leading-6 text-ink-muted">
                Store this as a standalone note, then remove the Inbox item.
              </p>
              <TextField
                label="Title"
                value={referenceTitle}
                onChange={setReferenceTitle}
              />
              <TextArea
                label="Notes"
                value={referenceBody}
                onChange={setReferenceBody}
                rows={8}
                markdown
              />
            </div>
          )}
        </section>

        {error && (
          <p className="mt-4 rounded border border-priority-a/35 bg-priority-a/8 px-3 py-2 text-[0.8125rem] text-priority-a">
            {error}
          </p>
        )}
      </main>

      <footer className="pb-safe sticky bottom-0 border-t border-rule bg-shell/95 px-4 py-3 backdrop-blur sm:px-6 md:px-8">
        <div className="mx-auto flex max-w-[72rem] items-center justify-between gap-3">
          <Link
            href="/plan/overview"
            className="flex min-h-tap items-center rounded border border-rule px-4 text-[0.8125rem] text-ink hover:bg-surface-raised md:min-h-0 md:py-2"
          >
            Exit
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-[0.6875rem] text-ink-faint sm:block">
              {PROCESS_CHORD}
            </span>
            <button
              type="button"
              onClick={() => void process()}
              disabled={saving}
              title={PROCESS_CHORD}
              className="min-h-tap rounded bg-select-edge px-5 text-[0.8125rem] font-semibold text-white hover:brightness-95 disabled:opacity-50 md:min-h-0 md:py-2"
            >
              {saving ? "Processing…" : "Process"}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ProjectDestination({
  label,
  nodes,
  value,
  onChange,
}: {
  label: string;
  nodes: readonly OutlineNode[];
  value: ProjectPickerValue;
  onChange: (value: ProjectPickerValue) => void;
}) {
  return (
    <div>
      <h3 className="mb-2 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
        {label}
      </h3>
      <ProjectPicker
        nodes={nodes}
        value={value}
        onChange={onChange}
        allowNone
        listClassName="max-h-64"
      />
    </div>
  );
}

function CalendarTiming({
  allDay,
  start,
  end,
  onStart,
  onEnd,
}: {
  allDay: boolean;
  start: string;
  end: string;
  onStart: (value: string) => void;
  onEnd: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
        {allDay ? "Date" : "Starts"}
        <input
          type={allDay ? "date" : "datetime-local"}
          value={allDay ? start.slice(0, 10) : start}
          onChange={(event) =>
            onStart(allDay ? `${event.target.value}T09:00` : event.target.value)
          }
          className="min-h-tap rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] text-ink outline-none focus:border-select-edge md:min-h-0"
        />
      </label>
      {!allDay && (
        <label className="flex flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
          Ends
          <input
            type="datetime-local"
            value={end}
            onChange={(event) => onEnd(event.target.value)}
            className="min-h-tap rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] text-ink outline-none focus:border-select-edge md:min-h-0"
          />
        </label>
      )}
    </div>
  );
}

function defaultAppointmentTimes(now: Date): { start: string; end: string } {
  const start = new Date(now);
  start.setSeconds(0, 0);
  start.setMinutes(0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);
  return { start: toLocalInputValue(start), end: toLocalInputValue(end) };
}

function toLocalInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
