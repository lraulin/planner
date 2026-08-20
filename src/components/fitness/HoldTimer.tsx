"use client";

import { useEffect, useState } from "react";
import { elapsedSince, formatDurationClock } from "@/lib/fitness/duration";

/**
 * Count-up stopwatch for one timed set. The parent owns `startedAt` so only one row can
 * run at a time and closing the drawer cannot leave a timer behind; this component only
 * renders the tick.
 *
 * Elapsed is computed from the wall clock rather than accumulated per tick, so the count
 * stays true when the phone backgrounds the tab and the interval stops firing.
 */
export function HoldTimer({
  startedAt,
  onStart,
  onStop,
}: {
  /** Wall-clock ms when this row's hold began, or null when it is not running. */
  startedAt: number | null;
  onStart: () => void;
  /** The parent owns `startedAt`, so it records the elapsed time itself. */
  onStop: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAt == null) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const running = startedAt != null;
  // `now` is whatever the last tick left behind, so a freshly started hold reads 0:00
  // until the first interval fires — which is what a stopwatch should show anyway.
  const elapsed = running ? elapsedSince(startedAt, now) : 0;

  return (
    <button
      type="button"
      onClick={() => (running ? onStop() : onStart())}
      title={running ? "Stop and record the hold" : "Time this hold"}
      aria-label={running ? "Stop and record the hold" : "Time this hold"}
      className={`flex h-7 shrink-0 items-center justify-center rounded border font-mono text-[0.75rem] ${
        running
          ? "min-w-[3.25rem] border-ink bg-ink px-1.5 text-surface"
          : "w-7 border-rule bg-surface text-ink-muted hover:text-ink"
      }`}
    >
      {running ? formatDurationClock(elapsed) : "⏱"}
    </button>
  );
}
