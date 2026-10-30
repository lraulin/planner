"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  completeReminderAction,
  dismissAllRemindersAction,
  dismissReminderAction,
  snoozeReminderAction,
  type PanelReminder,
} from "@/app/reminderActions";
import { ModalShell } from "@/components/detail/ModalShell";
import { ReminderBellIcon } from "@/components/icons/commandIcons";
import { TypeIcon } from "@/components/icons/TypeIcon";
import { FinancesIcon, ScheduleIcon } from "@/components/shell/navIcons";
import { useNavigate } from "@/components/shell/useNavigate";
import { useIsCompact } from "@/components/shell/useIsCompact";
import { useToast } from "@/components/shell/ToastProvider";
import { SNOOZE_CHOICES, SNOOZE_LABELS } from "@/lib/reminders/derive";
import { dueLabel, reminderOpenHref, viewTasksHref } from "@/lib/reminders/targets";
import { useReminders } from "./RemindersProvider";

/**
 * Achieve's Reminders window: everything that has come due and not been dealt with, newest
 * first, each with what you can do about it — Complete, Open, View tasks (project blocks),
 * Snooze, Dismiss — plus Dismiss all.
 *
 * A popover under the menu bar on desktop; a bottom sheet on the phone, which is also where a
 * tapped push lands (`?reminders=open`), and so where Complete happens on iPhone.
 */
export function RemindersPanel() {
  const { open, setOpen } = useReminders();
  const compact = useIsCompact();
  const titleId = useId();

  if (compact) {
    return (
      <ModalShell open={open} onClose={() => setOpen(false)} labelledBy={titleId}>
        <PanelBody titleId={titleId} />
      </ModalShell>
    );
  }
  return open ? <Popover titleId={titleId} onClose={() => setOpen(false)} /> : null;
}

function Popover({ titleId, onClose }: { titleId: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Element | null;
      // The bell toggles the panel itself; closing here first would reopen it on the click.
      if (target?.closest("[data-reminders-bell]")) return;
      if (ref.current && !ref.current.contains(target)) onClose();
    }
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="fixed top-11 right-3 z-[60] flex max-h-[70vh] w-[28rem] flex-col overflow-hidden rounded-lg border border-rule-strong bg-surface shadow-2xl outline-none"
    >
      <PanelBody titleId={titleId} />
    </div>
  );
}

function PanelBody({ titleId }: { titleId: string }) {
  const { reminders, loaded, removeAll, refresh } = useReminders();
  const toast = useToast();
  const [now, setNow] = useState(() => new Date());

  // "due 3 min ago" keeps itself honest while the panel is open.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function dismissAll() {
    removeAll();
    const result = await dismissAllRemindersAction();
    if (!result.ok) {
      toast.error("Could not dismiss reminders", { body: result.error });
      await refresh();
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-rule bg-surface-raised px-4 py-2.5">
        <h2 id={titleId} className="flex-1 text-[0.875rem] font-semibold text-ink">
          Reminders
        </h2>
        {reminders.length > 1 && (
          <button
            type="button"
            onClick={() => void dismissAll()}
            className="min-h-tap rounded px-2 text-[0.8125rem] text-ink-muted hover:bg-surface hover:text-ink md:min-h-0 md:py-1"
          >
            Dismiss all
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {reminders.length === 0 ? (
          <p className="px-4 py-8 text-center text-[0.875rem] text-ink-muted">
            {loaded ? "Nothing has come due." : "Loading…"}
          </p>
        ) : (
          <ul className="divide-y divide-rule">
            {reminders.map((reminder) => (
              <ReminderRow key={reminder.id} reminder={reminder} now={now} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const ACTION =
  "min-h-tap rounded border border-rule px-2.5 text-[0.8125rem] text-ink transition-colors hover:border-rule-strong hover:bg-surface-raised disabled:opacity-40 md:min-h-0 md:py-1";

function ReminderRow({ reminder, now }: { reminder: PanelReminder; now: Date }) {
  const { remove, refresh, setOpen } = useReminders();
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const completable =
    reminder.sourceKind === "task" ||
    reminder.sourceKind === "project" ||
    reminder.sourceKind === "appointment";

  async function act(
    work: () => Promise<{ ok: true } | { ok: false; error: string }>,
    failure: string,
  ) {
    setBusy(true);
    remove(reminder.id);
    const result = await work();
    setBusy(false);
    if (!result.ok) {
      toast.error(failure, { body: result.error });
      await refresh();
    }
  }

  function go(href: string) {
    setOpen(false);
    navigate(href);
  }

  const { blockProjectId } = reminder;

  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex-none text-ink-muted" aria-hidden>
          <KindGlyph kind={reminder.sourceKind} />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-[0.875rem] font-medium text-ink"
            title={reminder.title}
          >
            {reminder.title}
          </p>
          <p className="truncate text-[0.75rem] text-ink-muted">
            {dueLabel(reminder.sourceKind, reminder.dueAt, now)}
            {reminder.detail ? ` · ${reminder.detail}` : ""}
          </p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5 pl-7">
        {completable && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void act(
                () => completeReminderAction(reminder.id),
                "Could not complete it",
              )
            }
            className={`${ACTION} border-select-edge/60 font-medium`}
          >
            Complete
          </button>
        )}
        <button
          type="button"
          onClick={() => go(reminderOpenHref(reminder))}
          className={ACTION}
        >
          Open
        </button>
        {blockProjectId && (
          <button
            type="button"
            onClick={() => go(viewTasksHref(blockProjectId))}
            className={ACTION}
          >
            View tasks
          </button>
        )}
        <label className="relative">
          <span className="sr-only">Snooze</span>
          <select
            disabled={busy}
            value=""
            onChange={(event) => {
              const choice = event.target.value;
              if (choice) {
                void act(
                  () => snoozeReminderAction(reminder.id, choice),
                  "Could not snooze it",
                );
              }
            }}
            className={`${ACTION} appearance-none bg-surface pr-6`}
          >
            <option value="">Snooze…</option>
            {SNOOZE_CHOICES.map((choice) => (
              <option key={choice} value={choice}>
                {SNOOZE_LABELS[choice]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void act(() => dismissReminderAction(reminder.id), "Could not dismiss it")
          }
          className={`${ACTION} text-ink-muted`}
        >
          Dismiss
        </button>
      </div>
    </li>
  );
}

/** What the reminder is about, at a glance: the node type, a calendar, or money. */
function KindGlyph({ kind }: { kind: PanelReminder["sourceKind"] }) {
  if (kind === "task" || kind === "project") {
    return <TypeIcon kind={kind} className="h-4 w-4" />;
  }
  return (
    <span className="inline-flex h-4 w-4 items-center justify-center [&_svg]:h-4 [&_svg]:w-4">
      {kind === "appointment" ? <ScheduleIcon /> : <FinancesIcon />}
    </span>
  );
}

/** The bell, with a count. Desktop: the menu-bar row. Phone: the header. */
export function RemindersBell({ className = "" }: { className?: string }) {
  const { reminders, open, setOpen } = useReminders();
  const count = reminders.length;
  const label = count === 0 ? "Reminders" : `Reminders — ${count} waiting`;
  return (
    <button
      type="button"
      data-reminders-bell
      aria-expanded={open}
      aria-label={label}
      title={label}
      onClick={() => setOpen(!open)}
      className={`relative flex flex-none items-center justify-center rounded transition-colors ${
        open
          ? "bg-select text-ink"
          : count > 0
            ? "text-ink hover:bg-surface-raised"
            : "text-ink-faint hover:bg-surface-raised hover:text-ink"
      } ${className}`}
    >
      <ReminderBellIcon />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-priority-a px-1 font-mono text-[0.625rem] leading-none font-semibold text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}
