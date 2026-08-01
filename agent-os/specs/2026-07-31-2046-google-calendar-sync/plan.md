# Google Calendar Sync

**Status: active**  
Spec folder: `agent-os/specs/2026-07-31-2046-google-calendar-sync/`

Delta on the frozen `agent-os/specs/2026-07-28-1234-weekly-schedule/`, which built the
calendar surface and explicitly deferred Google ("own calendar first"). That folder stays
frozen; this one owns the sync work.

---

## Context

The weekly schedule is real and used daily — `/schedule` (week grid, Time Chart background,
appointments with recurrence and a three-state check, project drag-to-schedule), `/day`,
and `/schedule/plan`. But its calendar is an island. Meetings that arrive by email invite
live in Google and are invisible when planning the week, and time blocks built here never
reach the phone. Planning a week against a calendar missing half the week's commitments is
the actual daily friction.

Roadmap **§Google integration** stages this as item 1: _"show Google Calendar alongside (or
inside) the weekly schedule; push time blocks / pull busy times"_, noting it _"needs
schedule surface — now present"_.

**Outcome:** Google Calendar _is_ the planner's calendar. What you see in `/schedule` is
your Google calendar; what you create in `/schedule` shows up on your phone.

---

## Decisions

| Decision                     | Choice                                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| **Model**                    | **Google is the source of truth.** `appointments` is a local mirror of it, not a peer store        |
| **Local writes**             | **Write-through** — create/edit/delete call Google inside the mutation and store what comes back   |
| **Remote reads**             | Windowed mirror on view (`/schedule`, `/day`), throttled ~5 min, plus explicit **⟳ Refresh**       |
| **Conflicts**                | None to resolve. Google wins by construction                                                       |
| **Recurrence**               | Pull **expanded instances** (`singleEvents=true`); push our model as RRULE at create time          |
| **Calendars**                | Pick which to show; new appointments go to your **primary** calendar                               |
| **OAuth**                    | Better Auth `socialProviders.google` + account linking; tokens reuse the existing `accounts` table |
| **Local-only fields**        | Preserved as annotations across syncs — the mirror never clobbers them                             |
| **Task/project integration** | Out of scope for this slice                                                                        |

### Why "Google is the source of truth" is the whole design

The shaping conversation started at full peer-to-peer two-way sync and moved here once the
actual want was stated: _"I basically want to just use Google Calendar."_ That single
reframe removes most of the hard parts, and the removals are the point:

- **No conflict resolution.** There is no "planner-origin" class of event to defend, so no
  origin-wins rule, no last-writer-wins timestamps, no conflict UI.
- **No tombstone table.** A delete calls Google inside the mutation; there is no window
  where a deleted row must be remembered until a later sync drains it.
- **No dirty tracking.** Local rows are never pending-push, so no `synced_at` baseline and
  no `updatedAt > syncedAt` comparisons.

What remains is a mirror plus write-through, which is a much smaller and more robust thing
to build than a sync engine.

**Accepted cost:** Google must be reachable to create, move, or delete an appointment. A
failed call surfaces as an error rather than a silently divergent local row. For "just use
Google Calendar", that is the correct trade.

### Recurrence: asymmetric, and create-only in the planner

- **Google → planner:** request `singleEvents=true` over the visible window. Google expands
  the series _and applies its own exceptions, overrides, and cancellations_. Every row we
  store is a concrete instance with `recurrence_frequency = 'none'`. No RRULE parser, no
  exception table, no EXDATE handling, and **no change to the well-tested `expandRecurrence`
  in `src/lib/schedule/recurrence.ts`** — it simply stops being on the path for
  Google-backed rows.
- **Planner → Google:** our recurrence model (`recurrenceFrequency` / `recurrenceInterval` /
  `recurrenceByWeekday` / `recurrenceEnd` + `recurrenceCount` / `recurrenceUntil`) is a
  strict _subset_ of RRULE, so it maps out losslessly:
  `RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=10`. We POST the series to Google, then
  let the mirror pull its instances back.

**Consequence:** the planner's recurrence UI is **create-only**. Because the local table
holds only instances, there is no series master to edit — changing "every Tuesday" to
"every Wednesday" is done in Google Calendar. This is consistent rather than a gap: editing
a series is exactly the kind of thing you have Google for.

This also dissolves the duplicate-master problem that peer-to-peer sync would have had. A
planner-created series never persists locally as a master, so there is nothing for the pull
to duplicate.

### Field ownership

The mirror upsert writes **only Google-owned columns**. Local-only columns keep their
values across every re-sync, keyed by the stable Google event id (instance ids like
`{eventId}_{timestamp}` are stable, so annotations survive on recurring events too).

| Google owns                       | Planner owns (annotations)         |
| --------------------------------- | ---------------------------------- |
| `subject`, `location`, `notes`    | `checkState` (open/done/missed)    |
| `startAt`, `endAt`, `allDay`      | `priorityLetter`, `priorityRank`   |
| `showAs` (transparency/eventType) | `contexts`, `private`, `projectId` |

Everything already shipped on the appointment drawer keeps working; Google just doesn't know
about the right-hand column. If Google deletes an event, its annotations go with it —
acceptable, and the alternative (orphan annotation rows) is worse.

---

## Non-obvious constraints

- `recurrenceByWeekday` is **0=Sun…6=Sat** (JS `getDay()`); RRULE `BYDAY` is `SU,MO,TU,…`.
  Conversion needs a unit test in both directions.
- `showAs` (`busy|free|tentative|out_of_office`) was _already named_ for this mapping —
  `src/db/schema.ts:72`. Maps onto Google `transparency` + `eventType`.
- All-day events: Google uses `start.date` (date-only, **exclusive** end); timed events use
  `start.dateTime`. Our `allDay` + `timestamptz` needs care so an all-day event doesn't
  drift a day across timezones.
- `accessType: "offline"` is mandatory on the Google provider. Without it Google returns no
  refresh token and sync dies silently about an hour after linking.
- Sync failure must never take down the page. `/schedule` renders from whatever is already
  mirrored, with a banner — not a 500.
- The mirror sweep must delete **only** google-origin rows **inside the synced window**. A
  bug that widens either predicate deletes real data; this is the single most dangerous
  line in the feature and is why the planner is a pure, tested function.

---

## Schema changes

One generated migration (`npm run db:generate` — **never hand-write one without its
snapshot**, per `agent-os/standards/database/migrations.md`).

**`appointments`** — new nullable columns:

| Column                 | Purpose                                                                    |
| ---------------------- | -------------------------------------------------------------------------- |
| `external_source`      | `"google"`; null = local-only row that never reached Google                |
| `external_id`          | Google event id (an _instance_ id for recurring events)                    |
| `external_series_id`   | Google `recurringEventId`; drives the "recurring" affordance and links out |
| `external_calendar_id` | Which calendar it lives on                                                 |
| `external_etag`        | Google `etag`, to skip no-op writes                                        |
| `external_updated_at`  | Google `updated`                                                           |

Plus `uniqueIndex appointments_external_ref_uq on (user_id, external_source, external_id)
where external_id is not null` — the exact shape of the existing `nodes_external_ref_uq`.

**`google_calendar_links`** (new) — `userId`, `calendarId`, `summary`, `backgroundColor`,
`syncEnabled`, `isPrimary`, `lastSyncedAt`, timestamps; unique on `(userId, calendarId)`.
Relational sync state, so a table rather than `user_settings`. `lastSyncedAt` drives the
staleness throttle.

No tombstone table and no `synced_at` on appointments — see the decision above.

---

## Code map

**New — `src/lib/google/`** (real logic lives in `src/lib/**` per `AGENTS.md`; tests beside):

| File                          | Contents                                                                                                                                                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client.ts`                   | Access token via `auth.api.getAccessToken({ providerId: "google", userId })` — Better Auth owns refresh, so no hand-rolled refresh flow — plus thin `events.list/insert/patch/delete` and `calendarList.list` wrappers |
| `mapping.ts`                  | **Pure.** `googleEventToRow` / `rowToGoogleEvent`, RRULE build, `BYDAY` ↔ 0–6 weekday, `showAs` ↔ transparency/eventType, all-day date handling                                                                        |
| `mirror.ts`                   | **Pure.** `planMirror(localRows, remoteEvents, window)` → `{ toInsert, toUpdate, toDelete }`. Owns the window/origin predicates and the annotation-preserving merge                                                    |
| `sync.ts`                     | The only impure orchestrator: fetch → `planMirror` → apply → stamp `lastSyncedAt`                                                                                                                                      |
| `queries.ts` / `mutations.ts` | `google_calendar_links` CRUD and the staleness check                                                                                                                                                                   |

`mapping.ts` and `mirror.ts` are pure on purpose: date conversion and the mirror sweep are
exactly the "wrong answer looks plausible" logic the testing standard says to isolate, and
both are testable without a Google account.

**Modified:**

- `src/lib/auth/server.ts` — add `socialProviders.google` (`accessType: "offline"`,
  `prompt: "consent"`, scopes `calendar.events` + `calendar.readonly`) and
  `account: { accountLinking: { enabled: true, trustedProviders: ["google"] } }`. Leave
  `emailAndPassword` with `disableSignUp: true` intact — Google is for _linking_, not signup.
- `src/db/schema.ts` — columns and the new table above.
- `src/lib/schedule/mutations.ts` — `createAppointment` / `updateAppointment` /
  `deleteAppointment` / `rescheduleAppointment` become write-through.
  `setAppointmentCheckState` stays purely local (it's an annotation).
- `src/lib/schedule/queries.ts` — `loadSchedule` runs the throttled mirror before loading,
  and reports sync failure in its payload instead of throwing.
- `src/app/schedule/actions.ts` — `syncGoogleAction()` via the existing `run()` wrapper.
- `src/app/settings/{page,actions}.tsx` — Connect Google, calendar checkboxes, linked state.
- `src/components/schedule/` — **⟳ Refresh**, sync-failed banner, Google events tinted by
  source-calendar color.
- `.env.example` — `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

---

## Acceptance criteria

- [ ] Google links from `/settings` without disturbing email/password login; a refresh token
      is actually present in `accounts`.
- [ ] Events on enabled calendars appear in the right week slots, tinted by calendar;
      disabled calendars never appear.
- [ ] A recurring Google meeting shows on each of its days and honours a cancelled or moved
      occurrence — because Google expanded it, not us.
- [ ] Creating an appointment in `/schedule` puts it on the primary Google calendar and it
      appears on the phone.
- [ ] Creating a _recurring_ appointment produces one RRULE series in Google (not N copies),
      and the mirror brings its instances back without duplicating anything.
- [ ] Moving or deleting an appointment in the planner moves or deletes it in Google.
- [ ] Changing an event in Google is reflected in the planner after a refresh.
- [ ] Check state, priority, contexts, and project link survive a re-sync unchanged.
- [ ] A local-only row outside the synced window is never deleted by the mirror sweep.
- [ ] Google down or token revoked → `/schedule` still renders with a visible warning.
- [ ] `npm run test:unit` and `test:integration` pass; a second user cannot read, change, or
      delete the first user's `google_calendar_links` row.

---

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code
polish.

| #   | Change                                                                                                                                                                               | Why                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Peer-to-peer two-way sync → **Google as source of truth** with write-through mutations. Dropped the tombstone table, dirty tracking (`synced_at`), and the origin-wins conflict rule | Shaping picked full two-way sync; mid-shaping the developer clarified _"I basically want to just use Google Calendar… if I create an appointment, it should create it in Google calendar."_ Google being authoritative removes conflicts by construction rather than resolving them |
| 2   | Push target: dedicated "Planner" calendar → **primary calendar**                                                                                                                     | Same clarification. A quarantined calendar has to be enabled on every device; the want was for planner appointments to be ordinary calendar entries                                                                                                                                 |
| 3   | Recurrence editing is **create-only** in the planner                                                                                                                                 | Follows from storing only expanded instances. Series edits belong in Google; nothing local to edit                                                                                                                                                                                  |
| 4   | Task/project integration explicitly deferred                                                                                                                                         | _"I'm not really concerned about integration with tasks/projects at this point."_ Existing `projectId` linking keeps working as an annotation; no new work                                                                                                                          |

---

## Tasks

1. **Save spec documentation.** This folder — `plan.md`, `shape.md`, `standards.md`,
   `references.md`.
2. **OAuth linking.** Google social provider + account linking; **Connect Google** on
   `/settings` with linked state; verify a refresh token lands in `accounts`.
3. **Schema + migration.** External-ref columns, unique index, `google_calendar_links`.
   Generated migration only.
4. **Pure mapping layer.** `mapping.ts` + `mapping.test.ts` — RRULE build, weekday
   conversion, all-day boundaries across a timezone, `showAs` mapping.
5. **Pure mirror planner.** `mirror.ts` + `mirror.test.ts` — insert/update/delete planning,
   annotation preservation, and the window/origin predicates that protect local rows.
6. **Calendar picker.** `google_calendar_links` queries/mutations +
   `mutations.integration.test.ts` including the cross-user case; `/settings` panel.
7. **Write-through mutations.** Create/update/delete/reschedule call Google and store the
   result; recurring create posts an RRULE series.
8. **Mirror on view.** `sync.ts`, staleness throttle, wire into `loadSchedule`, **⟳ Refresh**,
   and graceful degradation with a banner.
9. **Rendering.** Google events tinted by calendar; recurring instances marked; `/day` too.
10. **Verify, freeze spec, update roadmap.** Confirm acceptance criteria, complete **Changes
    from original plan**, mark `plan.md` / `shape.md` **frozen / complete** (date), and mark
    roadmap §Google integration item 1 delivered.

Tasks 4 and 5 are pure and land before anything touches the network — they hold the logic a
plausible mistake hides in.

---

> **While this spec is active:** material changes to requirements, design, or scope —
> including feedback on what gets built — update the sections above and append a row to
> **Changes from original plan**. Skip pure implementation details. Freeze when verified.
