"use client";

import { useCallback, useState } from "react";
import type { Appointment, WeeklyPlan } from "@/db/schema";
import type { OutlineNode } from "@/lib/tree/types";
import type { SchedulePayload } from "@/lib/schedule/queries";
import type { Occurrence } from "@/lib/schedule/recurrence";
import type { WeeklyPlanPatch } from "@/lib/planning/mutations";
import { fromDateKey } from "@/lib/schedule/geometry";
import { weekRange } from "@/lib/schedule/range";
import { asyncHandler } from "@/lib/eventHandler";
import {
  createTimeChartAction,
  deleteAppointmentAction,
  rescheduleAppointmentAction,
  setAppointmentCheckStateAction,
  duplicateAppointmentAction,
} from "@/app/schedule/actions";
import type { AppointmentCheck } from "@/db/schema";
import { WeekCalendar } from "@/components/schedule/WeekCalendar";
import { AppointmentDrawer } from "@/components/schedule/AppointmentDrawer";
import type { DraftAppointment } from "@/components/schedule/ScheduleView";

type Props = {
  plan: WeeklyPlan;
  schedule: SchedulePayload;
  nodes: OutlineNode[];
  weekKey: string;
  onPatchPlan: (patch: WeeklyPlanPatch) => Promise<void>;
  onScheduleChange: () => void;
  onError: (message: string) => void;
};

function hydrate(schedule: SchedulePayload) {
  return {
    charts: schedule.charts,
    selectedChartId: schedule.selectedChartId,
    backgroundEvents: schedule.backgroundEvents.map((e) => ({
      ...e,
      start: new Date(e.start),
      end: new Date(e.end),
    })),
    occurrences: schedule.occurrences.map((o) => ({
      ...o,
      startAt: new Date(o.startAt),
      endAt: new Date(o.endAt),
    })),
    masters: schedule.appointments.map((a) => ({
      ...a,
      startAt: new Date(a.startAt),
      endAt: new Date(a.endAt),
      recurrenceUntil: a.recurrenceUntil ? new Date(a.recurrenceUntil) : null,
      createdAt: new Date(a.createdAt),
      updatedAt: new Date(a.updatedAt),
    })),
  };
}

/**
 * Step 3 — pick the week's Time Chart and block off fixed commitments on the grid.
 * Reuses the same calendar + drawer as the Weekly Schedule so the interaction is identical.
 */
export function FixedTimeStep({
  plan,
  schedule,
  nodes,
  weekKey,
  onPatchPlan,
  onScheduleChange,
  onError,
}: Props) {
  // The wizard is always about one whole week, whatever width the calendar tab is on.
  const week = weekRange(fromDateKey(weekKey));
  const hydrated = hydrate(schedule);
  const [occurrences, setOccurrences] = useState(hydrated.occurrences);
  const [masters, setMasters] = useState(hydrated.masters);
  const [backgroundEvents] = useState(hydrated.backgroundEvents);
  const [editing, setEditing] = useState<Appointment | DraftAppointment | null>(null);

  const [prevSchedule, setPrevSchedule] = useState(schedule);
  if (schedule !== prevSchedule) {
    setPrevSchedule(schedule);
    const next = hydrate(schedule);
    setOccurrences(next.occurrences);
    setMasters(next.masters);
  }

  const selectedChartId = plan.timeChartId ?? hydrated.selectedChartId;

  async function selectChart(id: string) {
    await onPatchPlan({ timeChartId: id || null });
    onScheduleChange();
  }

  async function handleNewChart() {
    const name = window.prompt("Time Chart name", "New Time Chart");
    if (name == null) return;
    const result = await createTimeChartAction(name);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    if (result.id) await selectChart(result.id);
    onScheduleChange();
  }

  function handleCreateRange(start: Date, end: Date) {
    setEditing({ subject: "", startAt: start, endAt: end });
  }

  const handleCycleCheck = useCallback(
    async (id: string, next: AppointmentCheck) => {
      setOccurrences((prev) =>
        prev.map((o) => (o.id === id ? { ...o, checkState: next } : o)),
      );
      const result = await setAppointmentCheckStateAction(id, next);
      if (!result.ok) {
        onError(result.error);
        onScheduleChange();
        return;
      }
      onScheduleChange();
    },
    [onError, onScheduleChange],
  );

  async function handleEventDrop(
    id: string,
    start: Date,
    end: Date,
    opts: { duplicate: boolean },
  ) {
    if (opts.duplicate) {
      const result = await duplicateAppointmentAction(
        id,
        start.toISOString(),
        end.toISOString(),
      );
      if (!result.ok) {
        onError(result.error);
        return;
      }
    } else {
      const result = await rescheduleAppointmentAction(
        id,
        start.toISOString(),
        end.toISOString(),
        true,
      );
      if (!result.ok) {
        onError(result.error);
        return;
      }
    }
    onScheduleChange();
  }

  function openOccurrence(occ: Occurrence) {
    const master = masters.find((m) => m.id === occ.id);
    if (master) setEditing(master);
    else {
      setEditing({
        id: occ.id,
        subject: occ.subject,
        startAt: occ.startAt,
        endAt: occ.endAt,
        projectId: occ.projectId,
      });
    }
  }

  async function handleDelete(id: string) {
    const result = await deleteAppointmentAction(id);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    setEditing(null);
    onScheduleChange();
  }

  return (
    <div className="flex h-full min-h-[28rem] flex-col">
      <div className="flex flex-none flex-wrap items-center gap-2 border-b border-rule px-3 py-2 text-[0.8125rem]">
        <label className="flex items-center gap-1.5 text-ink-muted">
          Time Chart:
          <select
            className="rounded border border-rule bg-surface px-2 py-1 text-ink"
            value={selectedChartId ?? ""}
            onChange={(e) => void selectChart(e.target.value)}
          >
            <option value="">(none)</option>
            {hydrated.charts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || "Untitled"}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="rounded border border-rule bg-surface px-2 py-1 text-ink hover:bg-surface-raised"
          onClick={asyncHandler(handleNewChart, onError)}
        >
          New…
        </button>
      </div>

      <div className="min-h-0 flex-1">
        <WeekCalendar
          days={week.days}
          rangeStart={week.start}
          rangeEnd={week.end}
          backgroundEvents={backgroundEvents}
          occurrences={occurrences}
          onSelectRange={handleCreateRange}
          onEventClick={openOccurrence}
          onEventDrop={asyncHandler(handleEventDrop, onError)}
          onExternalDrop={() => undefined}
          onCycleCheck={asyncHandler(handleCycleCheck, onError)}
        />
      </div>

      <AppointmentDrawer
        open={editing != null}
        value={editing}
        nodes={nodes}
        onClose={() => setEditing(null)}
        onSaved={() => {
          onScheduleChange();
        }}
        onDelete={asyncHandler(handleDelete, onError)}
      />
    </div>
  );
}
