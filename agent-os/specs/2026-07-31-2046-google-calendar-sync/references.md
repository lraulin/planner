# References for Google Calendar Sync

**Status: frozen / complete** (2026-08-01)

## Prior specs

### Weekly Schedule (frozen) — the surface this extends

- **Location:** `agent-os/specs/2026-07-28-1234-weekly-schedule/`
- **Relevance:** Built `appointments`, the week grid, the appointment drawer, and the
  three-state check. Listed _"Google Calendar OAuth / two-way sync"_ under **Out of scope**
  with the rationale **"own calendar first"** — this spec is the deferred half.
- **Key patterns:** Its `plan.md` notes appointments were given a _"full local field set so
  Google sync can attach later without a schema rewrite"_ — that bet is being cashed here.
  `showAs` was likewise named for this mapping (`src/db/schema.ts:72`).
- **Do not edit that folder.** It is frozen; this is the delta spec.

### Apple Reminders drain (frozen) — the external-ref precedent

- **Location:** `agent-os/specs/2026-07-30-2126-apple-reminders-drain/`
- **Relevance:** Introduced `external_source` / `external_id` on `nodes` with a partial
  unique index, for exactly this problem — making an external import idempotent so a
  half-finished run is fixed by re-running rather than by deleting duplicates by hand.
- **Key patterns:** Copy the index shape verbatim. In `src/db/schema.ts`:

  ```ts
  uniqueIndex("nodes_external_ref_uq")
    .on(table.userId, table.externalSource, table.externalId)
    .where(sql`${table.externalId} is not null`);
  ```

  Also the exported `ExternalRef = { source: string; id: string }` type and the idempotent
  create in `src/lib/capture/mutations.ts`.

## Code to study

| What                   | Path                                             | Why                                                                                                                                                             |
| ---------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recurrence expansion   | `src/lib/schedule/recurrence.ts`                 | The model we map **onto** RRULE. `RecurrenceInput` names every field that must serialize. Stays untouched — Google-backed rows are instances and never reach it |
| Schedule loader        | `src/lib/schedule/queries.ts`                    | `loadSchedule` is the single page-level loader; the throttled mirror hooks in here, and `SchedulePayload` gains the sync-status field                           |
| Schedule mutations     | `src/lib/schedule/mutations.ts`                  | Becomes write-through. Note the scoping idiom every mutation follows: `and(eq(id), eq(userId))` then `if (!row) throw new Error("… not found.")`                |
| Server-action wrapper  | `src/app/schedule/actions.ts`                    | The `run()` helper + `ActionResult` shape + `revalidatePath("/", "layout")`. `syncGoogleAction` follows it                                                      |
| Auth config            | `src/lib/auth/server.ts`                         | Where `socialProviders.google` and `accountLinking` go. Keep `disableSignUp: true`                                                                              |
| Auth tables            | `src/db/schema.ts` — `accounts`                  | Already has `accessToken`, `refreshToken`, `accessTokenExpiresAt`, `scope`, `idToken`. **No migration needed for tokens**                                       |
| Integration test shape | `src/lib/schedule/mutations.integration.test.ts` | `databaseReachable()` / `warnDatabaseSkipped()` gating, `makeUser()` + `afterAll` cleanup, and the cross-user block to copy for `google_calendar_links`         |
| Pure test shape        | `src/lib/schedule/recurrence.test.ts`            | The model for testing expansion/mapping logic with non-obvious expected values                                                                                  |

## External

- **Google Calendar API v3** — `events.list` (`singleEvents`, `timeMin`/`timeMax`,
  `showDeleted`), `events.insert/patch/delete`, `calendarList.list`.
  <https://developers.google.com/calendar/api/v3/reference>
  - The `singleEvents=true` expansion behaviour is the load-bearing detail: Google applies
    series exceptions and cancellations server-side, which is what lets us skip an RRULE
    parser and an exception table entirely.
  - Instance ids are `{eventId}_{timestamp}` and **stable**, so local annotations keyed on
    them survive re-sync.
- **Better Auth social providers & account linking** —
  <https://www.better-auth.com/docs/authentication/google>
  - `accessType: "offline"` + `prompt: "consent"` are required to get a refresh token.
  - `auth.api.getAccessToken({ providerId, userId })` handles refresh, so this feature does
    **not** hand-roll a token refresh flow.
- **RFC 5545 RRULE** — `FREQ`, `INTERVAL`, `BYDAY`, `COUNT`, `UNTIL` are the only parts we
  emit. Note `BYDAY` uses `SU,MO,TU,WE,TH,FR,SA` while `recurrenceByWeekday` is 0=Sun…6=Sat.

## Deliberately not referenced

No existing sync, cron, queue, or webhook code exists in this repo to borrow from — the
only external-facing route is `src/app/api/agent/[tool]/route.ts`, which is inbound
(Bearer-key tool calls) rather than an outbound integration. This feature is the first
outbound API client, so `src/lib/google/client.ts` sets the pattern rather than following
one.
