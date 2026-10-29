# Reminders and push notifications — Shaping Notes

**Status: active**

## Scope

Make reminders fire, AP-style. Lee's words: "basically like in AP, or at least in spirit in
a way suitable to our modern aesthetic and UI/UX best practices… should allow us to
optionally complete the things we're being reminded of from the popup."

Triggers chosen (all four offered):

- Task and project reminders (`reminder_at`), with a UI to set them.
- Deadlines approaching, via Achieve's "auto-set reminder from deadline" option.
- Schedule blocks starting: project blocks, plus any appointment with an explicit reminder.
- Finance: a bill due but not yet paid, and Ready to Assign going negative. **Not** chosen:
  pushing on every card alert email.

Delivery chosen: **iPhone with the app closed**, so Web Push to the Home Screen PWA. The
in-app Reminders panel is where Complete happens.

### Out of scope

- Metric reminders.
- Email or SMS.
- Per-device preferences.
- Quiet hours.
- Writing reminders back to Google events.
- Moving the rest timer onto push.
- Pomodoro.
- Notification history beyond the panel.

## Decisions

- **Evidence first:** production on 2026-10-28 had 0 task, 0 project and 0 appointment
  reminders set. Task and project reminders had no UI, and all 330 appointments are
  Google-mirrored. Reminders are being built from zero, not rescued.
- **Scheduler: QStash + daily cron**, chosen over an Apps Script ticker and over Vercel Pro.
  Two numbers ruled out polling:
  - A per-minute poll keeps Neon compute awake about $19/mo against the $5 line.
  - Vercel Hobby cron is daily-only.

  QStash calls back at each reminder's minute (free plan: up to 7 days ahead), so the
  database wakes only for real firings plus one daily sweep. This is the app's first
  background scheduler. Live bank sync and Google sync both declined one; this feature
  cannot work without one.

- **`reminder_occurrences` is the new concept.** Without it, the app would need two
  workarounds for the same missing row:
  - "Has this fired / been dismissed / been snoozed" has nowhere to live.
  - A stale scheduled callback has nothing to check itself against.

  The occurrence row is both the panel's list and the guard that turns a stale message into
  a no-op.

- **Deadline reminders are stored values (AP's auto-set option)**, not derived at read
  time. Everything stays one mechanism (`reminder_at`), and one item's reminder can be
  cleared without a new flag. A hand-set reminder is never overwritten.
- **Project blocks alert by default (lead configurable).** Plain Google events alert only
  when a reminder is set here, so they don't double up with Google's own alerts.
- **Complete from the reminder.** In the panel everywhere; also on the notification itself
  where the browser supports actions (desktop Chrome). iOS action buttons are unreliable,
  so on the phone a tap opens the panel.
- **RTA negative pushes only after writes Lee isn't watching** (import, bank sync, alert
  ingest, daily sweep). It does not push for edits on the budget page itself.

## Context

- **Visuals:** None.
- **References:** see `references.md`. Key findings:
  - No blocks table: blocks are appointments with `project_id`.
  - No service worker and no push code exist.
  - No per-user timezone: `READER_TIME_ZONE`.
  - No date-time field component exists yet.
  - The alerts route plus Apps Script is the closest template for an externally triggered
    route.
- **Product alignment:** `tech-stack.md` holds the cost constraint (the $5 Neon threshold),
  and the Hobby plan is why cron is daily-only. Mission: Achieve parity in spirit. Lee
  validates mobile work on the deployed iPhone, so verification happens there after the
  push to `master`.

## Standards Applied

See `standards.md`.
