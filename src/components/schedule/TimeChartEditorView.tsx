"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin, {
  type EventResizeDoneArg,
} from "@fullcalendar/interaction";
import type {
  DateSelectArg,
  EventClickArg,
  EventDropArg,
  EventInput,
} from "@fullcalendar/core";
import type { TimeChart, TimeChartArea } from "@/db/schema";
import type { OutlineNode } from "@/lib/tree/types";
import {
  createTimeChartAreaAction,
  deleteTimeChartAreaAction,
  renameTimeChartAction,
  updateTimeChartAreaAction,
} from "@/app/schedule/actions";
import { contrastText } from "@/lib/schedule/geometry";
import {
  expandAreasForTemplate,
  rangeToAreaTiming,
  TIME_CHART_TEMPLATE_WEEK_START,
  weekdayOfTemplateDate,
} from "@/lib/schedule/timeChartTemplate";
import { TimeChartAreaPanel } from "./TimeChartAreaPanel";

type Props = {
  chart: TimeChart;
  initialAreas: TimeChartArea[];
  nodes: OutlineNode[];
  /** Query string to restore when leaving (week + chart selection). */
  returnTo?: string;
};

/**
 * Full-page Time Chart editor (Achieve’s separate window as an in-app view).
 * Template week Sun–Sat, only chart areas — click-drag to create like appointments.
 */
export function TimeChartEditorView({
  chart,
  initialAreas,
  nodes,
  returnTo,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const calendarRef = useRef<FullCalendar | null>(null);

  const [chartName, setChartName] = useState(chart.name);
  const [areas, setAreas] = useState(initialAreas);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingNameFocus, setPendingNameFocus] = useState(false);

  // Sync server props after revalidation. Adjust during render — not in an effect.
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevAreas, setPrevAreas] = useState(initialAreas);
  if (initialAreas !== prevAreas) {
    setPrevAreas(initialAreas);
    setAreas(initialAreas);
  }
  const [prevChartName, setPrevChartName] = useState(chart.name);
  if (chart.name !== prevChartName) {
    setPrevChartName(chart.name);
    setChartName(chart.name);
  }

  useEffect(() => {
    if (!pendingNameFocus || !selectedId) return;
    const t = window.setTimeout(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
      setPendingNameFocus(false);
    }, 50);
    return () => window.clearTimeout(t);
  }, [pendingNameFocus, selectedId, areas]);

  const selected = areas.find((a) => a.id === selectedId) ?? null;

  const events: EventInput[] = useMemo(() => {
    return expandAreasForTemplate(areas).map((e) => {
      const label = contrastText(e.backgroundColor);
      return {
        id: e.id,
        title: e.title,
        start: e.start,
        end: e.end,
        backgroundColor: e.backgroundColor,
        borderColor: e.backgroundColor,
        textColor: label,
        classNames: [
          "fc-timechart-area",
          selectedId === e.areaId ? "fc-timechart-area-selected" : "",
        ].filter(Boolean),
        extendedProps: {
          areaId: e.areaId,
          weekday: e.weekday,
        },
      };
    });
  }, [areas, selectedId]);

  const refresh = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  function goBack() {
    if (returnTo) {
      router.push(returnTo);
    } else {
      router.push(`/schedule?chart=${chart.id}`);
    }
  }

  async function saveChartName() {
    const result = await renameTimeChartAction(chart.id, chartName);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    refresh();
  }

  async function handleSelectRange(arg: DateSelectArg) {
    arg.view.calendar.unselect();
    const weekday = weekdayOfTemplateDate(arg.start);
    const { startMinute, durationMinutes } = rangeToAreaTiming(arg.start, arg.end);
    setError(null);
    const result = await createTimeChartAreaAction(chart.id, {
      name: "",
      daysOfWeek: [weekday],
      startMinute,
      durationMinutes,
      backColor: "#c8e0f0",
      foreColor: "#1b1d23",
      labelEnabled: true,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.id) {
      setSelectedId(result.id);
      setPendingNameFocus(true);
    }
    refresh();
  }

  async function handleEventDrop(arg: EventDropArg) {
    const areaId = arg.event.extendedProps.areaId as string;
    const area = areas.find((a) => a.id === areaId);
    if (!area || !arg.event.start || !arg.event.end) {
      arg.revert();
      return;
    }

    const { startMinute, durationMinutes } = rangeToAreaTiming(
      arg.event.start,
      arg.event.end,
    );
    const newWeekday = weekdayOfTemplateDate(arg.event.start);
    const multiDay = area.daysOfWeek.length > 1;
    const duplicate = arg.jsEvent?.ctrlKey || arg.jsEvent?.metaKey;

    if (duplicate) {
      arg.revert();
      const result = await createTimeChartAreaAction(chart.id, {
        name: area.name,
        daysOfWeek: [newWeekday],
        startMinute,
        durationMinutes,
        resultAreaId: area.resultAreaId,
        labelEnabled: area.labelEnabled,
        foreColor: area.foreColor,
        backColor: area.backColor,
        description: area.description,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.id) {
        setSelectedId(result.id);
        setPendingNameFocus(true);
      }
      refresh();
      return;
    }

    // Single-day areas: moving to another column changes the weekday.
    // Multi-day: only the clock time changes (all days keep the same range).
    const daysOfWeek = multiDay ? area.daysOfWeek : [newWeekday];

    // Optimistic
    setAreas((prev) =>
      prev.map((a) =>
        a.id === areaId ? { ...a, startMinute, durationMinutes, daysOfWeek } : a,
      ),
    );

    const result = await updateTimeChartAreaAction(areaId, {
      startMinute,
      durationMinutes,
      daysOfWeek,
    });
    if (!result.ok) {
      setError(result.error);
      arg.revert();
      refresh();
      return;
    }
    refresh();
  }

  async function handleEventResize(arg: EventResizeDoneArg) {
    const areaId = arg.event.extendedProps.areaId as string;
    if (!arg.event.start || !arg.event.end) {
      arg.revert();
      return;
    }
    const { startMinute, durationMinutes } = rangeToAreaTiming(
      arg.event.start,
      arg.event.end,
    );
    setAreas((prev) =>
      prev.map((a) =>
        a.id === areaId ? { ...a, startMinute, durationMinutes } : a,
      ),
    );
    const result = await updateTimeChartAreaAction(areaId, {
      startMinute,
      durationMinutes,
    });
    if (!result.ok) {
      setError(result.error);
      arg.revert();
      refresh();
      return;
    }
    refresh();
  }

  function handleEventClick(arg: EventClickArg) {
    const areaId = arg.event.extendedProps.areaId as string | undefined;
    if (areaId) {
      setSelectedId(areaId);
      setPendingNameFocus(true);
    }
  }

  async function onPanelChange(patch: Partial<TimeChartArea>) {
    if (!selectedId) return;
    setAreas((prev) =>
      prev.map((a) => (a.id === selectedId ? { ...a, ...patch } : a)),
    );
    const input: Parameters<typeof updateTimeChartAreaAction>[1] = {};
    if (patch.name !== undefined) input.name = patch.name;
    if (patch.daysOfWeek !== undefined) input.daysOfWeek = patch.daysOfWeek;
    if (patch.resultAreaId !== undefined) input.resultAreaId = patch.resultAreaId;
    if (patch.labelEnabled !== undefined) input.labelEnabled = patch.labelEnabled;
    if (patch.foreColor !== undefined) input.foreColor = patch.foreColor;
    if (patch.backColor !== undefined) input.backColor = patch.backColor;
    if (patch.description !== undefined) input.description = patch.description;
    if (Object.keys(input).length === 0) return;
    const result = await updateTimeChartAreaAction(selectedId, input);
    if (!result.ok) {
      setError(result.error);
      refresh();
      return;
    }
    // Soft refresh so schedule tab sees updates when user goes back.
    startTransition(() => router.refresh());
  }

  async function handleDeleteSelected() {
    if (!selectedId) return;
    if (!window.confirm("Delete this Time Chart area?")) return;
    const result = await deleteTimeChartAreaAction(selectedId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSelectedId(null);
    refresh();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <div className="flex flex-none flex-wrap items-center gap-2 border-b border-rule bg-shell px-3 py-1.5 text-[0.8125rem]">
        <button
          type="button"
          className="rounded border border-rule bg-surface px-2 py-1 text-ink hover:bg-surface-raised"
          onClick={goBack}
        >
          ← Back to Schedule
        </button>
        <span className="text-ink-muted">Edit Time Chart</span>
        <input
          className="min-w-[12rem] rounded border border-rule bg-surface px-2 py-1 text-ink"
          value={chartName}
          onChange={(e) => setChartName(e.target.value)}
          onBlur={saveChartName}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          aria-label="Time Chart name"
        />
        <span className="text-ink-faint">
          Template week (Sun–Sat) · drag to create · Ctrl+drag to copy
        </span>
      </div>

      {error && (
        <div className="border-b border-priority-a/30 bg-priority-a/10 px-3 py-1.5 text-[0.8125rem] text-priority-a">
          {error}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => setError(null)}
          >
            dismiss
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="schedule-calendar time-chart-editor min-h-0 min-w-0 flex-1">
          <FullCalendar
            ref={calendarRef}
            plugins={[timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            initialDate={TIME_CHART_TEMPLATE_WEEK_START}
            headerToolbar={false}
            height="100%"
            allDaySlot={false}
            nowIndicator={false}
            editable
            selectable
            selectMirror
            eventStartEditable
            eventDurationEditable
            slotMinTime="00:00:00"
            slotMaxTime="24:00:00"
            slotDuration="00:30:00"
            snapDuration="00:15:00"
            scrollTime="06:00:00"
            weekends
            firstDay={0}
            dayHeaderFormat={{ weekday: "long" }}
            events={events}
            select={handleSelectRange}
            eventClick={handleEventClick}
            eventDrop={handleEventDrop}
            eventResize={handleEventResize}
            eventDidMount={(info) => {
              const bg = String(info.event.backgroundColor ?? "#ccc");
              const label = contrastText(bg);
              info.el.style.color = label;
              const title = info.el.querySelector<HTMLElement>(".fc-event-title");
              if (title) title.style.color = label;
            }}
          />
        </div>

        <aside className="flex w-64 flex-none flex-col border-l border-rule bg-shell">
          <TimeChartAreaPanel
            area={selected}
            nodes={nodes}
            nameInputRef={nameInputRef}
            onChange={onPanelChange}
            onDelete={handleDeleteSelected}
          />
        </aside>
      </div>
    </div>
  );
}
