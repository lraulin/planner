"use client";

import { useEffect, useMemo, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { type EventReceiveArg } from "@fullcalendar/interaction";
import type {
  DateSelectArg,
  EventClickArg,
  EventDropArg,
  EventInput,
} from "@fullcalendar/core";
import type { AppointmentCheck } from "@/db/schema";
import type { Occurrence } from "@/lib/schedule/recurrence";
import { contrastText } from "@/lib/schedule/geometry";
import {
  checkStateLabel,
  checkStateMark,
  nextCheckState,
} from "@/lib/schedule/checkState";

type BackgroundEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  backgroundColor: string;
  textColor: string;
  display: "background";
};

type Props = {
  weekStart: Date;
  /** Set to render a single day instead of the week — the compact layout. */
  singleDay?: Date;
  backgroundEvents: BackgroundEvent[];
  occurrences: Occurrence[];
  onSelectRange: (start: Date, end: Date) => void;
  onEventClick: (occ: Occurrence) => void;
  onEventDrop: (
    id: string,
    start: Date,
    end: Date,
    opts: { duplicate: boolean },
  ) => void;
  onExternalDrop: (
    projectId: string,
    projectName: string,
    start: Date,
    durationMinutes: number,
  ) => void;
  onCycleCheck: (id: string, next: AppointmentCheck) => void;
};

export function WeekCalendar({
  weekStart,
  singleDay,
  backgroundEvents,
  occurrences,
  onSelectRange,
  onEventClick,
  onEventDrop,
  onExternalDrop,
  onCycleCheck,
}: Props) {
  const ctrlDown = useRef(false);
  // Keep latest callback for FullCalendar-held eventContent closures.
  const onCycleCheckRef = useRef(onCycleCheck);
  useEffect(() => {
    onCycleCheckRef.current = onCycleCheck;
  }, [onCycleCheck]);

  const occByKey = useMemo(() => {
    const m = new Map<string, Occurrence>();
    for (const o of occurrences) m.set(o.occurrenceKey, o);
    return m;
  }, [occurrences]);

  const events: EventInput[] = useMemo(() => {
    const bg: EventInput[] = backgroundEvents.map((e) => {
      const label = contrastText(e.backgroundColor);
      return {
        id: e.id,
        title: e.title,
        start: e.start,
        end: e.end,
        display: "background" as const,
        backgroundColor: e.backgroundColor,
        borderColor: e.backgroundColor,
        textColor: label,
        editable: false,
        classNames: ["fc-timechart-bg"],
        extendedProps: { labelColor: label },
      };
    });

    const appts: EventInput[] = occurrences.map((o) => {
      const doneOrMissed = o.checkState !== "open";
      return {
        id: o.occurrenceKey,
        title: o.subject || "(no subject)",
        start: o.startAt,
        end: o.endAt,
        allDay: o.allDay,
        backgroundColor: doneOrMissed ? "#e8e8e8" : "#ffffff",
        borderColor: o.checkState === "missed" ? "#a05050" : "#2a5a8a",
        textColor: "#1b1d23",
        classNames: [
          "fc-appointment",
          o.checkState === "done" ? "fc-appointment-done" : "",
          o.checkState === "missed" ? "fc-appointment-missed" : "",
          o.projectId ? "fc-appointment-project" : "",
        ].filter(Boolean),
        extendedProps: {
          appointmentId: o.id,
          projectId: o.projectId,
          isRecurring: o.isRecurring,
          checkState: o.checkState,
        },
      };
    });

    return [...bg, ...appts];
  }, [backgroundEvents, occurrences]);

  return (
    <div
      className="schedule-calendar h-full min-h-0"
      onKeyDown={(e) => {
        if (e.key === "Control" || e.key === "Meta") ctrlDown.current = true;
      }}
      onKeyUp={(e) => {
        if (e.key === "Control" || e.key === "Meta") ctrlDown.current = false;
      }}
    >
      {/*
       * `singleDay` switches to a one-day column below `md`. Seven days × 24 hours at 390px
       * is 55px per day — not a calendar, a texture. The key carries the view so a change of
       * breakpoint remounts rather than leaving FullCalendar on the old one.
       */}
      <FullCalendar
        key={`${singleDay ? "day" : "week"}:${(singleDay ?? weekStart).toISOString()}`}
        plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
        initialView={singleDay ? "timeGridDay" : "timeGridWeek"}
        initialDate={singleDay ?? weekStart}
        headerToolbar={false}
        height="100%"
        allDaySlot
        nowIndicator
        editable
        selectable
        selectMirror
        droppable
        eventStartEditable
        eventDurationEditable
        slotMinTime="00:00:00"
        slotMaxTime="24:00:00"
        slotDuration="00:30:00"
        snapDuration="00:15:00"
        scrollTime="07:00:00"
        weekends
        firstDay={0}
        dayHeaderFormat={{ weekday: "long", month: "short", day: "numeric" }}
        events={events}
        eventContent={(arg) => {
          if (arg.event.display === "background") {
            return <div className="fc-event-title fc-sticky">{arg.event.title}</div>;
          }

          const state =
            (arg.event.extendedProps.checkState as AppointmentCheck) ?? "open";
          const appointmentId = arg.event.extendedProps.appointmentId as string;
          const mark = checkStateMark(state);

          return (
            <div className="fc-appt-inner">
              <button
                type="button"
                className="fc-appt-check"
                data-check="1"
                title={`Status: ${checkStateLabel(state)}. Click to cycle open → done → missed.`}
                aria-label={`Status: ${checkStateLabel(state)}. Click to cycle.`}
                onPointerDown={(e) => {
                  // Prevent FullCalendar from starting an event drag on the checkbox.
                  e.stopPropagation();
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onCycleCheckRef.current(appointmentId, nextCheckState(state));
                }}
              >
                {mark}
              </button>
              <span className="fc-event-title">{arg.event.title}</span>
            </div>
          );
        }}
        eventDidMount={(info) => {
          if (info.event.display !== "background") return;
          const label =
            (info.event.extendedProps.labelColor as string | undefined) ??
            info.event.textColor ??
            contrastText(String(info.event.backgroundColor ?? "#ccc"));
          info.el.style.color = label;
          info.el.style.setProperty("--fc-event-text-color", label);
          const title = info.el.querySelector<HTMLElement>(".fc-event-title");
          if (title) title.style.color = label;
        }}
        select={(arg: DateSelectArg) => {
          onSelectRange(arg.start, arg.end);
          arg.view.calendar.unselect();
        }}
        eventClick={(arg: EventClickArg) => {
          if (arg.event.display === "background") return;
          // Checkbox handles itself via React onClick; don't open the drawer.
          const t = arg.jsEvent.target as HTMLElement | null;
          if (t?.closest?.("[data-check], .fc-appt-check")) return;
          const occ = occByKey.get(arg.event.id);
          if (occ) onEventClick(occ);
        }}
        eventDrop={(arg: EventDropArg) => {
          const id = arg.event.extendedProps.appointmentId as string;
          if (!arg.event.start || !arg.event.end) {
            arg.revert();
            return;
          }
          const duplicate =
            arg.jsEvent?.ctrlKey || arg.jsEvent?.metaKey || ctrlDown.current;
          if (duplicate) {
            arg.revert();
            onEventDrop(id, arg.event.start, arg.event.end, { duplicate: true });
          } else {
            onEventDrop(id, arg.event.start, arg.event.end, { duplicate: false });
          }
        }}
        eventResize={(arg) => {
          const id = arg.event.extendedProps.appointmentId as string;
          if (!arg.event.start || !arg.event.end) {
            arg.revert();
            return;
          }
          onEventDrop(id, arg.event.start, arg.event.end, { duplicate: false });
        }}
        eventReceive={(arg: EventReceiveArg) => {
          const projectId = arg.event.extendedProps.projectId as string | undefined;
          const projectName = arg.event.title;
          const duration =
            (arg.event.extendedProps.durationMinutes as number | undefined) ?? 60;
          if (!projectId || !arg.event.start) {
            arg.revert();
            return;
          }
          arg.event.remove();
          onExternalDrop(projectId, projectName, arg.event.start, duration);
        }}
      />
    </div>
  );
}
