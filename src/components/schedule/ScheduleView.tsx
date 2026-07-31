"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Appointment, AppointmentCheck, TimeChart } from "@/db/schema";
import type { OutlineNode } from "@/lib/tree/types";
import type { SchedulePayload } from "@/lib/schedule/queries";
import type { Occurrence } from "@/lib/schedule/recurrence";
import { fromDateKey, startOfWeek, toDateKey, weekDays } from "@/lib/schedule/geometry";
import { asyncHandler } from "@/lib/eventHandler";
import {
  createAppointmentAction,
  createTimeChartAction,
  deleteAppointmentAction,
  duplicateAppointmentAction,
  rescheduleAppointmentAction,
  setAppointmentCheckStateAction,
} from "@/app/schedule/actions";
import { WeekCalendar } from "./WeekCalendar";
import { ProjectsRail } from "./ProjectsRail";
import { AppointmentDrawer } from "./AppointmentDrawer";
import { MiniMonth } from "./MiniMonth";

type Props = {
  initial: SchedulePayload;
  nodes: OutlineNode[];
  weekKey: string;
};

export type DraftAppointment = {
  id?: string;
  subject: string;
  startAt: Date;
  endAt: Date;
  projectId?: string | null;
};

/** Revive Date fields that RSC may have serialized as ISO strings. */
function hydratePayload(initial: SchedulePayload) {
  return {
    charts: initial.charts,
    selectedChartId: initial.selectedChartId,
    backgroundEvents: initial.backgroundEvents.map((e) => ({
      ...e,
      start: new Date(e.start),
      end: new Date(e.end),
    })),
    occurrences: initial.occurrences.map((o) => ({
      ...o,
      startAt: new Date(o.startAt),
      endAt: new Date(o.endAt),
    })),
    masters: initial.appointments.map((a) => ({
      ...a,
      startAt: new Date(a.startAt),
      endAt: new Date(a.endAt),
      recurrenceUntil: a.recurrenceUntil ? new Date(a.recurrenceUntil) : null,
      createdAt: new Date(a.createdAt),
      updatedAt: new Date(a.updatedAt),
    })),
  };
}

/** `alert` is a free variable that does not exist under RSC SSR — look it up via window. */
function reportError(message: string) {
  if (typeof window !== "undefined") window.alert(message);
}

export function ScheduleView({ initial, nodes, weekKey }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const hydrated = hydratePayload(initial);
  const [charts, setCharts] = useState<TimeChart[]>(hydrated.charts);
  const [selectedChartId, setSelectedChartId] = useState<string | null>(
    hydrated.selectedChartId,
  );
  const [backgroundEvents, setBackgroundEvents] = useState(hydrated.backgroundEvents);
  const [occurrences, setOccurrences] = useState<Occurrence[]>(hydrated.occurrences);
  const [masters, setMasters] = useState<Appointment[]>(hydrated.masters);

  // Sync when server revalidates (router.refresh). Adjust during render — not in an effect.
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    const next = hydratePayload(initial);
    setCharts(next.charts);
    setSelectedChartId(next.selectedChartId);
    setBackgroundEvents(next.backgroundEvents);
    setOccurrences(next.occurrences);
    setMasters(next.masters);
  }

  const weekStart = fromDateKey(weekKey);
  const days = weekDays(weekStart);

  const [editingAppointment, setEditingAppointment] = useState<
    Appointment | DraftAppointment | null
  >(null);

  function openTimeChartEditor(chartId: string) {
    const returnTo = encodeURIComponent(
      `/schedule?week=${weekKey}${chartId ? `&chart=${chartId}` : ""}`,
    );
    router.push(`/schedule/time-chart/${chartId}?returnTo=${returnTo}`);
  }

  const navigateWeek = useCallback(
    (next: Date) => {
      const key = toDateKey(startOfWeek(next, 0));
      const chart = selectedChartId ? `&chart=${selectedChartId}` : "";
      router.push(`/schedule?week=${key}${chart}`);
    },
    [router, selectedChartId],
  );

  const selectChart = useCallback(
    (id: string) => {
      setSelectedChartId(id);
      const chart = id ? `&chart=${id}` : "";
      router.push(`/schedule?week=${weekKey}${chart}`);
    },
    [router, weekKey],
  );

  const refresh = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  function handleCreateRange(start: Date, end: Date) {
    setEditingAppointment({
      subject: "",
      startAt: start,
      endAt: end,
    });
  }

  async function handleCycleCheck(id: string, next: AppointmentCheck) {
    // Optimistic: flip local occurrence styling immediately.
    setOccurrences((prev) =>
      prev.map((o) => (o.id === id ? { ...o, checkState: next } : o)),
    );
    setMasters((prev) =>
      prev.map((a) => (a.id === id ? { ...a, checkState: next } : a)),
    );
    const result = await setAppointmentCheckStateAction(id, next);
    if (!result.ok) {
      reportError(result.error);
      refresh();
      return;
    }
    refresh();
  }

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
        reportError(result.error);
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
        reportError(result.error);
        return;
      }
    }
    refresh();
  }

  async function handleExternalProjectDrop(
    projectId: string,
    projectName: string,
    start: Date,
    durationMinutes: number,
  ) {
    const end = new Date(start.getTime() + durationMinutes * 60_000);
    const result = await createAppointmentAction({
      subject: projectName,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      projectId,
    });
    if (!result.ok) {
      reportError(result.error);
      return;
    }
    refresh();
  }

  function openOccurrence(occ: Occurrence) {
    const master = masters.find((m) => m.id === occ.id);
    if (master) {
      setEditingAppointment(master);
    } else {
      setEditingAppointment({
        id: occ.id,
        subject: occ.subject,
        startAt: occ.startAt,
        endAt: occ.endAt,
        projectId: occ.projectId,
      });
    }
  }

  async function handleNewChart() {
    const name = window.prompt("Time Chart name", "New Time Chart");
    if (name == null) return;
    const result = await createTimeChartAction(name);
    if (!result.ok) {
      reportError(result.error);
      return;
    }
    if (result.id) {
      setSelectedChartId(result.id);
      openTimeChartEditor(result.id);
      return;
    }
    refresh();
  }

  function handleEditChart() {
    if (!selectedChartId) return;
    openTimeChartEditor(selectedChartId);
  }

  async function handleDeleteAppointment(id: string) {
    const result = await deleteAppointmentAction(id);
    if (!result.ok) {
      reportError(result.error);
      return;
    }
    setEditingAppointment(null);
    refresh();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      {/* Toolbar — Achieve's Time Chart / Today bar */}
      <div className="flex flex-none flex-wrap items-center gap-2 border-b border-rule bg-shell px-3 py-1.5 text-[0.8125rem]">
        <label className="flex items-center gap-1.5 text-ink-muted">
          Time Chart:
          <select
            className="rounded border border-rule bg-surface px-2 py-1 text-ink"
            value={selectedChartId ?? ""}
            onChange={(e) => selectChart(e.target.value)}
          >
            {charts.length === 0 && <option value="">(none)</option>}
            {charts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || "Untitled"}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="rounded border border-rule bg-surface px-2 py-1 text-ink hover:bg-surface-raised disabled:opacity-40"
          disabled={!selectedChartId}
          onClick={handleEditChart}
        >
          Edit Time Chart…
        </button>
        <button
          type="button"
          className="rounded border border-rule bg-surface px-2 py-1 text-ink hover:bg-surface-raised"
          onClick={asyncHandler(handleNewChart, reportError)}
        >
          New Time Chart…
        </button>
        <button
          type="button"
          className="rounded border border-rule bg-surface px-2 py-1 text-ink hover:bg-surface-raised"
          onClick={() => navigateWeek(new Date())}
        >
          Today
        </button>
        <button
          type="button"
          className="rounded border border-select-edge bg-select px-2 py-1 font-medium text-ink hover:opacity-90"
          onClick={() => router.push(`/schedule/plan?week=${weekKey}&step=0`)}
        >
          Plan Week…
        </button>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous week"
            className="rounded border border-rule bg-surface px-2 py-1 text-ink hover:bg-surface-raised"
            onClick={() => {
              const d = new Date(weekStart);
              d.setDate(d.getDate() - 7);
              navigateWeek(d);
            }}
          >
            ‹
          </button>
          <span className="min-w-[12rem] text-center tabular text-ink">
            {days[0].toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
            {" – "}
            {days[6].toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
          <button
            type="button"
            aria-label="Next week"
            className="rounded border border-rule bg-surface px-2 py-1 text-ink hover:bg-surface-raised"
            onClick={() => {
              const d = new Date(weekStart);
              d.setDate(d.getDate() + 7);
              navigateWeek(d);
            }}
          >
            ›
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1">
          <WeekCalendar
            weekStart={weekStart}
            backgroundEvents={backgroundEvents}
            occurrences={occurrences}
            onSelectRange={handleCreateRange}
            onEventClick={openOccurrence}
            onEventDrop={asyncHandler(handleEventDrop, reportError)}
            onExternalDrop={asyncHandler(handleExternalProjectDrop, reportError)}
            onCycleCheck={asyncHandler(handleCycleCheck, reportError)}
          />
        </div>

        <aside className="flex w-56 flex-none flex-col border-l border-rule bg-shell">
          <div className="border-b border-rule p-2">
            <MiniMonth
              month={weekStart}
              selected={weekStart}
              onSelectDay={(d) => navigateWeek(d)}
              onChangeMonth={(d) => navigateWeek(d)}
            />
          </div>
          <ProjectsRail nodes={nodes} />
        </aside>
      </div>

      <AppointmentDrawer
        open={editingAppointment != null}
        value={editingAppointment}
        nodes={nodes}
        onClose={() => setEditingAppointment(null)}
        onSaved={() => {
          refresh();
        }}
        onDelete={asyncHandler(handleDeleteAppointment, reportError)}
      />
    </div>
  );
}
