# Standards for Google Calendar Sync

**Status: frozen / complete** (2026-08-01)

The two that bind hardest are `development/testing` (the mirror sweep
deletes rows, so its logic must be pure and tested) and `database/migrations` (the schema
change must be generated, never hand-written).

Applied as of standards commit `6523cf4`. References, not copies — see AGENTS.md.

- `agent-os/standards/development/testing.md`

  **Why it applies:** This feature's dangerous logic is all pure — date/RRULE mapping and the
  mirror planner that decides which local rows to delete. Both go in `src/lib/google/` with
  adjacent `*.test.ts`. `google_calendar_links` touches the database, so it gets a
  `*.integration.test.ts` **including the cross-user case**. No React component tests for the
  settings panel or the schedule chrome.

  Specific tripwires this feature needs:

  - All-day boundary across a timezone (Google's exclusive end date vs our `timestamptz`)
  - `BYDAY` ↔ 0=Sun weekday conversion, both directions
  - The mirror sweep never deleting a local-only row, or a row outside the synced window

- `agent-os/standards/database/migrations.md`

  **Why it applies:** This slice adds columns to `appointments`, a partial unique index, and
  a new `google_calendar_links` table. One `npm run db:generate` migration, with its snapshot
  and journal entry committed together. Note the standard's warning about the poisoned chain —
  `0004`–`0008` had to be hand-written after one omission.

- `agent-os/standards/api/error-handling.md`

  **Why it applies:** Google API failures need a consistent shape. A revoked token or a 5xx
  from Google must not become a 500 on `/schedule` — the page renders from what is already
  mirrored and shows a banner. Write-through mutation failures do surface as errors, since
  the alternative is a local row that silently disagrees with Google.

  Mapping for this feature: Google `401`/`403 invalid_grant` → treat as _not linked_ and
  prompt to reconnect; `404` on an event we hold → the event is gone, drop the local row;
  `429`/`5xx` → transient, keep the mirror as-is and report sync failure.

- `agent-os/standards/components/ux-principles.md`

  **Why it applies:** The `/settings` Google panel and the schedule chrome additions
  (**⟳ Refresh**, sync-failure banner, calendar tinting) must match the existing surface.
  Relevant principles: _progressive disclosure_ (the calendar picker only appears once Google
  is linked), _immediate clear feedback_ (refresh shows it is working; a failed sync says so
  rather than failing silently), and _no modals for routine work_.

  Full text: `agent-os/standards/components/ux-principles.md` — unchanged by this work, and
  already quoted in full in the frozen weekly-schedule spec's `standards.md`.

Deviations: none recorded.

<!-- The standards text was formerly inlined here. It lives in agent-os/standards/
     and, as it stood at freeze, in `git show 6523cf4:agent-os/standards/<path>.md`. -->
