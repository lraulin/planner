# Apple Reminders Drain — Shaping Notes

**Status: active — server side complete; awaiting the on-device Shortcut run**

## Scope

Drain Apple Reminders into the planner **Inbox** from an on-device **Shortcut**, POSTing a
batch to the existing `capture` agent tool and marking each imported reminder complete.
Carries name, notes, and due date. Made safe to re-run by a new provenance/dedupe column
on `nodes`.

### Out of scope

- Scheduled / location / arrival automations — manual trigger only
- Reminders list → planner project mapping; tag-based filtering
- Apple priority (`!` / `!!` / `!!!`) → priority letter
- Two-way sync, or any write back to Reminders beyond marking complete
- Subtasks, attachments, flags, recurrence, alarms
- A committed binary `.shortcut` file (sources + rebuild instructions only)
- Raycast, MCP packaging

## Decisions

- **Why a provenance column and not "just complete the reminder":** the Shortcut can fail
  between a landed POST and a successful completion — cellular drops, the app being
  backgrounded, a Repeat block interrupted halfway. Without an id the recovery move is
  "run it again and hand-delete the duplicates", which is exactly the friction that makes
  a capture tool go unused. With `(user_id, external_source, external_id)` unique, re-running
  is always free.

- **Why the _default_ Reminders list, not a dedicated one:** that is where "Hey Siri, remind
  me to…" lands with no extra ceremony, and ceremony at capture time is what kills capture.
  Draining it empty is the intent, not a side effect — this list is a queue into the
  planner, not a place things live. Time-sensitive reminders were considered and dismissed:
  they have never been part of how this list is used, and if that changes, a separate list
  the drain ignores is the answer.

- **Why `"<creation date>|<name>"` as the id:** the Shortcuts Reminders actions are not
  guaranteed to expose a stable identifier, and a composite of two fields they _do_ expose
  is stable enough for a queue whose items are deleted-by-completion within a day. The
  server treats it as an opaque string, so swapping in a real identifier later is a
  Shortcut-side change with no migration.

- **Why the id is built client-side:** the server must not care what Apple Reminders is.
  `external_source` + `external_id` is a generic provenance pair; the next source (Raycast,
  email, a watch) reuses it without a schema change.

- **Why the pair travels as one object** (decided during implementation): the unique index
  has to be _partial_ — `WHERE external_id IS NOT NULL` — or every ordinary row would be
  competing for one key. But Drizzle only exposes `nullsNotDistinct` on `unique()`
  constraints, which cannot be partial, so Postgres treats null sources as distinct from
  each other. An id arriving without a source would therefore write a row, then write
  another one on the next run: it would look like it was deduping and not be. Since the
  database cannot enforce the pairing, the type system does — `ExternalRef { source, id }`
  makes the broken state unrepresentable, and the tool rejects an unqualified id outright.

- **Why a deduped item is left completely untouched:** the obvious alternative is to
  "update it while we're here". But a retry can arrive days later, by which time the task
  may have been renamed, filed under a project and half-finished. A re-delivery of the same
  message is not new information about the task, and treating it as such would let a flaky
  network undo triage.

- **Why batch over one POST per reminder:** the Shortcut runs on a phone, often on cellular.
  N round trips inside a Repeat block is both slow and N chances to fail partway; one POST
  is one failure point, and the per-item `results` array still reports exactly what landed.

- **Why the single-`name` form survives:** Alfred is in production and its script posts
  `{ "name": … }`. Tool names and shapes are a stable contract (`api/agent-tools` rule 3).

- **Why no priority mapping:** an Inbox item is unprocessed by definition. Priority is
  decided during triage against everything else competing for the day, which is what the
  Task Chooser's TC priority exists for. Importing Apple's three-level flag would seed that
  decision with a number that means something else.

## Context

- **Visuals:** None — a Shortcut has no UI we design.
- **References:** See `references.md` — `tools/alfred/` as the packaging model, capture lib,
  agent tools, two frozen specs.
- **Product alignment:** Roadmap Phase 2 "Capture & access" — the one bullet still
  unstarted. Closes external intake.

## Standards Applied

- **database/migrations** — new columns ship as a generated migration with its snapshot
- **api/agent-tools** — one tool per POST; one write path through `src/lib/**`; stable names
- **api/response-format** — the Shortcut parses `{ ok, data }` / `{ ok, error }`
- **api/error-handling** — malformed batches surface as `validation`
- **development/testing** — pure arg parsing unit-tested; every DB path integration-tested
  with a cross-user case

## Known limitation

Renaming a reminder between a landed POST and a failed completion changes its `externalId`
and would import it twice. The window is small — completion follows a confirmed POST — and
the fix is deleting one Inbox task.
