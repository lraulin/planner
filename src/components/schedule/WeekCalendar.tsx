"use client";

import { useMemo, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, {
  type DateClickArg,
  type EventReceiveArg,
} from "@fullcalendar/interaction";
import type {
  DateSelectArg,
  EventClickArg,
  EventDropArg,
  EventInput,
} from "@fullcalendar/core";
import type { Occurrence } from "@/lib/schedule/recurrence";

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
};

export function WeekCalendar({
  weekStart,
  backgroundEvents,
  occurrences,
  onSelectRange,
  onEventClick,
  onEventDrop,
  onExternalDrop,
}: Props) {
  const ctrlDown = useRef(false);
  const occByKey = useMemo(() => {
    const m = new Map<string, Occurrence>();
    for (const o of occurrences) m.set(o.occurrenceKey, o);
    return m;
  }, [occurrences]);

  const events: EventInput[] = useMemo(() => {
    const bg: EventInput[] = backgroundEvents.map((e) => ({
      id: e.id,
      title: e.title,
      start: e.start,
      end: e.end,
      display: "background",
      backgroundColor: e.backgroundColor,
      borderColor: e.backgroundColor,
      textColor: e.textColor,
      editable: false,
      classNames: ["fc-timechart-bg"],
    }));

    const appts: EventInput[] = occurrences.map((o) => ({
      id: o.occurrenceKey,
      title: o.subject || "(no subject)",
      start: o.startAt,
      end: o.endAt,
      allDay: o.allDay,
      backgroundColor: o.completed ? "#e8e8e8" : "#ffffff",
      borderColor: "#2a5a8a",
      textColor: "#1b1d23",
      classNames: [
        "fc-appointment",
        o.completed ? "fc-appointment-done" : "",
        o.projectId ? "fc-appointment-project" : "",
      ].filter(Boolean),
      extendedProps: {
        appointmentId: o.id,
        projectId: o.projectId,
        isRecurring: o.isRecurring,
      },
    }));

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
      <FullCalendar
        key={weekStart.toISOString()}
        plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        initialDate={weekStart}
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
        select={(arg: DateSelectArg) => {
          onSelectRange(arg.start, arg.end);
          arg.view.calendar.unselect();
        }}
        eventClick={(arg: EventClickArg) => {
          if (arg.event.display === "background") return;
          const occ = occByKey.get(arg.event.id);
          if (occ) onEventClick(occ);
        }}
        eventDrop={(arg: EventDropArg) => {
          const id = arg.event.extendedProps.appointmentId as string;
          if (!arg.event.start || !arg.event.end) {
            arg.revert();
            return;
          }
          const duplicate = arg.jsEvent?.ctrlKey || arg.jsEvent?.metaKey || ctrlDown.current;
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
          // Remove the temporary received event; we create via server action.
          arg.event.remove();
          onExternalDrop(projectId, projectName, arg.event.start, duration);
        }}
        dateClick={(_arg: DateClickArg) => {
          /* selection handles create */
        }}
      />
    </div>
  );
}
