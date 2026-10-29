# References for Reminders and push notifications

## Governing specs

### `agent-os/specs/2026-07-27-1318-per-type-detail-forms/`

- **Relationship:** Extends.
- **Relevant decisions:** where the Task and Project forms place their date fields. The
  Reminder field goes in TaskForm's Dates section and ProjectForm's Schedule section.

### `agent-os/specs/2026-07-28-1234-weekly-schedule/`

- **Relationship:** Extends.
- **Relevant decisions:** appointments carry `reminder_minutes` ("minutes before"), which
  `AppointmentDrawer` already edits. Project blocks are appointments with `project_id`.

### `agent-os/specs/2026-07-31-0834-task-recurrence/` and `2026-08-01-1900-recurrence-ap-parity/`

- **Relationship:** Extends.
- **Relevant decisions:** completing a repeating task cycles the same row and shifts its
  whole date set, `reminder_at` included (`src/lib/tree/mutations.ts`, `move(r.reminderAt)`).
  That shift must now re-arm.

### `agent-os/specs/2026-07-31-2046-google-calendar-sync/` and `2026-10-23-1200-google-inbound-sync-and-write-zone/`

- **Relationship:** Extends.
- **Relevant decisions:**
  - Google recurring series are stored as one row per instance.
  - The inbound pull is request-triggered.
  - Reminders are not mapped to Google.

### `agent-os/specs/2026-09-05-1401-bill-due-dates-and-lead-time/` and `2026-08-25-0901-bill-next-charge/`

- **Relationship:** Extends.
- **Relevant decisions:** expected date = due minus lead days; the next due date is walked
  from the last charge.

### `agent-os/specs/2026-09-14-1004-ledger-ready-to-assign/` (and `2026-08-29-2206-ready-to-assign-derivation/`)

- **Relationship:** Extends.
- **Relevant decisions:** how RTA is derived. The reminder only reads the result.

### `agent-os/specs/2026-08-20-1501-rest-timer-notification/`

- **Relationship:** Extends. Nothing superseded.
- **Relevant decisions:**
  - The rest timer keeps its page-level `Notification` and its fitness-only helper.
  - "No service worker" was that feature's scope.

### Achieve reference

- `docs/achieve-planner/online-help.md`:
  - The Reminders Window (Weekly Schedule menu).
  - Task and project Reminder / Reminder Date-Time fields.
  - Appointment Reminder Time.
  - Options → "Auto-set reminder for projects/tasks with deadlines".
- `docs/achieve-planner/workflow-and-training.md`: "the reminders window will pop up when
  it's time to start a new project block… click on the View Tasks button".

## Similar implementations

### Externally triggered route

- **Location:** `src/app/api/finances/alerts/route.ts`, called every 5 minutes by
  `scripts/gmail-alert-push.gs`.
- **Relevance:** the closest template for a scheduler callback (secret check, envelope,
  `getAgentUserId`).
- **Key patterns:** `requireAgentApiKey` in `src/lib/agent/auth.ts` (SHA-256 +
  `timingSafeEqual`, fails closed).

### Notification permission helper

- **Location:** `src/lib/fitness/restNotify.ts`, `src/components/fitness/RestTimer.tsx`.
- **Relevance:** the existing permission-state rules and icon path.

### Occurrence expansion

- **Location:** `expandRecurrence` and `appointmentToRecurrenceInput` in
  `src/lib/schedule/recurrence.ts`; `listAppointmentsInRange` in
  `src/lib/schedule/queries.ts`.
- **Relevance:** expands local recurring appointment masters into occurrences inside the
  arming window.

### Reminder writers

- `src/lib/detail/mutations.ts`: `TASK_KEYS` / `PROJECT_KEYS`, and the `reminderAt` instant
  coercion.
- `src/lib/tree/mutations.ts`: `setDeadline`, `applyStateTransition`, recurrence cycling.
- `src/lib/agent/detailArgs.ts`, `src/lib/agent/contracts.ts`.
- `src/lib/schedule/mutations.ts`: appointment create/update and `reminderMinutes`.

### Bills and RTA

- Bills: `src/lib/finances/billSchedule.ts` and `src/lib/finances/commitments.ts`
  (`nextDueKey`); the "Before payday" cue in `src/lib/finances/budget/dueCue.ts`.
- RTA: `buildBudget` in `src/lib/finances/budget/envelope.ts`; `loadBudget` in
  `src/lib/finances/budget/queries.ts`.
- Writes Lee doesn't watch:
  - `syncAll` in `src/lib/banksync/sync.ts`.
  - `applyAlertEmail` in `src/lib/finances/alertIngestWrite.ts`.
  - The transaction import commit.

### Settings

- `user_settings` scopes: `src/lib/settings/scopes.ts` (`SCOPE_KINDS`), `readSetting`,
  `writeUserSetting`.
- Settings page: `src/components/settings/SettingsPage.tsx` (`SECTIONS`); panel examples
  `PayCadencePanel.tsx` and `GoogleCalendarPanel.tsx`.

### Date-time input

- No shared component exists yet. The raw `datetime-local` + `toLocalInputValue` in
  `AppointmentDrawer.tsx` is the pattern to lift into `DateTimeField`.

### Reader zone

- `READER_TIME_ZONE` / `readerTodayKey` in `src/lib/schedule/readerZone.ts`.

### CSP

- `src/lib/security/csp.ts` and `csp.test.ts`.
