"use client";

import { useCallback, useEffect, useId, useState, useTransition } from "react";
import {
  loadNotificationSettingsAction,
  removeDeviceAction,
  saveNotificationPrefsAction,
  sendTestNotificationAction,
  subscribeDeviceAction,
  unsubscribeEndpointAction,
  type NotificationSettings,
} from "@/app/settings/notificationActions";
import {
  currentSubscription,
  needsHomeScreenInstall,
  pushSupported,
  subscribeThisDevice,
  unsubscribeThisDevice,
} from "@/components/reminders/pushClient";
import { useToast } from "@/components/shell/ToastProvider";
import { minuteOfDayLabel, parseMinuteOfDay } from "@/lib/schedule/zonedTime";
import {
  PROJECT_BLOCK_LEADS,
  type NotificationPrefs,
  type ProjectBlockLead,
} from "@/lib/settings/notifications";

/**
 * Settings → Notifications: which devices receive reminders, and what reminds you when.
 *
 * Loaded when the section opens rather than with the Settings page, so the other sections pay
 * nothing for it. Preferences save as they change and re-arm the week ahead on the server, so
 * a switch flipped here applies to today's reminders, not tomorrow's.
 */
export function NotificationsPanel() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback(
    (result: Awaited<ReturnType<typeof loadNotificationSettingsAction>>) => {
      if (result.ok) setSettings(result.data);
      else setError(result.error);
    },
    [],
  );
  const reload = useCallback(
    () => loadNotificationSettingsAction().then(apply),
    [apply],
  );

  useEffect(() => {
    void loadNotificationSettingsAction().then(apply);
  }, [apply]);

  if (error) {
    return <p className="text-[0.8125rem] text-priority-a">{error}</p>;
  }
  if (!settings) {
    return <p className="text-[0.8125rem] text-ink-muted">Loading…</p>;
  }
  return (
    <>
      <DevicesSection settings={settings} reload={reload} />
      <PreferencesSection
        prefs={settings.prefs}
        onSaved={(prefs) => setSettings({ ...settings, prefs })}
      />
    </>
  );
}

const BUTTON =
  "min-h-tap rounded border border-rule px-3 py-1.5 text-[0.8125rem] text-ink transition-colors hover:border-rule-strong hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40 md:min-h-0";

function Heading({ id, title }: { id: string; title: string }) {
  return (
    <div className="border-b border-rule bg-surface-raised px-4 py-2.5">
      <h2
        id={id}
        className="text-[0.75rem] font-semibold tracking-wider text-ink-muted uppercase"
      >
        {title}
      </h2>
    </div>
  );
}

type DeviceState =
  | { kind: "checking" }
  | { kind: "unsupported" }
  | { kind: "install" }
  | { kind: "blocked" }
  | { kind: "off" }
  | { kind: "on"; endpoint: string };

function DevicesSection({
  settings,
  reload,
}: {
  settings: NotificationSettings;
  reload: () => Promise<void>;
}) {
  const headingId = useId();
  const toast = useToast();
  const [busy, startTransition] = useTransition();
  const [device, setDevice] = useState<DeviceState>({ kind: "checking" });

  useEffect(() => {
    let cancelled = false;
    async function check(): Promise<DeviceState> {
      if (needsHomeScreenInstall()) return { kind: "install" };
      if (!pushSupported()) return { kind: "unsupported" };
      if (Notification.permission === "denied") return { kind: "blocked" };
      const subscription = await currentSubscription();
      return subscription && settings.endpoints.includes(subscription.endpoint)
        ? { kind: "on", endpoint: subscription.endpoint }
        : { kind: "off" };
    }
    void check().then((state) => {
      if (!cancelled) setDevice(state);
    });
    return () => {
      cancelled = true;
    };
  }, [settings.endpoints]);

  function enable() {
    const key = settings.vapidPublicKey;
    if (!key) return;
    startTransition(async () => {
      try {
        const keys = await subscribeThisDevice(key);
        const result = await subscribeDeviceAction(keys);
        if (!result.ok) throw new Error(result.error);
        toast.success("Notifications are on for this device");
        await reload();
      } catch (error) {
        toast.error("Could not turn notifications on", {
          body: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }

  function disable() {
    startTransition(async () => {
      const endpoint = await unsubscribeThisDevice();
      if (endpoint) await unsubscribeEndpointAction(endpoint);
      await reload();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await removeDeviceAction(id);
      if (!result.ok)
        toast.error("Could not remove the device", { body: result.error });
      await reload();
    });
  }

  function test() {
    startTransition(async () => {
      const result = await sendTestNotificationAction();
      if (!result.ok) {
        toast.error("Could not send a test", { body: result.error });
      } else if (!result.data || result.data.sent === 0) {
        toast.warning("Nothing was delivered", {
          body: "No device accepted the test. Enable notifications on a device first.",
        });
      } else {
        toast.success(
          `Sent to ${result.data.sent} device${result.data.sent === 1 ? "" : "s"}`,
        );
      }
      await reload();
    });
  }

  return (
    <section aria-labelledby={headingId} className="rounded border border-rule">
      <Heading id={headingId} title="Devices" />
      <div className="space-y-3 px-4 py-3 text-[0.8125rem]">
        {!settings.vapidPublicKey ? (
          <p className="text-ink-muted">
            This server has no push keys (<span className="font-mono">VAPID_*</span>),
            so it cannot send notifications. Reminders still collect in the Reminders
            panel.
          </p>
        ) : (
          <ThisDevice
            state={device}
            busy={busy}
            onEnable={enable}
            onDisable={disable}
          />
        )}

        {settings.devices.length > 0 && (
          <ul className="divide-y divide-rule rounded border border-rule">
            {settings.devices.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-ink">{entry.label || "Device"}</p>
                  <p className="text-[0.75rem] text-ink-faint">
                    {entry.lastSuccessAt
                      ? `Last delivered ${new Date(entry.lastSuccessAt).toLocaleString()}`
                      : `Added ${new Date(entry.createdAt).toLocaleDateString()}`}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(entry.id)}
                  className={BUTTON}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          disabled={busy || settings.devices.length === 0}
          onClick={test}
          className={BUTTON}
        >
          Send test notification
        </button>
      </div>
    </section>
  );
}

function ThisDevice({
  state,
  busy,
  onEnable,
  onDisable,
}: {
  state: DeviceState;
  busy: boolean;
  onEnable: () => void;
  onDisable: () => void;
}) {
  switch (state.kind) {
    case "checking":
      return <p className="text-ink-muted">Checking this device…</p>;
    case "install":
      return (
        <p className="leading-relaxed text-ink-muted">
          On iPhone, notifications reach Planner only from the Home Screen. In Safari,
          tap <strong className="text-ink">Share → Add to Home Screen</strong>, open
          Planner from that icon, and come back here to turn them on.
        </p>
      );
    case "unsupported":
      return (
        <p className="text-ink-muted">
          This browser cannot receive push notifications.
        </p>
      );
    case "blocked":
      return (
        <p className="text-ink-muted">
          Notifications are blocked for Planner in this browser&apos;s settings. Allow
          them there, then reload this page.
        </p>
      );
    case "off":
      return (
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1 text-ink-muted">
            This device does not receive reminders.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={onEnable}
            className={`${BUTTON} border-select-edge/60 font-medium`}
          >
            Enable on this device
          </button>
        </div>
      );
    case "on":
      return (
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1 text-ink">This device receives reminders.</p>
          <button type="button" disabled={busy} onClick={onDisable} className={BUTTON}>
            Turn off here
          </button>
        </div>
      );
  }
}

const LEAD_LABELS: Record<string, string> = {
  null: "Off",
  0: "When it starts",
  5: "5 min before",
  10: "10 min before",
  15: "15 min before",
};

function PreferencesSection({
  prefs,
  onSaved,
}: {
  prefs: NotificationPrefs;
  onSaved: (prefs: NotificationPrefs) => void;
}) {
  const headingId = useId();
  const toast = useToast();
  const [draft, setDraft] = useState(prefs);
  const [, startTransition] = useTransition();

  function save(next: NotificationPrefs) {
    setDraft(next);
    startTransition(async () => {
      const result = await saveNotificationPrefsAction(next);
      if (result.ok) onSaved(next);
      else toast.error("Could not save notification settings", { body: result.error });
    });
  }

  const toggles: { key: keyof NotificationPrefs; label: string; hint: string }[] = [
    {
      key: "tasks",
      label: "Task and project reminders",
      hint: "The Reminder date and time on a task or project.",
    },
    {
      key: "appointments",
      label: "Appointments and project blocks",
      hint: "Appointments with a reminder set here, and blocks of project time.",
    },
    {
      key: "bills",
      label: "Bills not yet charged",
      hint: "On a bill's expected day, at the morning time, if no charge has landed.",
    },
    {
      key: "readyToAssign",
      label: "Ready to Assign goes negative",
      hint: "After an import, bank sync or alert email — not while you edit the budget.",
    },
  ];

  return (
    <section aria-labelledby={headingId} className="mt-4 rounded border border-rule">
      <Heading id={headingId} title="What reminds you" />
      <div className="space-y-4 px-4 py-3 text-[0.8125rem]">
        <div className="space-y-2">
          {toggles.map(({ key, label, hint }) => (
            <label key={key} className="flex min-h-tap items-start gap-3 md:min-h-0">
              <input
                type="checkbox"
                checked={draft[key] as boolean}
                onChange={(event) => save({ ...draft, [key]: event.target.checked })}
                className="mt-0.5 h-4 w-4 flex-none accent-[var(--select-edge)]"
              />
              <span>
                <span className="block text-ink">{label}</span>
                <span className="block text-[0.75rem] text-ink-muted">{hint}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="border-t border-rule pt-3">
          <label className="flex min-h-tap items-start gap-3 md:min-h-0">
            <input
              type="checkbox"
              checked={draft.autoReminder}
              onChange={(event) =>
                save({ ...draft, autoReminder: event.target.checked })
              }
              className="mt-0.5 h-4 w-4 flex-none accent-[var(--select-edge)]"
            />
            <span>
              <span className="block text-ink">Set a reminder from a deadline</span>
              <span className="block text-[0.75rem] text-ink-muted">
                Achieve&apos;s auto-set reminder. A reminder you set yourself is never
                changed.
              </span>
            </span>
          </label>
          <div className="mt-2 flex flex-wrap items-start gap-3 pl-7">
            <label className="block">
              <span className="block text-ink">Days before</span>
              <input
                type="number"
                min={0}
                max={30}
                inputMode="numeric"
                disabled={!draft.autoReminder}
                defaultValue={draft.autoReminderDays}
                onBlur={(event) => {
                  const days = Math.round(Number(event.target.value));
                  if (Number.isFinite(days) && days !== draft.autoReminderDays) {
                    save({
                      ...draft,
                      autoReminderDays: Math.min(30, Math.max(0, days)),
                    });
                  }
                }}
                className="mt-1 min-h-tap w-20 rounded border border-rule bg-surface px-2 py-1 text-base text-ink disabled:opacity-40 md:min-h-0 md:text-[0.8125rem]"
              />
            </label>
            <TimeInput
              label="At"
              disabled={!draft.autoReminder}
              minute={draft.autoReminderMinute}
              onChange={(autoReminderMinute) => save({ ...draft, autoReminderMinute })}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-4 border-t border-rule pt-3">
          <label className="block">
            <span className="block text-ink">Project blocks alert</span>
            <select
              value={String(draft.projectBlockLeadMinutes)}
              onChange={(event) => {
                const raw = event.target.value;
                const lead = (raw === "null" ? null : Number(raw)) as ProjectBlockLead;
                save({ ...draft, projectBlockLeadMinutes: lead });
              }}
              className="mt-1 min-h-tap rounded border border-rule bg-surface px-2 py-1 text-base text-ink md:min-h-0 md:text-[0.8125rem]"
            >
              {PROJECT_BLOCK_LEADS.map((lead) => (
                <option key={String(lead)} value={String(lead)}>
                  {LEAD_LABELS[String(lead)]}
                </option>
              ))}
            </select>
          </label>
          <TimeInput
            label="Morning time"
            hint="Snooze until tomorrow, and bill reminders."
            minute={draft.morningMinute}
            onChange={(morningMinute) => save({ ...draft, morningMinute })}
          />
        </div>
      </div>
    </section>
  );
}

function TimeInput({
  label,
  hint,
  minute,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  minute: number;
  disabled?: boolean;
  onChange: (minute: number) => void;
}) {
  return (
    <label className="block">
      <span className="block text-ink">{label}</span>
      <input
        type="time"
        disabled={disabled}
        defaultValue={minuteOfDayLabel(minute)}
        onBlur={(event) => {
          const parsed = parseMinuteOfDay(event.target.value);
          if (parsed !== null && parsed !== minute) onChange(parsed);
        }}
        className="mt-1 min-h-tap rounded border border-rule bg-surface px-2 py-1 text-base text-ink disabled:opacity-40 md:min-h-0 md:text-[0.8125rem]"
      />
      {hint && <span className="mt-1 block text-[0.75rem] text-ink-muted">{hint}</span>}
    </label>
  );
}
