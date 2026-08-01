"use client";

import { useId, useState, useTransition } from "react";
import type { GoogleCalendarLink } from "@/db/schema";
import { linkSocial } from "@/lib/auth/client";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import {
  disconnectGoogleAction,
  refreshGoogleCalendarsAction,
  setCalendarSyncEnabledAction,
} from "@/app/settings/actions";

type Props = {
  configured: boolean;
  linked: boolean;
  calendars: GoogleCalendarLink[];
};

/**
 * Connect Google and choose which calendars appear in the schedule.
 *
 * Progressive disclosure per `components/ux-principles`: before linking this is a single
 * button and a sentence, and the calendar list only exists once there is an account to
 * list calendars for.
 */
export function GoogleCalendarPanel({ configured, linked, calendars }: Props) {
  const headingId = useId();
  const [error, setError] = useState<string | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [pending, startTransition] = useTransition();

  const connect = () => {
    setError(null);
    /**
     * `linkSocial`, not `signIn.social`. Signing in would authenticate you *as* the Google
     * account and only attach to this one if the email happened to match — with
     * `disableSignUp` on, a mismatch fails outright. Linking says what is actually meant:
     * hang this calendar off the account already signed in.
     *
     * It needs a real session, so `AUTH_DEV_BYPASS` is not enough — sign in at /login
     * first. That is a better failure than silently linking the wrong account.
     */
    startTransition(async () => {
      const result = await linkSocial({ provider: "google", callbackURL: "/settings" });
      if (result.error) {
        setError(
          result.error.message ??
            "Could not start the Google connection. Sign in at /login first if you are on the dev auth bypass.",
        );
      }
    });
  };

  const refresh = () => {
    setError(null);
    startTransition(async () => {
      const result = await refreshGoogleCalendarsAction();
      if (!result.ok) setError(result.error);
    });
  };

  const disconnect = () => {
    setError(null);
    setConfirmingDisconnect(false);
    startTransition(async () => {
      const result = await disconnectGoogleAction();
      if (!result.ok) setError(result.error);
    });
  };

  const toggle = (calendarId: string, enabled: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await setCalendarSyncEnabledAction(calendarId, enabled);
      if (!result.ok) setError(result.error);
    });
  };

  const primary = calendars.find((c) => c.isPrimary);

  return (
    <section aria-labelledby={headingId} className="mt-6 rounded border border-rule">
      <div className="flex items-center justify-between gap-3 border-b border-rule bg-surface-raised px-4 py-2.5">
        <h2
          id={headingId}
          className="text-[0.75rem] font-semibold uppercase tracking-wider text-ink-muted"
        >
          Google Calendar
        </h2>
        {linked && (
          <button
            type="button"
            onClick={refresh}
            disabled={pending}
            className="rounded border border-rule px-2.5 py-1 text-[0.8125rem] text-ink transition-colors hover:border-rule-strong hover:bg-surface disabled:opacity-40"
          >
            {pending ? "Refreshing…" : "Refresh list"}
          </button>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="border-b border-rule bg-priority-a/10 px-4 py-2 text-[0.8125rem] text-priority-a"
        >
          {error}
        </p>
      )}

      {!configured ? (
        <p className="px-4 py-6 text-[0.875rem] leading-relaxed text-ink-muted">
          Google Calendar is not configured on this server. Set{" "}
          <code className="font-mono text-[0.8125rem]">GOOGLE_CLIENT_ID</code> and{" "}
          <code className="font-mono text-[0.8125rem]">GOOGLE_CLIENT_SECRET</code> and
          restart — see <code className="font-mono text-[0.8125rem]">.env.example</code>
          .
        </p>
      ) : !linked ? (
        <div className="px-4 py-6">
          <p className="mb-3 text-[0.875rem] leading-relaxed text-ink-muted">
            Connect Google to see your calendar in the weekly schedule. Appointments you
            create here are created in Google, so they show up on your phone.
          </p>
          <button
            type="button"
            onClick={connect}
            className="rounded border border-rule bg-surface-raised px-3 py-1.5 text-[0.875rem] font-medium text-ink transition-colors hover:border-rule-strong"
          >
            Connect Google Calendar
          </button>
        </div>
      ) : (
        <>
          <p className="border-b border-rule px-4 py-2.5 text-[0.8125rem] leading-relaxed text-ink-muted">
            Showing the calendars ticked below.{" "}
            {primary ? (
              <>
                New appointments are created in{" "}
                <span className="font-medium text-ink">
                  {primary.summary || "your primary calendar"}
                </span>
                .
              </>
            ) : (
              "Refresh the list to pick up your primary calendar."
            )}
          </p>

          {calendars.length === 0 ? (
            <p className="px-4 py-8 text-center text-[0.875rem] text-ink-faint">
              No calendars loaded yet. Use Refresh list.
            </p>
          ) : (
            <ul className="divide-y divide-rule">
              {calendars.map((calendar) => (
                <li
                  key={calendar.id}
                  className="flex items-center justify-between gap-4 px-4 py-2.5"
                >
                  <label className="flex min-w-0 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={calendar.syncEnabled}
                      disabled={pending}
                      onChange={(event) =>
                        toggle(calendar.calendarId, event.target.checked)
                      }
                      className="size-4 flex-none accent-accent"
                    />
                    <span
                      aria-hidden
                      className="size-2.5 flex-none rounded-full border border-rule"
                      style={{
                        backgroundColor: calendar.backgroundColor || "transparent",
                      }}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[0.875rem] font-medium text-ink">
                        {calendar.summary || calendar.calendarId}
                      </span>
                      <span className="block truncate font-mono text-[0.6875rem] text-ink-faint">
                        {calendar.calendarId}
                      </span>
                    </span>
                  </label>
                  {calendar.isPrimary && (
                    <span className="flex-none rounded border border-rule px-1.5 py-0.5 text-[0.6875rem] uppercase tracking-wide text-ink-muted">
                      Primary
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule px-4 py-2.5">
            <p className="text-[0.8125rem] text-ink-muted">
              Disconnecting removes the connection and every mirrored event from the
              planner. Your Google calendar is not changed.
            </p>
            <button
              type="button"
              onClick={() => setConfirmingDisconnect(true)}
              disabled={pending}
              className="flex-none rounded border border-rule px-2.5 py-1 text-[0.8125rem] text-priority-a transition-colors hover:border-priority-a disabled:opacity-40"
            >
              Disconnect
            </button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmingDisconnect}
        title="Disconnect Google Calendar?"
        message="Every event mirrored from Google will be removed from the planner, along with your calendar list. Nothing in Google Calendar itself is deleted, and you can reconnect at any time."
        confirmLabel="Disconnect"
        destructive
        onConfirm={disconnect}
        onCancel={() => setConfirmingDisconnect(false)}
      />
    </section>
  );
}
