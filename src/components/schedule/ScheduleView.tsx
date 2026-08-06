"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useIsCompact } from "@/components/shell/useIsCompact";
import type { Appointment, AppointmentCheck, TimeChart } from "@/db/schema";
import type { OutlineNode } from "@/lib/tree/types";
import type { SchedulePayload, ScheduleOccurrence } from "@/lib/schedule/queries";
import type { Occurrence } from "@/lib/schedule/recurrence";
import {
  fromDateKey,
  localDateKey,
  startOfWeek,
  toDateKey,
  weekDays,
} from "@/lib/schedule/geometry";
import { asyncHandler } from "@/lib/eventHandler";
import {
  createAppointmentAction,
  createTimeChartAction,
  deleteAppointmentAction,
  duplicateAppointmentAction,
  rescheduleAppointmentAction,
  setAppointmentCheckStateAction,
  syncGoogleAction,
} from "@/app/schedule/actions";
import { WeekCalendar } from "./WeekCalendar";
import { ProjectsRail } from "./ProjectsRail";
import { AppointmentDrawer } from "./AppointmentDrawer";
import { MiniMonth } from "./MiniMonth";
import { CommandBar } from "@/components/grid/CommandBar";
import { useRegisterCommands } from "@/components/shell/CommandProvider";
import { OverflowMenu } from "@/components/shell/OverflowMenu";
import type { Command } from "@/lib/commands/registry";

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
  const [occurrences, setOccurrences] = useState<ScheduleOccurrence[]>(
    hydrated.occurrences,
  );
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

  const [syncing, setSyncing] = useState(false);
  /**
   * Sync trouble reported by the server render, dismissible once seen. `loadSchedule`
   * never throws on a Google failure — the week still loads from what was already
   * mirrored — so this banner is the only signal that the data may be behind.
   */
  const [syncError, setSyncError] = useState<string | null>(
    initial.sync.state === "failed" || initial.sync.state === "not_linked"
      ? initial.sync.message
      : null,
  );

  const handleSyncGoogle = useCallback(async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const result = await syncGoogleAction(weekKey);
      if (!result.ok) setSyncError(result.error);
      else router.refresh();
    } finally {
      setSyncing(false);
    }
  }, [router, weekKey]);

  // `useCallback` on these three because they are dependencies of the registered command list, and
  // `useRegisterCommands` re-registers on identity — a handler rebuilt every render would make the
  // provider set state every render. Its dev churn guard exists because that has happened before.
  const openTimeChartEditor = useCallback(
    (chartId: string) => {
      const returnTo = encodeURIComponent(
        `/schedule?week=${weekKey}${chartId ? `&chart=${chartId}` : ""}`,
      );
      router.push(`/schedule/time-chart/${chartId}?returnTo=${returnTo}`);
    },
    [router, weekKey],
  );

  const navigateWeek = useCallback(
    (next: Date) => {
      const key = toDateKey(startOfWeek(next, 0));
      const chart = selectedChartId ? `&chart=${selectedChartId}` : "";
      router.push(`/schedule?week=${key}${chart}`);
    },
    [router, selectedChartId],
  );

  const compact = useIsCompact();
  /**
   * Which day the compact layout shows, as an index into the week already loaded. The week
   * stays in the URL — this only picks a column out of it — so stepping past either end
   * navigates to the neighbouring week and lands on its far day.
   */
  const [dayOffset, setDayOffset] = useState(() => {
    // Open on today when the loaded week contains it — landing on Sunday because that is
    // where the week starts is technically correct and never what you wanted.
    const todayKey = localDateKey(new Date());
    const index = weekDays(fromDateKey(weekKey)).findIndex(
      (day) => toDateKey(day) === todayKey,
    );
    return index === -1 ? 0 : index;
  });
  const compactDay = days[dayOffset] ?? days[0];

  function stepDay(delta: number) {
    const next = dayOffset + delta;
    if (next >= 0 && next <= 6) {
      setDayOffset(next);
      return;
    }
    const target = new Date(weekStart);
    target.setDate(target.getDate() + next);
    setDayOffset(next < 0 ? 6 : 0);
    navigateWeek(target);
  }

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

  const handleNewChart = useCallback(async () => {
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
  }, [openTimeChartEditor, refresh]);

  const handleEditChart = useCallback(() => {
    if (!selectedChartId) return;
    openTimeChartEditor(selectedChartId);
  }, [openTimeChartEditor, selectedChartId]);

  async function handleDeleteAppointment(id: string) {
    const result = await deleteAppointmentAction(id);
    if (!result.ok) {
      reportError(result.error);
      return;
    }
    setEditingAppointment(null);
    refresh();
  }

  /**
   * The week's own verbs.
   *
   * `Refresh from Google` stays listed with a reason when no calendar is mirrored, rather than
   * vanishing — `navigation.md`: a command that disappears teaches you it does not exist, a greyed
   * one teaches you how to get it.
   */
  const commands = useMemo<Command[]>(
    () => [
      {
        id: "schedule.new-chart",
        label: "New Time Chart…",
        group: "record",
        menu: "new",
        section: "New",
        icon: "new",
        toolbar: 10,
        keywords: "template background week",
        run: asyncHandler(handleNewChart, reportError),
      },
      {
        id: "schedule.edit-chart",
        label: "Edit Time Chart…",
        group: "record",
        menu: "item",
        section: "Item",
        icon: "open",
        toolbar: 50,
        keywords: "template background areas",
        disabled: !selectedChartId,
        title: selectedChartId ? undefined : "Pick a Time Chart first",
        run: handleEditChart,
      },
      {
        id: "schedule.today",
        label: "Go to this week",
        group: "view",
        menu: "view",
        section: "Layout",
        icon: "schedule",
        toolbar: 60,
        keywords: "today now current",
        run: () => navigateWeek(new Date()),
      },
      {
        id: "schedule.sync-google",
        label: syncing ? "Syncing…" : "Refresh from Google",
        group: "view",
        menu: "view",
        section: "Layout",
        icon: "reset",
        keywords: "google calendar pull mirror",
        disabled: syncing || initial.sync.state === "off",
        title:
          initial.sync.state === "off"
            ? "No Google calendar is being mirrored — connect one in Settings"
            : "Pull the latest from Google Calendar",
        run: asyncHandler(handleSyncGoogle, reportError),
      },
    ],
    [
      selectedChartId,
      syncing,
      initial.sync.state,
      handleEditChart,
      handleNewChart,
      handleSyncGoogle,
      navigateWeek,
    ],
  );

  useRegisterCommands(commands);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      {/* The week below is still fully usable — it just may be behind Google. Saying so
          beats both a silent stale view and an error page. */}
      {syncError && (
        <div
          role="status"
          className="flex flex-none items-center gap-3 border-b border-rule bg-priority-a/10 px-3 py-1.5 text-[0.8125rem] text-priority-a"
        >
          <span className="min-w-0 flex-1">
            Google Calendar sync failed — showing the last synced copy. {syncError}
          </span>
          <button
            type="button"
            onClick={() => setSyncError(null)}
            className="flex-none rounded border border-priority-a/40 px-2 py-0.5 text-[0.75rem] hover:bg-priority-a/10"
          >
            Dismiss
          </button>
        </div>
      )}
      {/*
        Toolbar — Achieve's Time Chart / Today bar, now the two-row shape every grid uses.
        The command row carries the verbs; the Time Chart picker and the pagers are the lens, and
        scroll sideways below `md` rather than wrapping into three rows.

        This view had no `⋯` and no palette entries: `Edit Time Chart…`, `New Time Chart…` and
        `Refresh` existed as bordered buttons and nowhere else, and `Refresh` disappeared entirely
        when sync was off rather than saying why.
      */}
      <div className="hidden flex-none items-center gap-2 border-b border-rule bg-shell px-3 py-1.5 md:flex">
        <CommandBar commands={commands} />
      </div>
      <div className="flex flex-none flex-nowrap items-center gap-2 overflow-x-auto border-b border-rule bg-shell px-3 py-1.5 text-[0.8125rem] md:flex-wrap md:overflow-x-visible">
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
          className="rounded border border-select-edge bg-select px-2 py-1 text-[0.8125rem] font-medium text-ink hover:opacity-90"
          onClick={() => router.push(`/schedule/plan?week=${weekKey}&step=0`)}
        >
          Plan Week…
        </button>
        {/*
          `⋯` on the lens row, phone-only: the command row above is `md:flex`, so without this the
          week's verbs would exist on a desktop and nowhere else. Not pinned outside a scroller here
          because this row is short enough not to pan on a phone.
        */}
        <span className="flex-none md:hidden">
          <OverflowMenu label="More commands for this week" />
        </span>
        {/*
         * A day pager below `md`, stepping across week boundaries by navigating the week and
         * landing on the right end of it. The week pager beside it is hidden there — a
         * seven-column grid on a phone is not something to page through.
         */}
        <div className="ml-auto flex items-center gap-1 md:hidden">
          <button
            type="button"
            aria-label="Previous day"
            className="min-h-tap rounded border border-rule bg-surface px-3 text-ink"
            onClick={() => stepDay(-1)}
          >
            ‹
          </button>
          <span className="tabular min-w-[8rem] text-center text-ink">
            {compactDay.toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </span>
          <button
            type="button"
            aria-label="Next day"
            className="min-h-tap rounded border border-rule bg-surface px-3 text-ink"
            onClick={() => stepDay(1)}
          >
            ›
          </button>
        </div>

        <div className="ml-auto hidden items-center gap-1 md:flex">
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
            singleDay={compact ? compactDay : undefined}
            backgroundEvents={backgroundEvents}
            occurrences={occurrences}
            onSelectRange={handleCreateRange}
            onEventClick={openOccurrence}
            onEventDrop={asyncHandler(handleEventDrop, reportError)}
            onExternalDrop={asyncHandler(handleExternalProjectDrop, reportError)}
            onCycleCheck={asyncHandler(handleCycleCheck, reportError)}
          />
        </div>

        {/* The mini-month and the drag-a-project-onto-the-week rail are both mouse surfaces,
            and neither fits beside a day column. */}
        <aside className="hidden w-56 flex-none flex-col border-l border-rule bg-shell md:flex">
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
