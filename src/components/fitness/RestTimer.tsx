"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  readNotifyPermission,
  restDonePayload,
  shouldRequestPermission,
  shouldShowBanner,
} from "@/lib/fitness/restNotify";
import {
  clampRestDuration,
  DEFAULT_REST_SEC,
  formatRestClock,
  nudgeRestDuration,
  remainingUntil,
  REST_PRESETS_SEC,
} from "@/lib/fitness/restTimer";

const STORAGE_KEY = "planner.fitness.restSec";

function isRestDocumentTitle(title: string, base: string): boolean {
  return title === `Rest done · ${base}` || title.endsWith(` rest · ${base}`);
}

function loadPreferredRest(): number {
  if (typeof window === "undefined") return DEFAULT_REST_SEC;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_REST_SEC;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_REST_SEC;
  } catch {
    return DEFAULT_REST_SEC;
  }
}

function playDoneBeep() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    osc.stop(ctx.currentTime + 0.45);
    void ctx.close();
  } catch {
    // Audio is best-effort — never break the workout log.
  }
}

function currentNotifyPermission() {
  return readNotifyPermission(
    typeof Notification === "undefined" ? undefined : Notification,
  );
}

function requestRestNotifyPermission() {
  try {
    if (!shouldRequestPermission(currentNotifyPermission())) return;
    void Notification.requestPermission();
  } catch {
    // Permission is best-effort — never break the workout log.
  }
}

function notifyRestDone() {
  try {
    if (!shouldShowBanner(currentNotifyPermission())) return;
    const { title, body, tag, icon } = restDonePayload();
    const banner = new Notification(title, { body, tag, icon });
    banner.onclick = () => {
      window.focus();
      banner.close();
    };
  } catch {
    // Notifications are best-effort — never break the workout log.
  }
}

/**
 * Sticky rest countdown for the session drawer. Remembers last duration in
 * localStorage. Parent registers start() so finishing a round can kick the timer, passing
 * the group's own rest — which runs without becoming the remembered preference.
 */
export function RestTimer({
  onRegisterStart,
}: {
  onRegisterStart?: (start: (seconds?: number) => void) => void;
}) {
  const [durationSec, setDurationSec] = useState(loadPreferredRest);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(loadPreferredRest);
  const [finished, setFinished] = useState(false);
  const doneFired = useRef(false);

  const persistDuration = useCallback(
    (sec: number) => {
      setDurationSec(sec);
      try {
        window.localStorage.setItem(STORAGE_KEY, String(sec));
      } catch {
        // ignore
      }
      if (!running) {
        setRemaining(sec);
        setFinished(false);
      }
    },
    [running],
  );

  const start = useCallback(
    (seconds?: number) => {
      // A group's rest is a property of that group, not a new default for the session.
      const sec = clampRestDuration(seconds ?? durationSec);
      doneFired.current = false;
      setFinished(false);
      setEndsAt(Date.now() + sec * 1000);
      setRunning(true);
      setRemaining(sec);
      requestRestNotifyPermission();
    },
    [durationSec],
  );

  useEffect(() => {
    onRegisterStart?.(start);
  }, [onRegisterStart, start]);

  useEffect(() => {
    if (!running || endsAt == null) return;
    const tick = () => {
      const left = remainingUntil(endsAt, Date.now());
      setRemaining(left);
      if (left <= 0) {
        setRunning(false);
        setEndsAt(null);
        setFinished(true);
        if (!doneFired.current) {
          doneFired.current = true;
          playDoneBeep();
          notifyRestDone();
        }
      }
    };
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [running, endsAt]);

  // Show rest countdown in the browser tab while active (or just finished).
  const baseTitleRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof document === "undefined") return;

    if (!running && !finished) {
      if (baseTitleRef.current !== null) {
        document.title = baseTitleRef.current;
        baseTitleRef.current = null;
      }
      return;
    }

    if (baseTitleRef.current === null) {
      baseTitleRef.current = document.title;
    }

    const clock = formatRestClock(running ? remaining : 0);
    document.title = finished
      ? `Rest done · ${baseTitleRef.current}`
      : `${clock} rest · ${baseTitleRef.current}`;
  }, [running, finished, remaining]);

  // Restore the original title if the timer unmounts mid-countdown (drawer close).
  // Leave the title alone if something else already replaced it — navigating away
  // unmounts this timer after `DocumentTitle` has written the new page's name, and
  // restoring the session title would put "Sessions · Planner" on Tasks.
  useEffect(() => {
    return () => {
      if (baseTitleRef.current !== null && typeof document !== "undefined") {
        if (isRestDocumentTitle(document.title, baseTitleRef.current)) {
          document.title = baseTitleRef.current;
        }
        baseTitleRef.current = null;
      }
    };
  }, []);

  function pause() {
    if (!running) return;
    setRunning(false);
    setEndsAt(null);
  }

  function reset() {
    setRunning(false);
    setEndsAt(null);
    setRemaining(durationSec);
    setFinished(false);
    doneFired.current = false;
  }

  const display =
    running || remaining < durationSec || finished ? remaining : durationSec;

  return (
    <div className="flex flex-none flex-col gap-2 border-t border-rule bg-shell/80 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
            Rest
          </div>
          <div
            className={`font-mono text-2xl tabular-nums ${
              finished ? "text-priority-a" : running ? "text-ink" : "text-ink-muted"
            }`}
          >
            {formatRestClock(display)}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {!running ? (
            <button
              type="button"
              onClick={() => start()}
              className="rounded bg-ink px-3 py-1.5 text-[0.8125rem] font-medium text-surface"
            >
              Start
            </button>
          ) : (
            <button
              type="button"
              onClick={pause}
              className="rounded border border-rule bg-surface px-3 py-1.5 text-[0.8125rem] text-ink"
            >
              Pause
            </button>
          )}
          <button
            type="button"
            onClick={reset}
            className="rounded border border-rule bg-surface px-3 py-1.5 text-[0.8125rem] text-ink-muted hover:text-ink"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {REST_PRESETS_SEC.map((sec) => (
          <button
            key={sec}
            type="button"
            onClick={() => {
              persistDuration(sec);
              if (running) {
                doneFired.current = false;
                setFinished(false);
                setEndsAt(Date.now() + sec * 1000);
                setRemaining(sec);
              }
            }}
            className={`rounded px-2 py-0.5 font-mono text-[0.75rem] ${
              durationSec === sec
                ? "bg-ink text-surface"
                : "border border-rule text-ink-muted hover:text-ink"
            }`}
          >
            {sec >= 60 ? `${sec / 60}m` : `${sec}s`}
          </button>
        ))}
        <button
          type="button"
          onClick={() => persistDuration(nudgeRestDuration(durationSec, -1))}
          className="rounded border border-rule px-1.5 py-0.5 text-[0.75rem] text-ink-muted hover:text-ink"
          title="−15s"
        >
          −15
        </button>
        <button
          type="button"
          onClick={() => persistDuration(nudgeRestDuration(durationSec, 1))}
          className="rounded border border-rule px-1.5 py-0.5 text-[0.75rem] text-ink-muted hover:text-ink"
          title="+15s"
        >
          +15
        </button>
      </div>
    </div>
  );
}
