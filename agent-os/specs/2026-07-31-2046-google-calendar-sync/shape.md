# Google Calendar Sync — Shaping Notes

**Status: frozen / complete** (2026-08-01)  
Authoritative detail: `plan.md` (including **Changes from original plan**).

## Scope

Make Google Calendar the planner's calendar. `/schedule` and `/day` show your real Google
events; appointments created in the planner are created in Google and appear on your phone.

### In scope

- Google account linking from `/settings` (Better Auth social provider, tokens in `accounts`)
- Calendar picker — choose which Google calendars appear
- Windowed mirror of Google events into `appointments`, on view + explicit refresh
- Write-through create / edit / move / delete from the planner into Google
- Recurring appointment **creation** in the planner, posted to Google as an RRULE series
- Local-only annotations (check state, priority, contexts, project link) preserved across syncs
- Graceful degradation when Google is unreachable or the token is revoked

### Out of scope

- **Editing a recurring series** from the planner — only instances exist locally; series
  edits happen in Google
- **Task / project integration** — explicitly deferred by the developer. Existing
  `projectId` linking keeps working as an annotation; no new work in this slice
- Google Tasks / Keep capture (roadmap §Google integration item 2, "only if needed")
- Background sync — no cron, no queue, no push notifications / watch channels
- Attendees, invitations, RSVP, free/busy lookup of other people
- Multiple accounts, or calendars shared from other people being written to
- Offline queueing of writes — Google must be reachable to mutate
- Drive picker / attachments (separate roadmap track)

## Decisions

- **Google is the source of truth.** `appointments` is a mirror, not a peer. This is the
  decision everything else falls out of.
- **Write-through, not sync-on-view, for local changes.** Mutations call Google inline and
  store what comes back. Accepted cost: Google must be reachable to mutate.
- **No conflict resolution exists** — not "conflicts are resolved simply", but _there are
  none_, because only one side is authoritative.
- **Asymmetric recurrence.** Pull expanded instances (`singleEvents=true`) so Google applies
  its own exceptions; push our model as RRULE, which it maps onto losslessly. Keeps
  `expandRecurrence` untouched and off the path for Google-backed rows.
- **Recurrence is create-only in the planner** — a direct consequence of storing instances.
- **New appointments go to the primary calendar**, not a quarantined "Planner" calendar, so
  they are ordinary entries on every device without extra setup.
- **Field ownership is explicit.** The mirror upsert writes only Google-owned columns;
  planner-only annotations survive every re-sync.
- **The mirror sweep is a pure function.** Deleting local rows is the most dangerous
  operation here, so its window and origin predicates are tested without a network.

### How the scope moved during shaping

Shaping opened with four forks and the answers were: full two-way sync, into `appointments`
with external refs, on-view trigger, Better Auth social provider. A second round settled
instance-based recurrence, a calendar picker with a dedicated push target, and origin-wins
conflicts.

Then the developer stated the actual want plainly — _"I basically want to just use Google
calendar. See my Google calendar in the app, and if I create an appointment, it should
create it in Google calendar. I'm not really concerned about integration with
tasks/projects at this point."_

That collapsed the design: peer-to-peer sync became a mirror, and the tombstone table,
dirty tracking, and conflict rule were all deleted rather than simplified. The push target
moved to the primary calendar. Recorded as changes 1–4 in `plan.md`.

The lesson worth keeping: the heavy version was a faithful answer to the questions asked,
but the questions assumed the planner's calendar was a peer worth defending. It isn't.

## Context

- **Visuals:** None. The existing `/schedule` chrome is unchanged apart from a **⟳ Refresh**
  control, a sync-failure banner, and calendar-color tinting on events.
- **References:** See `references.md` — frozen weekly-schedule spec, the `nodes`
  external-ref precedent from the Apple Reminders drain, `src/lib/schedule/recurrence.ts`.
- **Product alignment:** Roadmap §Google integration item 1, whose dependency note
  ("needs schedule surface — now present") is now satisfied. Item 2 (Tasks/Keep capture)
  stays out, per its own "avoid boiling the ocean" caveat.

## Standards applied

- `database/migrations` — one generated migration; never hand-write without the snapshot
- `development/testing` — pure logic in `src/lib/**` with tests beside; DB work gets an
  integration test with a cross-user case; no React component tests
- `components/ux-principles` — settings panel and schedule chrome stay consistent with the
  existing surface; no modals for routine work
- `api/error-handling` — Google API failures map to stable, surfaced errors rather than
  page crashes
