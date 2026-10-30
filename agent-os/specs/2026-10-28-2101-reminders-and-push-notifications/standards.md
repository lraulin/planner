# Standards for Reminders and push notifications

Applied as of standards commit `dff043d6`. References, not copies — see AGENTS.md.

- `agent-os/standards/development/security.md`
  - Every occurrence and subscription mutation takes `userId` and proves ownership.
  - The CSP gains `worker-src 'self'` for the service worker.
  - The scheduler routes authenticate the caller (QStash signature, `CRON_SECRET`), not a
    session.
- `agent-os/standards/development/testing.md`
  - Pure derivation, the auto-reminder rule and snooze math get unit tests.
  - Occurrence and subscription mutations get integration tests, with the second-user case.
- `agent-os/standards/development/dates.md`
  - A deadline is a calendar day (UTC-noon encoding); a reminder is an instant.
  - Converting between them (auto-set reminder, "tomorrow at 09:00") goes through the
    reader zone and must survive DST.
- `agent-os/standards/development/clean-code.md`
  - The lib layer owns all reminder logic; actions and routes stay thin.
  - One `syncReminderSource` re-arms reminders for every writer.
  - The occurrence table is a model correction, not speculative generality.
- `agent-os/standards/database/migrations.md` — two new tables and their enums, generated
  with a snapshot. Additive only, so no recovery gate.
- `agent-os/standards/database/read-latency.md` — the panel read and the badge count must
  not add sequential round trips to every shell page.
- `agent-os/standards/api/agent-auth.md` — the timing-safe secret comparison pattern for
  `/api/cron/reminders`.
- `agent-os/standards/api/response-format.md` and `api/error-handling.md` — envelopes for
  the new HTTP routes.
- `agent-os/standards/components/navigation.md` — Reminders needs a menu-bar command and a
  ⌘K entry, not only the bell.
- `agent-os/standards/components/responsive.md` — the panel becomes a full-screen sheet on
  phone, with 44 px targets.
- `agent-os/standards/components/ux-principles.md` and `drawer-pattern.md` — the Reminder
  field in the task and project drawers commits on blur; icon-only buttons such as the bell
  need a title.

## Deviations

- **`/api/reminders/fire` does not use Bearer agent auth.** QStash signs its requests, so
  the route verifies the `Upstash-Signature` JWT with the current and next signing keys.
  Only QStash can call it; no shared key is ever handed out.
