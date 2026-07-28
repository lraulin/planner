"use client";

import { useEffect, useState } from "react";
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
import { FieldGrid, Section, TextField, TextArea, CheckboxField } from "@/components/detail/fields";
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

export function AppointmentDrawer({
  open,
  value,
  nodes,
  onClose,
  onSaved,
  onDelete,
}: Props) {
  const [subject, setSubject] = useState("");
  const [location, setLocation] = useState("");
  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [checkState, setCheckState] = useState<AppointmentCheck>("open");
  const [reminderMinutes, setReminderMinutes] = useState<string>("");
  const [showAs, setShowAs] = useState<ShowAs>("busy");
  const [projectId, setProjectId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [contexts, setContexts] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] =
    useState<RecurrenceFrequency>("none");
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [recurrenceByWeekday, setRecurrenceByWeekday] = useState<number[]>([]);
  const [recurrenceEnd, setRecurrenceEnd] = useState<RecurrenceEnd>("never");
  const [recurrenceCount, setRecurrenceCount] = useState(10);
  const [recurrenceUntil, setRecurrenceUntil] = useState("");
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const id = value && "id" in value ? value.id : undefined;

  useEffect(() => {
    if (!value) return;
    setSubject(value.subject ?? "");
    setStartLocal(toLocalInputValue(new Date(value.startAt)));
    setEndLocal(toLocalInputValue(new Date(value.endAt)));
    setProjectId(value.projectId ?? "");
    if (isFullAppointment(value)) {
      setLocation(value.location);
      setAllDay(value.allDay);
      setCheckState(value.checkState);
      setReminderMinutes(
        value.reminderMinutes != null ? String(value.reminderMinutes) : "",
      );
      setShowAs(value.showAs);
      setNotes(value.notes);
      setContexts(value.contexts.join(", "));
      setIsPrivate(value.private);
      setRecurrenceFrequency(value.recurrenceFrequency);
      setRecurrenceInterval(value.recurrenceInterval);
      setRecurrenceByWeekday(value.recurrenceByWeekday ?? []);
      setRecurrenceEnd(value.recurrenceEnd);
      setRecurrenceCount(value.recurrenceCount ?? 10);
      setRecurrenceUntil(
        value.recurrenceUntil
          ? value.recurrenceUntil.toISOString().slice(0, 10)
          : "",
      );
    } else {
      setLocation("");
      setAllDay(false);
      setCheckState("open");
      setReminderMinutes("");
      setShowAs("busy");
      setNotes("");
      setContexts("");
      setIsPrivate(false);
      setRecurrenceFrequency("none");
      setRecurrenceInterval(1);
      setRecurrenceByWeekday([]);
      setRecurrenceEnd("never");
      setRecurrenceCount(10);
      setRecurrenceUntil("");
    }
    setDirty(false);
    setError(null);
  }, [value]);

  const projects = nodes.filter((n) => n.type === "project" && !n.hidden);

  function mark<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setDirty(true);
    };
  }

  function requestClose() {
    if (dirty) setConfirmClose(true);
    else onClose();
  }

  async function save() {
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

    const result = id
      ? await updateAppointmentAction(id, payload)
      : await createAppointmentAction(payload);

    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDirty(false);
    onSaved();
  }

  function toggleWeekday(d: number) {
    setDirty(true);
    setRecurrenceByWeekday((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b),
    );
  }

  return (
    <>
      <Drawer open={open} onClose={requestClose} labelledBy="appointment-title">
        {open && value && (
          <div className="flex h-full flex-col">
            <header className="flex items-center justify-between border-b border-rule px-4 py-3">
              <h2 id="appointment-title" className="text-[0.9375rem] font-semibold text-ink">
                {id ? "Appointment" : "New Appointment"}
              </h2>
              <div className="flex gap-2">
                {id && (
                  <button
                    type="button"
                    className="rounded border border-rule px-2 py-1 text-[0.8125rem] text-priority-a hover:bg-surface-raised"
                    onClick={() => {
                      if (window.confirm("Delete this appointment?")) onDelete(id);
                    }}
                  >
                    Delete
                  </button>
                )}
                <button
                  type="button"
                  className="rounded border border-rule px-2 py-1 text-[0.8125rem] text-ink hover:bg-surface-raised"
                  onClick={requestClose}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  className="rounded bg-select-edge px-3 py-1 text-[0.8125rem] font-medium text-white disabled:opacity-50"
                  onClick={save}
                >
                  {saving ? "Saving…" : "Save"}
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
                        setDirty(true);
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
                        setDirty(true);
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
                        setDirty(true);
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
                        setDirty(true);
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
                        setDirty(true);
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
                      setDirty(true);
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
                  <TextArea label="Notes" value={notes} onChange={mark(setNotes)} rows={4} />
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
                        setDirty(true);
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
                          setDirty(true);
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
                          setDirty(true);
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
                          setDirty(true);
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
                          setDirty(true);
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
                          setDirty(true);
                        }}
                      />
                      End by
                      <input
                        type="date"
                        className="rounded border border-rule px-1 py-0.5"
                        value={recurrenceUntil}
                        onChange={(e) => {
                          setRecurrenceUntil(e.target.value);
                          setDirty(true);
                        }}
                      />
                    </label>
                  </div>
                )}
              </Section>
            </div>
          </div>
        )}
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
