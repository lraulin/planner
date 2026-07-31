"use client";

import { useEffect, useRef, useState } from "react";
import type {
  Appointment,
  AppointmentCheck,
  RecurrenceEnd,
  RecurrenceFrequency,
  ShowAs,
} from "@/db/schema";
import type { OutlineNode } from "@/lib/tree/types";
import { Drawer } from "@/components/detail/Drawer";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import {
  FieldGrid,
  Section,
  TextField,
  TextArea,
  CheckboxField,
} from "@/components/detail/fields";
import {
  createAppointmentAction,
  updateAppointmentAction,
  type AppointmentFormPayload,
} from "@/app/schedule/actions";
import { WEEKDAY_LABELS } from "@/lib/schedule/geometry";
import {
  checkStateLabel,
  checkStateMark,
  nextCheckState,
} from "@/lib/schedule/checkState";
import type { DraftAppointment } from "./ScheduleView";

type Props = {
  open: boolean;
  value: Appointment | DraftAppointment | null;
  nodes: OutlineNode[];
  onClose: () => void;
  /**
   * Refresh background schedule data after a successful write. Does **not** close the
   * drawer — Save stays open (`drawer-pattern.md`).
   */
  onSaved: () => void;
  onDelete: (id: string) => void;
};

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isFullAppointment(v: Appointment | DraftAppointment): v is Appointment {
  return "location" in v && "showAs" in v && "checkState" in v;
}

function formKey(value: Appointment | DraftAppointment): string {
  if ("id" in value && value.id) return value.id;
  return `draft-${new Date(value.startAt).toISOString()}-${new Date(value.endAt).toISOString()}`;
}

/**
 * Outer shell remounts the form when the edited appointment changes (via `key`),
 * so field state is initialized from props without a syncing effect.
 */
export function AppointmentDrawer({
  open,
  value,
  nodes,
  onClose,
  onSaved,
  onDelete,
}: Props) {
  if (!open || !value) {
    return (
      <Drawer open={false} onClose={onClose} labelledBy="appointment-title">
        {null}
      </Drawer>
    );
  }

  return (
    <AppointmentForm
      key={formKey(value)}
      value={value}
      nodes={nodes}
      onClose={onClose}
      onSaved={onSaved}
      onDelete={onDelete}
    />
  );
}

type FormProps = {
  value: Appointment | DraftAppointment;
  nodes: OutlineNode[];
  onClose: () => void;
  onSaved: () => void;
  onDelete: (id: string) => void;
};

function AppointmentForm({ value, nodes, onClose, onSaved, onDelete }: FormProps) {
  const full = isFullAppointment(value);
  // After the first successful create, subsequent Saves update rather than re-create.
  const [persistedId, setPersistedId] = useState<string | undefined>(
    "id" in value ? value.id : undefined,
  );

  const [subject, setSubject] = useState(value.subject ?? "");
  const [location, setLocation] = useState(full ? value.location : "");
  const [startLocal, setStartLocal] = useState(
    toLocalInputValue(new Date(value.startAt)),
  );
  const [endLocal, setEndLocal] = useState(toLocalInputValue(new Date(value.endAt)));
  const [allDay, setAllDay] = useState(full ? value.allDay : false);
  const [checkState, setCheckState] = useState<AppointmentCheck>(
    full ? value.checkState : "open",
  );
  const [reminderMinutes, setReminderMinutes] = useState(
    full && value.reminderMinutes != null ? String(value.reminderMinutes) : "",
  );
  const [showAs, setShowAs] = useState<ShowAs>(full ? value.showAs : "busy");
  const [projectId, setProjectId] = useState(value.projectId ?? "");
  const [notes, setNotes] = useState(full ? value.notes : "");
  const [contexts, setContexts] = useState(full ? value.contexts.join(", ") : "");
  const [isPrivate, setIsPrivate] = useState(full ? value.private : false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<RecurrenceFrequency>(
    full ? value.recurrenceFrequency : "none",
  );
  const [recurrenceInterval, setRecurrenceInterval] = useState(
    full ? value.recurrenceInterval : 1,
  );
  const [recurrenceByWeekday, setRecurrenceByWeekday] = useState<number[]>(
    full ? (value.recurrenceByWeekday ?? []) : [],
  );
  const [recurrenceEnd, setRecurrenceEnd] = useState<RecurrenceEnd>(
    full ? value.recurrenceEnd : "never",
  );
  const [recurrenceCount, setRecurrenceCount] = useState(
    full ? (value.recurrenceCount ?? 10) : 10,
  );
  const [recurrenceUntil, setRecurrenceUntil] = useState(
    full && value.recurrenceUntil
      ? value.recurrenceUntil.toISOString().slice(0, 10)
      : "",
  );
  const [dirty, setDirty] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const projects = nodes.filter((n) => n.type === "project" && !n.hidden);

  function markDirty() {
    setDirty(true);
    setJustSaved(false);
  }

  function mark<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      markDirty();
    };
  }

  function requestClose() {
    if (dirty) setConfirmClose(true);
    else onClose();
  }

  async function save(options?: { close?: boolean }) {
    setSaving(true);
    setError(null);
    const startAt = new Date(startLocal);
    const endAt = new Date(endLocal);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      setError("Start and end times must be valid.");
      setSaving(false);
      return;
    }

    const payload: AppointmentFormPayload = {
      subject,
      location,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      allDay,
      checkState,
      reminderMinutes: reminderMinutes === "" ? null : Number(reminderMinutes),
      showAs,
      projectId: projectId || null,
      notes,
      contexts: contexts
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      private: isPrivate,
      recurrenceFrequency,
      recurrenceInterval,
      recurrenceByWeekday:
        recurrenceFrequency === "weekly" ? recurrenceByWeekday : null,
      recurrenceEnd,
      recurrenceCount: recurrenceEnd === "count" ? recurrenceCount : null,
      recurrenceUntil:
        recurrenceEnd === "until" && recurrenceUntil
          ? new Date(recurrenceUntil + "T23:59:59").toISOString()
          : null,
    };

    let result;
    try {
      result = persistedId
        ? await updateAppointmentAction(persistedId, payload)
        : await createAppointmentAction(payload);
    } catch {
      // Without this the button stays on "Saving…" forever when the action rejects.
      setSaving(false);
      setError("Could not reach the server. Try again.");
      return;
    }

    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (!persistedId && result.id) setPersistedId(result.id);
    setDirty(false);
    setJustSaved(true);
    // Refresh the grid/calendar behind the drawer. Close only when asked — Save stays
    // open by default (`drawer-pattern.md`).
    onSaved();
    if (options?.close) onClose();
  }

  // Always call the latest save (form state changes every keystroke); do not re-bind the
  // listener for each field edit.
  const saveRef = useRef(save);
  const savingRef = useRef(saving);
  useEffect(() => {
    saveRef.current = save;
    savingRef.current = saving;
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
      const target = event.target;
      if (
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      if (!savingRef.current) void saveRef.current({ close: true });
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);

  function toggleWeekday(d: number) {
    markDirty();
    setRecurrenceByWeekday((prev) =>
      prev.includes(d)
        ? prev.filter((x) => x !== d)
        : [...prev, d].sort((a, b) => a - b),
    );
  }

  const status = dirty ? "Unsaved changes" : justSaved && !saving ? "Saved" : null;

  return (
    <>
      <Drawer open onClose={requestClose} labelledBy="appointment-title">
        <div className="flex h-full flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-rule px-4 py-3">
            <div className="min-w-0">
              <h2
                id="appointment-title"
                className="text-[0.9375rem] font-semibold text-ink"
              >
                {persistedId ? "Appointment" : "New Appointment"}
              </h2>
              {status && <p className="text-[0.75rem] text-ink-muted">{status}</p>}
            </div>
            <div className="flex flex-none flex-wrap gap-2">
              {persistedId && (
                <button
                  type="button"
                  className="rounded border border-rule px-2 py-1 text-[0.8125rem] text-priority-a hover:bg-surface-raised"
                  onClick={() => {
                    if (window.confirm("Delete this appointment?")) {
                      onDelete(persistedId);
                    }
                  }}
                >
                  Delete
                </button>
              )}
              <button
                type="button"
                disabled={saving}
                className="rounded bg-select-edge px-3 py-1 text-[0.8125rem] font-medium text-white disabled:opacity-50"
                onClick={() => void save()}
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                disabled={saving}
                title="⌘/Ctrl+Enter"
                className="rounded border border-rule px-2 py-1 text-[0.8125rem] text-ink hover:bg-surface-raised disabled:opacity-50"
                onClick={() => void save({ close: true })}
              >
                Save & close
              </button>
              <button
                type="button"
                className="rounded border border-rule px-2 py-1 text-[0.8125rem] text-ink hover:bg-surface-raised"
                onClick={requestClose}
              >
                Close
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {error && (
              <p className="rounded border border-priority-a/40 bg-priority-a/10 px-2 py-1.5 text-[0.8125rem] text-priority-a">
                {error}
              </p>
            )}

            <Section title="General">
              <div className="space-y-3">
                <TextField
                  label="Subject"
                  value={subject}
                  onChange={mark(setSubject)}
                />
                <TextField
                  label="Location"
                  value={location}
                  onChange={mark(setLocation)}
                />
              </div>
              <FieldGrid>
                <label className="flex flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
                  Start
                  <input
                    type="datetime-local"
                    className="rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] font-normal normal-case tracking-normal text-ink"
                    value={startLocal}
                    onChange={(e) => {
                      setStartLocal(e.target.value);
                      markDirty();
                    }}
                  />
                </label>
                <label className="flex flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
                  End
                  <input
                    type="datetime-local"
                    className="rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] font-normal normal-case tracking-normal text-ink"
                    value={endLocal}
                    onChange={(e) => {
                      setEndLocal(e.target.value);
                      markDirty();
                    }}
                  />
                </label>
              </FieldGrid>
              <div className="mt-2 flex flex-wrap items-center gap-4">
                <CheckboxField
                  label="All day"
                  checked={allDay}
                  onChange={mark(setAllDay)}
                />
                <label className="flex items-center gap-2 text-[0.875rem] text-ink">
                  <button
                    type="button"
                    title={`Status: ${checkStateLabel(checkState)} (click to cycle)`}
                    aria-label={`Status: ${checkStateLabel(checkState)}. Click to cycle open, done, missed.`}
                    className="inline-flex h-5 w-5 items-center justify-center rounded border border-rule bg-surface text-[0.75rem] font-semibold leading-none text-ink hover:border-select-edge"
                    onClick={() => {
                      setCheckState(nextCheckState(checkState));
                      markDirty();
                    }}
                  >
                    {checkStateMark(checkState)}
                  </button>
                  <span>
                    {checkStateLabel(checkState)}
                    <span className="ml-1 text-[0.75rem] text-ink-faint">
                      (open → done → missed)
                    </span>
                  </span>
                </label>
                <CheckboxField
                  label="Private"
                  checked={isPrivate}
                  onChange={mark(setIsPrivate)}
                />
              </div>
              <FieldGrid>
                <label className="flex flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
                  Reminder (minutes before)
                  <input
                    type="number"
                    min={0}
                    className="rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] font-normal normal-case tracking-normal text-ink"
                    value={reminderMinutes}
                    placeholder="None"
                    onChange={(e) => {
                      setReminderMinutes(e.target.value);
                      markDirty();
                    }}
                  />
                </label>
                <label className="flex flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
                  Show time as
                  <select
                    className="rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] font-normal normal-case tracking-normal text-ink"
                    value={showAs}
                    onChange={(e) => {
                      setShowAs(e.target.value as ShowAs);
                      markDirty();
                    }}
                  >
                    <option value="busy">Busy</option>
                    <option value="free">Free</option>
                    <option value="tentative">Tentative</option>
                    <option value="out_of_office">Out of office</option>
                  </select>
                </label>
              </FieldGrid>
              <label className="mt-2 flex flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
                Project
                <select
                  className="rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] font-normal normal-case tracking-normal text-ink"
                  value={projectId}
                  onChange={(e) => {
                    setProjectId(e.target.value);
                    markDirty();
                  }}
                >
                  <option value="">(None)</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || "Untitled"}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-2">
                <TextField
                  label="Contexts (comma-separated)"
                  value={contexts}
                  onChange={mark(setContexts)}
                />
              </div>
              <div className="mt-2">
                <TextArea
                  label="Notes"
                  value={notes}
                  onChange={mark(setNotes)}
                  rows={4}
                  markdown
                />
              </div>
            </Section>

            <Section title="Recurrence">
              <FieldGrid>
                <label className="flex flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
                  Pattern
                  <select
                    className="rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] font-normal normal-case tracking-normal text-ink"
                    value={recurrenceFrequency}
                    onChange={(e) => {
                      setRecurrenceFrequency(e.target.value as RecurrenceFrequency);
                      markDirty();
                    }}
                  >
                    <option value="none">None</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </label>
                {recurrenceFrequency !== "none" && (
                  <label className="flex flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
                    Every
                    <input
                      type="number"
                      min={1}
                      className="rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] font-normal normal-case tracking-normal text-ink"
                      value={recurrenceInterval}
                      onChange={(e) => {
                        setRecurrenceInterval(Math.max(1, Number(e.target.value) || 1));
                        markDirty();
                      }}
                    />
                  </label>
                )}
              </FieldGrid>

              {recurrenceFrequency === "weekly" && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {WEEKDAY_LABELS.map((label, d) => (
                    <label
                      key={label}
                      className="flex items-center gap-1 text-[0.8125rem] font-normal normal-case tracking-normal text-ink"
                    >
                      <input
                        type="checkbox"
                        checked={recurrenceByWeekday.includes(d)}
                        onChange={() => toggleWeekday(d)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              )}

              {recurrenceFrequency !== "none" && (
                <div className="mt-3 space-y-2 text-[0.8125rem] text-ink">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="rec-end"
                      checked={recurrenceEnd === "never"}
                      onChange={() => {
                        setRecurrenceEnd("never");
                        markDirty();
                      }}
                    />
                    No end date
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="rec-end"
                      checked={recurrenceEnd === "count"}
                      onChange={() => {
                        setRecurrenceEnd("count");
                        markDirty();
                      }}
                    />
                    End after
                    <input
                      type="number"
                      min={1}
                      className="w-16 rounded border border-rule px-1 py-0.5"
                      value={recurrenceCount}
                      onChange={(e) => {
                        setRecurrenceCount(Math.max(1, Number(e.target.value) || 1));
                        markDirty();
                      }}
                    />
                    occurrences
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="rec-end"
                      checked={recurrenceEnd === "until"}
                      onChange={() => {
                        setRecurrenceEnd("until");
                        markDirty();
                      }}
                    />
                    End by
                    <input
                      type="date"
                      className="rounded border border-rule px-1 py-0.5"
                      value={recurrenceUntil}
                      onChange={(e) => {
                        setRecurrenceUntil(e.target.value);
                        markDirty();
                      }}
                    />
                  </label>
                </div>
              )}
            </Section>
          </div>
        </div>
      </Drawer>

      <ConfirmDialog
        open={confirmClose}
        title="Discard changes?"
        message="You have unsaved changes. Close without saving?"
        confirmLabel="Discard"
        destructive
        onConfirm={() => {
          setConfirmClose(false);
          setDirty(false);
          onClose();
        }}
        onCancel={() => setConfirmClose(false)}
      />
    </>
  );
}
