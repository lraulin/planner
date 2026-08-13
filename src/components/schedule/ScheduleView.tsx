"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { useIsCompact } from "@/components/shell/useIsCompact";
import type { Appointment, AppointmentCheck, TimeChart } from "@/db/schema";
import type { OutlineNode } from "@/lib/tree/types";
import type { SchedulePayload, ScheduleOccurrence } from "@/lib/schedule/queries";
import type { Occurrence } from "@/lib/schedule/recurrence";
import { fromDateKey, localDateKey } from "@/lib/schedule/geometry";
import {
  DAY_COUNTS,
  scheduleRange,
  stepAnchor,
  type RangeOptions,
} from "@/lib/schedule/range";
import { DELETE_ROW, OPEN_RECORD } from "@/lib/commands/chords";
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
import { AgendaGrid } from "./AgendaGrid";
import { ProjectsRail } from "./ProjectsRail";
import { AppointmentDrawer } from "./AppointmentDrawer";
import { MiniMonth } from "./MiniMonth";
import {
  ContextMenu,
  menuItemsFor,
  type MenuItem,
} from "@/components/grid/ContextMenu";
import { useSetting } from "@/components/settings/SettingsProvider";
import { SCHEDULE_SCOPE } from "@/lib/settings/scopes";
import { slotDurationOf, SLOT_MINUTES } from "@/lib/settings/schedule";
import { SCHEDULE_VIEW_CODEC } from "./scheduleSetting";
import type { CalendarTarget } from "@/lib/schedule/calendarTarget";
import { defaultBlockRange } from "@/lib/schedule/blockDraft";
import type { AgendaRow } from "@/lib/schedule/agenda";
import { nextCheckState } from "@/lib/schedule/checkState";
import { owningProjectId } from "@/lib/tree/owningProject";
import { CommandBar } from "@/components/grid/CommandBar";
import { useRegisterCommands } from "@/components/shell/CommandProvider";
import { OverflowMenu } from "@/components/shell/OverflowMenu";
import type { Command } from "@/lib/commands/registry";

type Props = {
  initial: SchedulePayload;
  nodes: OutlineNode[];
  /** The day the visible range is anchored on — `?start=`, or today. */
  anchorKey: string;
  /** `?block=` — a row somewhere else asked for a calendar block. See below. */
  blockNodeId?: string | null;
};

/** Achieve spelled these out, and "Twenty Days" reads as a choice where "20" reads as data. */
const DAY_COUNT_WORDS: Record<number, string> = {
  1: "One",
  3: "Three",
  5: "Five",
  7: "Seven",
  10: "Ten",
  20: "Twenty",
};

/** The pager's label for a single day: "Wed, Aug 12". */
const DAY_LABEL: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "short",
  day: "numeric",
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
    days: initial.days.map((day) => new Date(day)),
    rangeEnd: new Date(initial.rangeEnd),
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

/**
 * The three appointment states, as verbs.
 *
 * The checkbox on an event cycles open → done → missed; the menu is how you jump straight to
 * one, which is the whole difference between a cycle and a picker.
 */
const CHECK_STATES = [
  ["open", "Mark open"],
  ["done", "Mark done"],
  ["missed", "Mark missed"],
] as const satisfies readonly (readonly [AppointmentCheck, string])[];

/** `alert` is a free variable that does not exist under RSC SSR — look it up via window. */
function reportError(message: string) {
  if (typeof window !== "undefined") window.alert(message);
}

export function ScheduleView({ initial, nodes, anchorKey, blockNodeId = null }: Props) {
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

  /*
   * The days on screen come from the payload, not from the settings.
   *
   * Both would usually agree, but picking Twenty Days patches the setting first and reloads
   * after: a range derived on the client would widen to twenty columns immediately, with
   * only the old days' appointments to put in them. Following the payload means the grid can
   * only ever draw days that were actually loaded.
   */
  const anchor = fromDateKey(anchorKey);
  const days = hydrated.days;
  const rangeStart = days[0];
  const rangeEnd = hydrated.rangeEnd;
  const rangeLabel =
    days.length === 1
      ? days[0].toLocaleDateString(undefined, DAY_LABEL)
      : `${days[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${days[
          days.length - 1
        ].toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}`;

  const [editingAppointment, setEditingAppointment] = useState<
    Appointment | DraftAppointment | null
  >(null);
  /** The agenda's focused row, by occurrence key. Selection is per-mode, not shared. */
  const [selectedAgendaId, setSelectedAgendaId] = useState<string | null>(null);
  /** Where the calendar's context menu is open, and what it is about. */
  const [calendarMenuAt, setCalendarMenuAt] = useState<{
    target: CalendarTarget;
    x: number;
    y: number;
  } | null>(null);
  const {
    value: view,
    patch: patchView,
    flush: flushView,
  } = useSetting(SCHEDULE_SCOPE, SCHEDULE_VIEW_CODEC);

  /*
   * `Schedule block…`, arriving from another module.
   *
   * A row on `/tasks` has no calendar under it, so the command navigates here with `?block=` and
   * the week does the rest: find the node, propose a time, open the drawer already filled in.
   * The alternative was a date/time dialog on the grid, which is the calendar with the calendar
   * taken away.
   *
   * Opening the drawer adjusts state during render, the idiom this file already uses above —
   * that is a component setting its own state and is allowed. Clearing the param is **not**:
   * `router.replace` updates the Router, and updating another component mid-render is the error
   * React names outright. So the two halves are split, and the effect runs after the drawer is
   * on screen.
   */
  const [seenBlockNodeId, setSeenBlockNodeId] = useState<string | null>(null);
  if (blockNodeId && blockNodeId !== seenBlockNodeId) {
    setSeenBlockNodeId(blockNodeId);
    const node = nodes.find((entry) => entry.id === blockNodeId);
    if (node) {
      const { start, end } = defaultBlockRange(
        days,
        new Date(),
        node.effortLeftMinutes ?? node.effortMinutes ?? 60,
      );
      setEditingAppointment({
        subject: node.name || "Untitled",
        startAt: start,
        endAt: end,
        // The block is *about* this row, and an appointment can only point at a project — so a
        // task's block is filed under the project the task lives in, which is also what
        // dragging that project off the rail produces.
        projectId: owningProjectId(nodes, blockNodeId),
      });
    }
  }

  // Drop `?block=` once it has been consumed. Left in place, Back or a refresh would re-open a
  // drawer the user had deliberately closed.
  useEffect(() => {
    if (blockNodeId) router.replace(`/schedule?start=${anchorKey}`, { scroll: false });
  }, [blockNodeId, router, anchorKey]);

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
      const result = await syncGoogleAction(anchorKey);
      if (!result.ok) setSyncError(result.error);
      else router.refresh();
    } finally {
      setSyncing(false);
    }
  }, [router, anchorKey]);

  // Local-first: when the mirror is stale, pull Google once in the background and refresh
  // after success. Idempotent per mount of this stale payload — not on every re-render.
  const autoSyncStarted = useRef(false);
  useEffect(() => {
    if (initial.sync.state !== "stale") {
      autoSyncStarted.current = false;
      return;
    }
    if (autoSyncStarted.current) return;
    autoSyncStarted.current = true;
    void handleSyncGoogle();
  }, [initial.sync, handleSyncGoogle]);

  // `useCallback` on these three because they are dependencies of the registered command list, and
  // `useRegisterCommands` re-registers on identity — a handler rebuilt every render would make the
  // provider set state every render. Its dev churn guard exists because that has happened before.
  const openTimeChartEditor = useCallback(
    (chartId: string) => {
      const returnTo = encodeURIComponent(
        `/schedule?start=${anchorKey}${chartId ? `&chart=${chartId}` : ""}`,
      );
      router.push(`/schedule/time-chart/${chartId}?returnTo=${returnTo}`);
    },
    [router, anchorKey],
  );

  /** The day count and anchor mode the pagers step by. */
  const rangeOptions = useMemo<RangeOptions>(
    () => ({
      dayCount: view.dayCount,
      anchorMode: view.anchorMode,
      workWeek: view.workWeek,
    }),
    [view.dayCount, view.anchorMode, view.workWeek],
  );

  const navigateTo = useCallback(
    (next: Date) => {
      const chart = selectedChartId ? `&chart=${selectedChartId}` : "";
      router.push(`/schedule?start=${localDateKey(next)}${chart}`);
    },
    [router, selectedChartId],
  );

  /** Previous / next range. Rolling tiles by the day count; aligned pages by the week. */
  const stepRange = useCallback(
    (direction: -1 | 1) => navigateTo(stepAnchor(anchor, direction, rangeOptions)),
    [anchor, navigateTo, rangeOptions],
  );

  const compact = useIsCompact();
  /**
   * Which day the compact layout shows, as an index into the range already loaded. The
   * anchor stays in the URL — this only picks a column out of what was loaded — so stepping
   * past either end navigates to the neighbouring range and lands on its far day.
   */
  const [dayOffset, setDayOffset] = useState(() => {
    // Open on today when the loaded range contains it — landing on the range's first day
    // because that is where it starts is technically correct and never what you wanted.
    const todayKey = localDateKey(new Date());
    const index = days.findIndex((day) => localDateKey(day) === todayKey);
    return index === -1 ? 0 : index;
  });
  const compactDay = days[dayOffset] ?? days[0];

  function stepDay(delta: number) {
    const next = dayOffset + delta;
    if (next >= 0 && next < days.length) {
      setDayOffset(next);
      return;
    }
    // Off the end: the neighbouring range, landing on the day next to the one you were on.
    setDayOffset(next < 0 ? days.length - 1 : 0);
    stepRange(next < 0 ? -1 : 1);
  }

  const selectChart = useCallback(
    (id: string) => {
      setSelectedChartId(id);
      const chart = id ? `&chart=${id}` : "";
      router.push(`/schedule?start=${anchorKey}${chart}`);
    },
    [router, anchorKey],
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

  /**
   * The agenda's row actions, expressed through the calendar's own handlers.
   *
   * An agenda row *is* an occurrence — the same appointment drawn as a line instead of a
   * block — so opening one and cycling its check state must be the same operations, not a
   * second implementation that can disagree about what "done" means.
   */
  function openAgendaRow(row: AgendaRow) {
    const occurrence = occurrences.find((entry) => entry.occurrenceKey === row.id);
    if (occurrence) openOccurrence(occurrence);
  }

  const cycleAgendaRow = asyncHandler(
    (row: AgendaRow) =>
      handleCycleCheck(row.appointmentId, nextCheckState(row.checkState)),
    reportError,
  );

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
  /**
   * Achieve's View menu, verbatim: One / Three / Five / Seven / Ten / Twenty Days.
   *
   * Registered as commands rather than built only for the right-click, because that is where
   * Achieve put them and because a width you can only reach by right-clicking the grid is one
   * you have to already know about. Changing the count reloads — unlike slot size, it changes
   * which days the server has to fetch.
   */
  const dayCountCommands = useMemo<Command[]>(
    () =>
      DAY_COUNTS.map((count) => ({
        id: `schedule.days-${count}`,
        label: `${DAY_COUNT_WORDS[count]} Day${count === 1 ? "" : "s"}`,
        group: "view" as const,
        menu: "view" as const,
        section: "Days",
        icon: "levels" as const,
        keywords: `columns width ${count} day range`,
        disabled: view.dayCount === count,
        title: view.dayCount === count ? "Currently showing" : undefined,
        // Flushed before the refresh, not after the usual debounce: the day count decides
        // which days the *server* loads, so refreshing first would re-render the old width.
        run: asyncHandler(async () => {
          patchView((current) => ({ ...current, dayCount: count }));
          await flushView();
          refresh();
        }, reportError),
      })),
    [view.dayCount, patchView, flushView, refresh],
  );

  const anchorModeCommand = useMemo<Command>(
    () => ({
      id: "schedule.anchor-mode",
      label:
        view.anchorMode === "rolling" ? "Align to the week" : "Start on today instead",
      group: "view",
      menu: "view",
      section: "Layout",
      icon: "panel",
      keywords: "anchor rolling week start today past",
      title:
        view.anchorMode === "rolling"
          ? "Show whole calendar weeks instead of starting on today"
          : "Start the range on today rather than on the week boundary",
      run: asyncHandler(async () => {
        patchView((current) => ({
          ...current,
          anchorMode: current.anchorMode === "rolling" ? "aligned" : "rolling",
        }));
        await flushView();
        refresh();
      }, reportError),
    }),
    [view.anchorMode, patchView, flushView, refresh],
  );

  /**
   * The calendar's own right-click, which it had none of at all.
   *
   * Built from `Command`s and rendered through `menuItemsFor` like every grid's row menu, so the
   * labels and the shortcuts come from the same place the menu bar's do. What is *not* shared is
   * the registry: these are about the appointment or the slot under the pointer, which is not
   * something a registered command list can describe — the same reason `rowMenu` rebuilds rather
   * than reading the registration.
   */
  function calendarMenu(target: CalendarTarget): MenuItem[] {
    if (target.kind === "event") {
      const occurrence = occurrences.find(
        (entry) => entry.occurrenceKey === target.occurrenceKey,
      );
      const state = occurrence?.checkState ?? "open";
      const id = target.appointmentId;

      return menuItemsFor([
        {
          label: "Item",
          commands: [
            {
              id: "appointment.open",
              label: "Open appointment…",
              group: "record",
              icon: "open",
              bindings: OPEN_RECORD,
              run: () => occurrence && openOccurrence(occurrence),
            },
            {
              id: "appointment.duplicate",
              label: "Duplicate here",
              group: "record",
              icon: "copy",
              run: asyncHandler(
                () =>
                  handleEventDrop(
                    id,
                    occurrence?.startAt ?? new Date(),
                    occurrence?.endAt ?? new Date(),
                    { duplicate: true },
                  ),
                reportError,
              ),
            },
          ],
        },
        {
          label: "State",
          // Three rows behind one entry, the same fold the grids' `State ▸` uses.
          submenu: true,
          commands: CHECK_STATES.map(([next, label]) => ({
            id: `appointment.state.${next}`,
            label,
            group: "record" as const,
            icon: "state" as const,
            disabled: state === next,
            title: state === next ? `Already ${label.toLowerCase()}` : undefined,
            run: asyncHandler(() => handleCycleCheck(id, next), reportError),
          })),
        },
        {
          label: "Danger",
          commands: [
            {
              id: "appointment.delete",
              label: "Delete appointment",
              group: "record",
              icon: "delete",
              destructive: true,
              bindings: DELETE_ROW,
              // The same `window.confirm` the drawer's Delete asks. Two ways to delete an
              // appointment where one asks and one does not is worse than either alone, and
              // there is no undo to fall back on.
              run: asyncHandler(async () => {
                if (!window.confirm("Delete this appointment?")) return;
                await handleDeleteAppointment(id);
              }, reportError),
            },
          ],
        },
      ]);
    }

    if (target.kind !== "slot") return [];

    const { start, allDay } = target;
    // Whether anchoring on this day would move anything, which depends on the mode: aligned
    // snaps back to the week, rolling starts exactly here.
    const startsHere =
      localDateKey(scheduleRange(start, rangeOptions).start) ===
      localDateKey(rangeStart);
    return menuItemsFor([
      {
        label: "New",
        commands: [
          {
            id: "schedule.new-here",
            label: allDay ? "New all-day event…" : "New appointment here…",
            group: "record",
            icon: "new",
            run: () =>
              setEditingAppointment(
                allDay
                  ? { subject: "", startAt: start, endAt: start }
                  : {
                      subject: "",
                      startAt: start,
                      endAt: new Date(start.getTime() + view.slotMinutes * 60_000),
                    },
              ),
          },
        ],
      },
      {
        label: "Go to",
        commands: [
          {
            id: "schedule.go-today",
            label: "Today",
            group: "view",
            icon: "schedule",
            run: () => navigateTo(new Date()),
          },
          {
            id: "schedule.go-anchor-here",
            // In aligned mode this jumps to the week around the day; in rolling mode the
            // day becomes the first column. Naming it after the mode is the difference
            // between a menu that describes the app and one that describes your app.
            label: view.anchorMode === "aligned" ? "Week of this day" : "Start here",
            group: "view",
            icon: "schedule",
            // Only offered when it would move you — on the range you are already looking
            // at, it is a row that does nothing.
            disabled: startsHere,
            title: startsHere ? "Already the first day shown" : undefined,
            run: () => navigateTo(start),
          },
        ],
      },
      {
        label: "Days",
        submenu: true,
        commands: dayCountCommands,
      },
      {
        label: "Slot size",
        submenu: true,
        commands: SLOT_MINUTES.map((minutes) => ({
          id: `schedule.slot-${minutes}`,
          label: `${minutes} minutes`,
          group: "view" as const,
          icon: "levels" as const,
          disabled: view.slotMinutes === minutes,
          title: view.slotMinutes === minutes ? "Current slot size" : undefined,
          run: () => patchView((current) => ({ ...current, slotMinutes: minutes })),
        })),
      },
      {
        label: "Layout",
        commands: [
          {
            id: "schedule.work-week",
            label: view.workWeek ? "Show the weekend" : "Work week mode",
            group: "view",
            icon: "panel",
            keywords: "weekend saturday sunday five days",
            // Reloads like the day count does: hiding the weekend does not just hide two
            // columns, it moves the range on by two days to keep the count you asked for.
            run: asyncHandler(async () => {
              patchView((current) => ({ ...current, workWeek: !current.workWeek }));
              await flushView();
              refresh();
            }, reportError),
          },
          anchorModeCommand,
        ],
      },
    ]);
  }

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
        // Not "this week" any more: the range is seven days only one time in six.
        label: "Go to today",
        group: "view",
        menu: "view",
        section: "Layout",
        icon: "schedule",
        toolbar: 60,
        keywords: "today now current week",
        run: () => navigateTo(new Date()),
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
      ...dayCountCommands,
      anchorModeCommand,
    ],
    [
      dayCountCommands,
      anchorModeCommand,
      selectedChartId,
      syncing,
      initial.sync.state,
      handleEditChart,
      handleNewChart,
      handleSyncGoogle,
      navigateTo,
    ],
  );

  useRegisterCommands(commands);

  /**
   * The lens: what am I looking at. Rendered on this view's own bar in Calendar mode and
   * handed to the agenda grid's toolbar in Agenda mode, so that either way there is exactly
   * one command row and one lens row.
   */
  const lensControls = (
    <>
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
        onClick={() => router.push(`/schedule/plan?week=${anchorKey}&step=0`)}
      >
        Plan Week…
      </button>
      {/*
       * Calendar | Agenda. A lens control, not a command — it answers "what am I looking
       * at", so it belongs on this row rather than among the verbs above (`data-grid.md`).
       * Two options visible at a glance is a segmented control, the same shape the grids'
       * density switch uses.
       */}
      <div
        role="group"
        aria-label="Schedule view"
        className="flex flex-none overflow-hidden rounded border border-rule"
      >
        {(
          [
            ["calendar", "Calendar", "Time blocks on a grid"],
            ["agenda", "Agenda", "The same days as a list, with days left"],
          ] as const
        ).map(([mode, label, title]) => (
          <button
            key={mode}
            type="button"
            aria-pressed={view.viewMode === mode}
            title={title}
            onClick={() => patchView((current) => ({ ...current, viewMode: mode }))}
            className={[
              "min-h-tap px-2 py-1 text-[0.8125rem] leading-none whitespace-nowrap transition-colors md:min-h-0",
              view.viewMode === mode
                ? "bg-select text-ink"
                : "text-ink-muted hover:bg-surface-raised hover:text-ink",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );

  /**
   * A day pager below `md`, stepping across the range boundary by navigating and landing on
   * the far end of the neighbouring one. The range pager beside it is hidden there — even
   * seven columns on a phone is not something to page through, let alone twenty.
   */
  const rangePagers = (
    <>
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
          {compactDay.toLocaleDateString(undefined, DAY_LABEL)}
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
          aria-label="Previous days"
          className="rounded border border-rule bg-surface px-2 py-1 text-ink hover:bg-surface-raised"
          onClick={() => stepRange(-1)}
        >
          ‹
        </button>
        <span className="min-w-[12rem] text-center tabular text-ink">{rangeLabel}</span>
        <button
          type="button"
          aria-label="Next days"
          className="rounded border border-rule bg-surface px-2 py-1 text-ink hover:bg-surface-raised"
          onClick={() => stepRange(1)}
        >
          ›
        </button>
      </div>
    </>
  );

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
      {/*
        In Agenda mode the grid's own toolbar carries both rows instead: these commands are
        merged into its command row and the lens controls below become its `left` and
        `right`. Two menu bars stacked is one too many, and two lens rows is worse.
      */}
      {view.viewMode === "calendar" && (
        <>
          <div className="hidden flex-none items-center gap-2 border-b border-rule bg-shell px-3 py-1.5 md:flex">
            <CommandBar commands={commands} />
          </div>
          <div className="flex flex-none flex-nowrap items-center gap-2 overflow-x-auto border-b border-rule bg-shell px-3 py-1.5 text-[0.8125rem] md:flex-wrap md:overflow-x-visible">
            {lensControls}
            {/*
              `⋯` on the lens row, phone-only: the command row above is `md:flex`, so without
              this the schedule's verbs would exist on a desktop and nowhere else. Not pinned
              outside a scroller here because this row is short enough not to pan on a phone.
            */}
            <span className="flex-none md:hidden">
              <OverflowMenu label="More commands for this schedule" />
            </span>
            {rangePagers}
          </div>
        </>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {view.viewMode === "agenda" ? (
            <AgendaGrid
              occurrences={occurrences}
              days={days}
              nodes={nodes}
              hostCommands={commands}
              lensLeft={lensControls}
              lensRight={rangePagers}
              selectedId={selectedAgendaId}
              onSelect={setSelectedAgendaId}
              onOpenAppointment={openAgendaRow}
              onCycleCheck={cycleAgendaRow}
            />
          ) : (
            <>
              <WeekCalendar
                days={days}
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                singleDay={compact ? compactDay : undefined}
                backgroundEvents={backgroundEvents}
                occurrences={occurrences}
                onSelectRange={handleCreateRange}
                onEventClick={openOccurrence}
                onEventDrop={asyncHandler(handleEventDrop, reportError)}
                onExternalDrop={asyncHandler(handleExternalProjectDrop, reportError)}
                onCycleCheck={asyncHandler(handleCycleCheck, reportError)}
                onContextMenu={(target, x, y) => setCalendarMenuAt({ target, x, y })}
                slotDuration={slotDurationOf(view.slotMinutes)}
                weekends={!view.workWeek}
              />
              {calendarMenuAt && (
                // Built on open rather than held in state, so a state row greys itself
                // against the appointment as it is now — the same rule the grids' row menus
                // follow.
                <ContextMenu
                  x={calendarMenuAt.x}
                  y={calendarMenuAt.y}
                  items={calendarMenu(calendarMenuAt.target)}
                  onClose={() => setCalendarMenuAt(null)}
                />
              )}
            </>
          )}
        </div>

        {/* The mini-month and the drag-a-project-onto-the-week rail are both mouse surfaces,
            and neither fits beside a day column. */}
        <aside className="hidden w-56 flex-none flex-col border-l border-rule bg-shell md:flex">
          <div className="border-b border-rule p-2">
            <MiniMonth
              month={rangeStart}
              selected={rangeStart}
              onSelectDay={(d) => navigateTo(d)}
              onChangeMonth={(d) => navigateTo(d)}
            />
          </div>
          {view.viewMode === "calendar" && <ProjectsRail nodes={nodes} />}
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
