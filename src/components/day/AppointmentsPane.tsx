"use client";

import Link from "next/link";
import type { AppointmentCheck } from "@/db/schema";

/**
 * The day's appointments, read-only.
 *
 * The left column of Franklin Covey's day page. It is a list rather than an hour grid on
 * purpose: the Weekly Schedule tab already owns time-block editing, and duplicating a
 * calendar here would mean two places to drag a block to and two ways for them to disagree.
 * Editing goes to the Schedule tab.
 */

export type DayAppointment = {
  id: string;
  subject: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  checkState: AppointmentCheck;
};

function timeLabel(date: Date): string {
  return date
    .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    .replace(":00", "");
}

export function AppointmentsPane({
  appointments,
  weekKey,
}: {
  appointments: DayAppointment[];
  weekKey: string;
}) {
  return (
    <section
      aria-label="Appointments"
      className="flex min-h-0 w-56 flex-none flex-col border-r border-rule"
    >
      <header className="flex flex-none items-baseline justify-between border-b border-rule px-3 py-1.5">
        <h2 className="text-[0.75rem] font-semibold tracking-wide text-ink-muted uppercase">
          Appointments
        </h2>
        <Link
          href={`/schedule?week=${weekKey}`}
          className="text-[0.6875rem] text-ink-faint hover:text-ink"
        >
          Schedule
        </Link>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
        {appointments.length === 0 ? (
          <p className="text-[0.8125rem] text-ink-faint">Nothing scheduled.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {appointments.map((appointment) => (
              <li key={appointment.id} className="flex gap-2 text-[0.8125rem]">
                <span className="tabular w-16 flex-none text-ink-faint">
                  {appointment.allDay ? "All day" : timeLabel(appointment.startAt)}
                </span>
                <span
                  className={
                    appointment.checkState === "done"
                      ? "truncate text-ink-faint line-through"
                      : "truncate text-ink"
                  }
                  title={appointment.subject}
                >
                  {appointment.subject}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
