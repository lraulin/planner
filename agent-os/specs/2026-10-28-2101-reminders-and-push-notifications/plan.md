# Reminders and push notifications

**Status: active**
Spec folder: `agent-os/specs/2026-10-28-2101-reminders-and-push-notifications/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-07-27-1318-per-type-detail-forms/` — task and project
  forms gain the Reminder date/time their `reminder_at` columns have always had.
- **Extends:** `agent-os/specs/2026-07-28-1234-weekly-schedule/` — appointment
  `reminder_minutes` (already editable in `AppointmentDrawer`) now fires.
- **Extends:** `agent-os/specs/2026-07-31-0834-task-recurrence/` and
  `agent-os/specs/2026-08-01-1900-recurrence-ap-parity/` — completing a repeating task
  already shifts `reminder_at` with the date set; the shifted reminder is now re-armed.
- **Extends:** `agent-os/specs/2026-07-31-2046-google-calendar-sync/` and
  `agent-os/specs/2026-10-23-1200-google-inbound-sync-and-write-zone/` — Google-mirrored
  project blocks alert; the inbound pull arms what it upserts.
- **Extends:** `agent-os/specs/2026-09-05-1401-bill-due-dates-and-lead-time/` and
  `agent-os/specs/2026-08-25-0901-bill-next-charge/` — a bill's expected date drives its
  reminder.
- **Extends:** `agent-os/specs/2026-09-14-1004-ledger-ready-to-assign/` — RTA going negative
  notifies.
- **Extends:** `agent-os/specs/2026-08-20-1501-rest-timer-notification/` — rest timer is
  unchanged (page-level `Notification`, its own helper). Its "no service worker" was that
  feature's scope; this spec adds one for push. The rest banner does not move onto it.

## Context

Achieve Planner pops a **Reminders window** when a task, project or appointment reminder
comes due — and when a project block starts, with _View Tasks_ to jump straight into the
work. Planner stores every one of those fields (`task_details.reminder_at`,
`project_details.reminder_at`, `appointments.reminder_minutes`) and fires none of them.
Production on 2026-10-28: 0 task, 0 project and 0 appointment reminders set — task/project
reminders have no UI at all, and all 330 appointments are Google-mirrored.

Lee wants this "basically like in AP, in spirit, in our modern UI," reaching the iPhone
with the app closed, with the option to **complete the thing from the reminder**.

Hard constraints found while shaping:

- **Neon cost.** A per-minute poll keeps compute awake 24/7 (~0.25 CU × 730 h × $0.106 ≈
  $19/mo) — over the $5 escalation line in `tech-stack.md`. The database may wake only when
  something is actually due.
- **Vercel Hobby cron is daily-only.**
- **iOS web push** needs the Home Screen PWA (iOS 16.4+), a permission request from a tap,
  and every push must show a notification. Custom notification action buttons are not
  reliable on iOS — completing has to work from the app panel the tap opens.
- **No per-user timezone.** Server code uses `READER_TIME_ZONE` (`src/lib/schedule/readerZone.ts`).

## Decisions

1. **One concept: a reminder occurrence.** New table `reminder_occurrences` — one row per
   time something should alert: `user_id`, `source_kind` (`task` | `project` |
   `appointment` | `bill` | `ready_to_assign`), `source_id`, `occurrence_key` (e.g. an
   appointment occurrence's start, a bill's due date key), `fire_at`, `state`
   (`scheduled` | `fired` | `dismissed` | `completed` | `superseded`), `title`/`detail`
   snapshot, `fired_at`. Unique `(user_id, source_kind, source_id, occurrence_key)`, so
   arming is idempotent. Sources stay where they are (`reminder_at`, `reminder_minutes`,
   bill schedule); occurrences are what got armed and what the panel lists. When a source
   changes, its stale `scheduled` rows become `superseded` and a fresh row is armed.
2. **Scheduler: Upstash QStash + one daily Vercel cron.** Arming publishes a QStash
   message with `notBefore = fire_at` to `POST /api/reminders/fire` (QStash-signature
   verified; dedup id = occurrence id + fire_at). The firing route re-checks the row
   (still `scheduled`, `fire_at` matches, source still live — task not settled, bill still
   unpaid) before pushing, so stale messages no-op and edits never need to cancel anything.
   QStash free allows a 7-day delay, so writes arm anything due within 7 days; the daily cron
   (`/api/cron/reminders`, `CRON_SECRET`) arms the next 7 days for every source, runs the
   Google inbound pull first so blocks made on the phone are armed by morning, and does the
   bill and RTA sweeps. The database wakes once a day plus once per firing.
3. **Delivery: Web Push to every subscribed device.** `web-push` with VAPID keys; new
   table `push_subscriptions` (per device: endpoint unique, keys, label, last success).
   404/410 from the push service deletes the subscription. `public/sw.js` (the proxy matcher
   already excludes it) shows the notification and tells open clients to refresh the panel.
   CSP gains `worker-src 'self'`.
4. **The Reminders panel is AP's Reminders window.** A shell-wide panel lists `fired`
   occurrences, newest first. Each row has an icon by kind, title, when it was due ("due
   12 min ago"), and these actions:
   - **Complete** — tasks/projects go through the existing state transition, so the cascade
     and recurrence cycling apply and the cycled reminder re-arms; appointments set
     `checkState='done'`. Bills and RTA have no Complete.
   - **Open** — node drawer / appointment / budget envelope.
   - **View tasks** — project blocks only, as in AP.
   - **Snooze** — 5 min, 15 min, 1 h, Tomorrow at the morning time. Snoozing re-arms the
     same row.
   - **Dismiss**, plus **Dismiss all**.

   Entry points: a bell with a count badge in the page bar and mobile header; _View →
   Reminders_ in the menu bar; ⌘K. A `?reminders=open` query on any shell route opens it.
   The panel is a popover on desktop and a full-screen sheet on phone. Tapping a push opens
   the app with the panel open, and that is how Complete works on iPhone. On browsers that
   support notification actions (desktop Chrome), the notification also carries
   **Complete** and **Snooze 15 min**. The service worker POSTs these with the session
   cookie.

5. **Task/project reminders.** A `DateTimeField` (new, `datetime-local`, commit on blur)
   in TaskForm's Dates section and ProjectForm's Schedule section. Writes from forms, agent
   tools and recurrence cycling all re-arm through one `syncReminderSource(userId, ref)`.
6. **Deadlines → auto-set reminder (AP's option).** Setting or changing a deadline sets
   `reminder_at` to _N days before the deadline day at the morning time_ (Settings;
   defaults on, 1 day, 09:00 reader zone) — but only when the reminder is empty or still
   equals the auto value for the old deadline, so a hand-set reminder is never overwritten.
   Clearing the deadline clears only an auto-valued reminder. Pure rule, one function, used
   by `setDeadline` and the detail-form path.
7. **Appointments and project blocks.** An appointment alerts at `start − reminder_minutes`
   when set. A project-linked appointment with no `reminder_minutes` alerts at
   `start − <project block lead>` (Settings: Off / 0 / 5 / 10 / 15 min; default 0). Plain
   Google events alert only when `reminder_minutes` is set here, so they don't duplicate
   Google's own alerts. Local recurring masters expand with `expandRecurrence` inside the
   arming window.
8. **Bill due, not yet paid.** A bill's expected date is due minus lead days, from
   `billSchedule.ts` / `commitments.ts`. If no matching charge has landed by then, the bill
   alerts at the morning time on that date. The firing check re-runs the next-due
   computation, so a charge that lands first cancels the alert.
9. **Ready to Assign negative.** Checked after the writes that happen without Lee looking
   at the budget: transaction import commit, bank sync, alert-email ingest. The daily sweep
   checks it too. It fires immediately (no QStash) when RTA < 0 and no open RTA occurrence
   exists. Recovery to ≥ 0 auto-resolves the open occurrence. Edits made on the budget page
   do not push, because Lee is looking at the red number already.
10. **Preferences** live in a new `user_settings` scope `notifications` (per-kind on/off,
    auto-reminder days + time, project-block lead, morning time). Push subscriptions get
    their own table, following the integration-state precedent. The new Settings →
    **Notifications** section holds:
    - **Enable on this device**: the permission prompt from a tap, with Add-to-Home-Screen
      guidance when iOS is not running standalone.
    - The device list, with Remove.
    - **Send test notification**.
    - The defaults above.
11. **Local development.** With `QSTASH_TOKEN` unset, publishing logs and no-ops, and
    `npm run reminders:fire-due` fires due rows directly against the local database.
    QStash's local dev server is the optional faithful path.

### Intentional differences from Achieve

- Reminders arrive as phone/desktop push plus an in-app panel, not a desktop pop-up window.
- The auto-set reminder is an offset (days + time) rather than the bare deadline.
- Project-block alerts have a configurable lead.
- Plain Google events are excluded unless a reminder is set here.
- Finance reminders have no Achieve counterpart.

### Out of scope

- Metric reminders.
- Email or SMS delivery.
- Per-device preferences.
- A notification history beyond the panel.
- Writing reminders to Google events.
- The rest timer moving onto push.
- Pomodoro.
- Quiet hours.

## Acceptance criteria

- [ ] With the PWA closed on Lee's iPhone, a task reminder set for 2 minutes ahead arrives
      as a push within ~1 minute of its time. Tapping it opens the panel, and **Complete**
      settles the task. A repeating task cycles and its next reminder is armed.
- [ ] Setting a deadline on a task with no reminder auto-sets one (1 day before, 09:00);
      a hand-set reminder survives a deadline change.
- [ ] A project block starting alerts with **View tasks**; a plain Google event without a
      reminder does not alert.
- [ ] A bill whose expected date arrives without a charge alerts at the morning time; one
      already charged does not.
- [ ] An import that drives RTA negative pushes once; recovery resolves it.
- [ ] Snooze re-fires at the chosen time; Dismiss and Dismiss all clear the panel; editing
      or deleting the source before fire time sends nothing.
- [ ] Desktop Chrome shows Complete / Snooze on the notification and both work.
- [ ] No per-minute job exists; Neon stays scaled to zero between the daily cron and actual
      firings.
- [x] Integration tests: a second user cannot list, snooze, dismiss or complete the first
      user's occurrences, or read/delete their push subscriptions; arming twice creates one
      row.
- [x] Unit tests cover occurrence derivation per source, the auto-reminder rule, snooze
      times in the reader zone across DST, and the firing validity check.
- [x] `npm run smoke` passes with the dev server running.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure
code polish.

| #   | Change                                                                                                                                                                                                                                                                                                       | Why                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | The occurrence row also stores `scheduled_for` (the time the source asked for, fixed) beside `fire_at` (moved by a snooze) and `due_at` (the moment it is about — a block's start). `occurrence_key` embeds the scheduled time, and validity is "does the source still produce this key at `scheduled_for`". | A snoozed row's `fire_at` no longer says what the source wanted, and a changed lead must arm a _new_ row rather than rewrite one whose message is in flight. |
| 2   | Arming reaches 5 minutes into the past: a reminder set a minute ago fires at once, one from an hour ago never does. A `superseded` row whose key comes back (reminder moved and moved back) is revived; a dismissed or fired one is not.                                                                     | Without a grace a just-set reminder could never fire; without revival the unique key would block the original time forever.                                  |
| 3   | Recurrence cycling now moves `reminder_at` by whole days on the reader's clock (`shiftZonedDays`). It used to re-encode it as a calendar day (UTC noon).                                                                                                                                                     | That turned a 3 PM reminder into 8 AM on the first cycle — invisible while reminders never fired.                                                            |
| 4   | The root `/` redirect carries its query string through to `/plan`.                                                                                                                                                                                                                                           | `/?reminders=open` lost its flag on the first hop.                                                                                                           |
| 5   | The desktop bell sits on the application menu bar, not the page bar.                                                                                                                                                                                                                                         | `PageBar` renders nothing for a module with fewer than two pages, so the bell would vanish in most of the app.                                               |
| 6   | On the phone the panel is the shared `ModalShell` bottom sheet (85 dvh), not a full-screen sheet.                                                                                                                                                                                                            | `modal-pattern.md`: every dialog becomes the same sheet below `md`.                                                                                          |
| 7   | Four switches, not five: tasks and projects share one. Notification preferences save through a server action that re-arms the week ahead, instead of the client settings queue.                                                                                                                              | One Reminder field means the same thing on both forms; re-arming on save makes "project blocks: on" apply today.                                             |
| 8   | Ready to Assign is checked at the call sites (import route, bank sync action, alert route), not inside `importFinanceCsvFiles` / `syncAll` / `applyAlertEmail`.                                                                                                                                              | "Writes Lee isn't watching" is a property of the caller; inside the lib functions every test import would load the whole budget.                             |
| 9   | Completing a reminder for a **local repeating** appointment master marks the reminder done but does not check off the appointment.                                                                                                                                                                           | The master's check state is the whole series'. (All production appointments are Google instances, so this is the rare case.)                                 |
| 10  | Pushes carry `TTL` one hour, and the panel's Snooze offers 5 min / 15 min / 1 hour / Tomorrow.                                                                                                                                                                                                               | A reminder delivered hours late is noise; "Tomorrow" is at the morning time from Settings.                                                                   |

Verified locally on 2026-10-29: unit + integration suites (no skips), smoke (65/65 on a fresh
dev server), the panel on desktop and at 390 px, Settings → Notifications, service worker
registration in Chrome, and a real Web Push through FCM to Chrome rendered by `sw.js`.

> While this spec is **active**, when we make a material change to requirements, design,
> or scope (including from feedback on what was implemented), update the relevant sections
> and append to **Changes from original plan**. Skip pure implementation details. Freeze
> when verified.

## Task 1: Save spec documentation

Create `agent-os/specs/2026-10-28-2101-reminders-and-push-notifications/` with
`plan.md` (this plan), `shape.md`, `standards.md` (pinned to standards commit `dff043d6`),
`references.md`. No visuals.

## Task 2: Occurrence model and pure derivation

- Migration: `reminder_occurrences`, `push_subscriptions`, the enums (generated, with
  snapshot).
- `src/lib/reminders/derive.ts`, a pure module:
  - Desired occurrences per source within a window: task/project `reminder_at`;
    appointment explicit vs project-block default, with `expandRecurrence` for local
    masters; bill expected date.
  - `autoReminderFor(deadline, prefs)` and the "is still auto-valued" check.
  - Snooze targets in the reader zone.
  - `isStillDue(occurrence, sourceState)`.
- Tests beside each module.

## Task 3: Arming, firing, and the scheduler

- `src/lib/reminders/mutations.ts`:
  - `syncReminderSource(userId, ref)`: upsert desired rows, supersede stale ones, publish.
  - `armHorizon(userId)`.
  - `fireOccurrence(id, expectedFireAt)`.
  - `snooze`, `dismiss`, `dismissAll`, and `complete`, which delegates to the existing
    `applyStateTransition` / appointment check-state mutations.
  - Every function is `userId`-scoped.
- `src/lib/reminders/publish.ts`: the QStash publish wrapper, a no-op without a token.
- Routes:
  - `POST /api/reminders/fire`: verify the QStash signature with `@upstash/qstash`
    `Receiver`.
  - `GET /api/cron/reminders`: Bearer `CRON_SECRET`.
  - `vercel.json` with one daily cron.
- Hook `syncReminderSource` into every writer:
  - The detail form path (`src/lib/detail/mutations.ts`).
  - `setDeadline`.
  - Recurrence cycling in `src/lib/tree/mutations.ts`.
  - Agent detail tools.
  - Appointment create/update/delete (`src/lib/schedule/mutations.ts`).
  - The Google inbound upsert.
  - Bill edits.
- RTA check after import commit, bank sync and alert ingest.
- `scripts/reminders-fire-due.ts` + the npm script.
- Integration tests: cross-user, idempotent arming, supersede on edit, stale-message no-op.

## Task 4: Push delivery and the service worker

- `web-push` with VAPID env vars.
- `src/lib/reminders/push.ts`:
  - Builds the payload (title, body, tag = occurrence id, url, actions).
  - Sends to all of the user's subscriptions and prunes 404/410.
- `public/sw.js`:
  - On `push`: show the notification and post a refresh message to open clients.
  - On `notificationclick`: run the action through `POST /api/reminders/[id]/action`
    (session cookie), or focus/open `/?reminders=open` and keep the query through any
    redirect.
- CSP: add `worker-src 'self'`, and update `csp.test.ts`.
- Service worker registration lives in the shell.
- Subscribe/unsubscribe server actions, each `userId`-scoped and covered by an
  integration test.

## Task 5: The Reminders panel

- `RemindersPanel`: a popover on desktop, a sheet on phone (responsive standard, 44 px
  targets). Server actions for each row action.
- Bell + badge in `PageBar` / `MobileHeader`.
- The `view.reminders` command with a menu entry and ⌘K.
- `?reminders=open` handling.
- Live refresh on the service worker message and on focus.
- One query for the panel's read (read-latency).

## Task 6: Reminder fields and auto-set from deadline

- `DateTimeField` in `src/components/detail/fields.tsx`.
- Reminder in TaskForm (Dates) and ProjectForm (Schedule).
- The auto-set rule applied wherever a deadline is written: the form, `setDeadline`, the
  agent tools.

## Task 7: Settings → Notifications

- The `notifications` scope in `SCOPE_KINDS`, with a defensive parser and test.
- `NotificationsPanel` in `SettingsPage` `SECTIONS`:
  - Enable on this device, with iOS standalone guidance.
  - The device list, with Remove.
  - Send test notification.
  - Per-kind toggles, auto-reminder days/time, project-block lead, morning time.

## Task 8: Verify, freeze spec, update roadmap

- Lee creates the Upstash QStash account. Set env vars in Vercel:
  - `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`
  - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
  - `CRON_SECRET`
- `npm test` (confirm the integration tests ran, not skipped), lint, typecheck, build.
  Start the dev server and run `npm run smoke`.
- Local: subscribe a desktop Chrome, set a reminder, run `npm run reminders:fire-due`, and
  exercise each panel action.
- Production on Lee's iPhone, after the push to `master`: walk every acceptance item above.
- Confirm Neon's compute graph shows scale-to-zero between firings.
- Update plan/shape for as-built drift; freeze; add a roadmap entry.
