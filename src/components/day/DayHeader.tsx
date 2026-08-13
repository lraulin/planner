"use client";

import Link from "next/link";
import { shiftDateKey } from "@/lib/schedule/geometry";
import { TabToolbar } from "@/components/tabs/tabChrome";

/**
 * Date navigation and the Day | Week toggle, shared by both views.
 *
 * Navigation is by link rather than client state so a day is a URL: it can be bookmarked,
 * opened in a new tab from the week grid, and gets a fresh server load — which is also what
 * runs carry-over when the day you land on is today.
 */

function shift(day: string, days: number): string {
  return shiftDateKey(day, days);
}

function longDate(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function weekLabel(weekStart: string): string {
  const end = shift(weekStart, 6);
  const fmt = (day: string) =>
    new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  return `${fmt(weekStart)} – ${fmt(end)}`;
}

/** Matches `ToolbarButton`'s look so the nav links sit flush with the rest of the toolbar. */
const navClass =
  "rounded border border-rule px-2 py-1 text-[0.8125rem] leading-none text-ink transition-colors hover:border-rule-strong hover:bg-surface-raised";

export function DayHeader({
  day,
  today,
  mode,
}: {
  /** The day being viewed, or the week's first day in week mode. Both `YYYY-MM-DD`. */
  day: string;
  today: string;
  mode: "day" | "week";
}) {
  const step = mode === "day" ? 1 : 7;
  const href = (target: string) =>
    mode === "day"
      ? `/schedule/day?date=${target}`
      : `/schedule/week-plan?week=${target}`;

  return (
    <TabToolbar>
      {/* Links, not buttons: a day is a URL, so these must be openable in a new tab. Styled
          to match `ToolbarButton`, which renders a real `<button>` and cannot wrap one. */}
      <span className="flex items-center gap-1">
        <Link
          href={href(shift(day, -step))}
          title={mode === "day" ? "Previous day" : "Previous week"}
          aria-label={mode === "day" ? "Previous day" : "Previous week"}
          className={navClass}
        >
          ‹
        </Link>
        <Link href={href(today)} className={navClass}>
          Today
        </Link>
        <Link
          href={href(shift(day, step))}
          title={mode === "day" ? "Next day" : "Next week"}
          aria-label={mode === "day" ? "Next day" : "Next week"}
          className={navClass}
        >
          ›
        </Link>
      </span>

      <span className="text-[0.8125rem] font-medium text-ink">
        {mode === "day" ? longDate(day) : weekLabel(day)}
        {mode === "day" && day === today && (
          <span className="ml-2 text-[0.75rem] text-ink-faint">Today</span>
        )}
      </span>
      {/*
        The Day | Week toggle that used to sit here is gone. Day and Week Plan are pages of
        Schedule now, so the shell's `PageBar` above this row switches between them — along
        with Calendar and Agenda, which this toggle could never reach. What is left is the date
        stepper, which is about *which* day, not which page.
      */}
    </TabToolbar>
  );
}
