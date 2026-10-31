"use client";

import { useCallback, useState } from "react";
import type { Appointment, AppointmentCheck } from "@/db/schema";
import type { SchedulePayload } from "@/lib/schedule/queries";
import type { Occurrence } from "@/lib/schedule/recurrence";
import { fromDateKey } from "@/lib/schedule/geometry";
import { weekRange } from "@/lib/schedule/range";
import {
  deleteAppointmentAction,
  setAppointmentCheckStateAction,
} from "@/app/(shell)/schedule/actions";
import type { DraftAppointment } from "@/components/schedule/ScheduleView";
import {
  dropAppointment,
  hydrateSchedule,
} from "@/components/schedule/schedulePayload";

/**
 * The week calendar a Weekly Planning step draws — Fixed Time and Schedule Blocks: one
 * whole week, its occurrences re-read whenever the schedule reloads, and the same
 * open / drop / check / delete behaviour as the Weekly Schedule.
 */
export function useStepCalendar({
  schedule,
  weekKey,
  onScheduleChange,
  onError,
}: {
  schedule: SchedulePayload;
  weekKey: string;
  onScheduleChange: () => void;
  onError: (message: string) => void;
}) {
  // The wizard is always about one whole week, whatever width the calendar tab is on.
  const week = weekRange(fromDateKey(weekKey));
  const hydrated = hydrateSchedule(schedule);
  const [occurrences, setOccurrences] = useState(hydrated.occurrences);
  const [masters, setMasters] = useState(hydrated.masters);
  const [backgroundEvents] = useState(hydrated.backgroundEvents);
  const [editing, setEditing] = useState<Appointment | DraftAppointment | null>(null);

  const [prevSchedule, setPrevSchedule] = useState(schedule);
  if (schedule !== prevSchedule) {
    setPrevSchedule(schedule);
    const next = hydrateSchedule(schedule);
    setOccurrences(next.occurrences);
    setMasters(next.masters);
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
    const result = await dropAppointment(id, start, end, opts);
    if (!result.ok) {
      onError(result.error);
      return;
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

  return {
    week,
    charts: hydrated.charts,
    selectedChartId: hydrated.selectedChartId,
    occurrences,
    backgroundEvents,
    editing,
    setEditing,
    handleCycleCheck,
    handleEventDrop,
    openOccurrence,
    handleDelete,
  };
}
