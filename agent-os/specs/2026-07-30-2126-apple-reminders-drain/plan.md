# Apple Reminders Drain

**Status: active — server side complete and verified; awaiting on-device Shortcut run**  
Spec folder: `agent-os/specs/2026-07-30-2126-apple-reminders-drain/`

Everything in this repo is built, tested and verified end-to-end over HTTP. What is left is
the one step that cannot be done from here: building the Shortcut on a device per
`tools/shortcuts/README.md` and running it against real reminders. Freeze after that.

## Context

The **last remaining external-intake item** on the Phase 2 roadmap
(`agent-os/product/roadmap.md`, "Capture & access"). The in-app `c` box and the Alfred
workflow both require a Mac or browser at hand; "Hey Siri, remind me to…" is still the
fastest capture path on a phone, and those reminders currently die in Apple Reminders
instead of reaching the planner.

Apple has no server-side Reminders API — EventKit is on-device only and iOS 13's Reminders
migration broke the old iCloud CalDAV route — so this cannot be a cron pulling from the
cloud. It must be an **on-device Shortcut** that reads reminders, POSTs them, and marks
them complete.

The transport already exists and is frozen: `POST /api/agent/capture` →
`ensureInbox` / `captureItems`. Three separate documents (roadmap "Capture & access",
`specs/2026-07-30-1018-inbox-quick-capture/plan.md`,
`specs/2026-07-30-1323-alfred-inbox-capture/plan.md`) name the one missing piece: a
**provenance/dedupe column**, which does not exist anywhere in `src/db/schema.ts` today.
That is what makes an interrupted Shortcut run safe to repeat.

Delta on two frozen specs (do not edit them): `2026-07-30-1018-inbox-quick-capture` owns
the Inbox and `captureItems`; `2026-07-30-1323-alfred-inbox-capture` owns the `capture`
tool and the `tools/alfred/` packaging model this mirrors.

## Decisions

| Topic          | Decision                                                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dedupe         | `external_source` + `external_id` on `nodes`, partial unique index per user; a repeat POST is a no-op returning the existing node                     |
| Source list    | The **default** Reminders list — where Siri writes. Draining it empty is the point; the list name is a Shortcut variable so it can change later       |
| externalId     | `"<ISO creation date>\|<name>"` composite, built in the Shortcut, opaque to the server                                                                |
| Fields carried | name, notes → note, due date → deadline. **No** Apple priority — Inbox items are unprocessed by definition                                            |
| After import   | Mark the reminder **complete** (recoverable; drops out of the next run's query)                                                                       |
| API shape      | Extend `capture` to accept `items[]`; the existing single-`name` form keeps working for Alfred                                                        |
| Trigger        | Manual only (Shortcuts app / Home Screen / Siri). No scheduled automation                                                                             |
| Packaging      | `tools/shortcuts/` mirroring `tools/alfred/` — README + curl equivalent, no opaque binary committed                                                   |
| Out of scope   | Scheduled automation, list→project mapping, tag filtering, priority mapping, writing back to Reminders beyond completion, Reminders as a two-way sync |

## Acceptance criteria

- [x] Same `externalId` POSTed twice creates **one** node; the second call returns
      `created: false` and the same `nodeId`
- [x] Batch POST with a mix of new and already-seen ids creates only the new ones
- [x] Reminder due date lands on the task's `deadline`; notes land on `notes`
- [x] Two users may hold the **same** `externalId` independently; neither can read, change,
      or delete the other's node
- [x] Existing single-`name` `capture` form is unchanged (Alfred keeps working) — verified
      over HTTP: the response still carries `node` and `createdIds`
- [x] `tools/shortcuts/README.md` documents building the Shortcut step by step
- [x] Tests + typecheck + lint + build green; integration suite ran (213 tests, no skip)
- [x] Roadmap: Reminders drain marked delivered; Phase 2 external intake closed
- [ ] **Shortcut built on-device and run against real reminders** — the one step that
      cannot be done from the repo

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code
polish.

| #   | Change                                                                                                                  | Why                                                                                                                                                                                                                                                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Provenance is one `ExternalRef { source, id }` object, not two loose optional strings, on `createNode` / `CapturedItem` | Drizzle exposes `nullsNotDistinct` only on `unique()` constraints, which cannot be partial. So the partial index counts null sources as distinct, and an id arriving without a source would silently opt out of the dedupe it was sent to get. Making the pair unsplittable in the type system closes that at the only level that can |
| 2   | `captureItems` returns `{ results, nodeIds, parentId }`; `createdIds` renamed to `nodeIds`                              | Once items can be skipped, "created ids" is a lie — the array holds existing ids too. `results` carries the per-item `created` flag an importer needs. The agent tool's single-item **response** still says `createdIds`, because Alfred reads that field                                                                             |
| 3   | Batch responses include `created` / `skipped` counts alongside `results`                                                | The Shortcut shows a notification; counting an array in Shortcuts is several awkward actions, and the server already knows the answer                                                                                                                                                                                                 |
| 4   | A per-item `deadline` beats `CaptureDefaults.deadline` rather than being ignored                                        | The default is what the caller meant for items that did not say. Each reminder carries its own due date, so per-item is the more specific answer                                                                                                                                                                                      |
| 5   | Cap of 100 items per call                                                                                               | Not a number the original plan fixed. One malformed client should not be able to ask for unbounded writes in a single request                                                                                                                                                                                                         |

---

## Task 1: Save spec documentation

This folder: `plan.md`, `shape.md`, `standards.md`, `references.md`. No `visuals/` — a
Shortcut has no UI we design.

## Task 2: Provenance columns + migration

`src/db/schema.ts`, `nodes` table — two nullable columns beside `isInbox`, documented in
the same voice as the `isInbox` and `tcPriority*` comments: why provenance is a column and
not a convention, and that null means "made by a human in the app".

```ts
externalSource: text("external_source"),   // "apple_reminders"
externalId: text("external_id"),
```

Partial unique index alongside `nodes_one_inbox_per_user_uq`:

```ts
uniqueIndex("nodes_external_ref_uq")
  .on(table.userId, table.externalSource, table.externalId)
  .where(sql`${table.externalId} is not null`),
```

User-scoped, so two users may carry the same reminder id. This index — not the read-then-
insert below — is the correctness backstop.

Then, strictly per `agent-os/standards/database/migrations.md`:
`npm run db:generate` → **read the generated SQL** → `npm run db:migrate`. Commit the
`.sql`, the snapshot, and the `_journal.json` entry **together** — that standard exists
because a past omission poisoned five migrations.

## Task 3: Idempotent capture in the one write path

Per `api/agent-tools` rule 2, all of this lands in `src/lib/**`, not the route handler.

**`src/lib/tree/mutations.ts`** — `createNode` takes optional `externalSource` /
`externalId` and passes them into the insert values.

**`src/lib/capture/parse.ts`** — extend `CapturedItem` with optional
`deadline?: Date | null`, `externalSource?: string`, `externalId?: string`. `parseCapture`
never sets them; they exist for programmatic callers, and the doc comment says so.

**`src/lib/capture/mutations.ts`** — `captureItems`:

1. Before the loop, one `select` over the items carrying an `externalId` builds a
   `Map<key, nodeId>` of what is already here. One query, not one per item.
2. An item whose id is in the map is **skipped** — no `createNode`, no defaults applied —
   and contributes the existing node id.
3. Per-item `deadline` applies through `saveNodeDetail`, taking precedence over
   `defaults.deadline`.
4. Return `{ nodeIds, results, parentId }` where `results` is
   `Array<{ nodeId; created; externalId? }>` in input order. `createdIds` → `nodeIds`,
   since the ids are no longer all newly created; update both call sites.

A skipped item must **not** break `parentAtDepth` — a child indented under a deduped
parent still needs to attach to it. Use the resolved node id either way.

## Task 4: Batch form of the `capture` tool

**`src/lib/agent/tools.ts`**, `captureTool`. Keep the name — `AGENT_TOOLS` membership is a
stable contract (`api/agent-tools` rule 3) and Alfred depends on it.

Accepted bodies:

- `{ name, note?, deadline?, externalSource?, externalId? }` — existing form, extended
- `{ externalSource?, items: [{ name, note?, deadline?, externalId? }] }` — new

Rules: `name` and `items` together → `validation`; empty `items` → `validation`; a blank
item name → `validation` naming the index; more than 100 items → `validation`; an
`externalId` with no `externalSource` → `validation`, because an unqualified id is not
unique across future sources.

Single-item responses keep their current shape plus `created`, so
`tools/alfred/capture.sh` needs no change. Batch responses return `{ parentId, results }`.
Both ride the existing `{ ok, data }` envelope.

Argument parsing is an exported **pure** function so it is unit-testable without a
database — that is where a wrong answer looks plausible.

## Task 5: Tests

Per `agent-os/standards/development/testing.md` — a test earns its place by failing on a
plausible mistake.

**Unit:** single form, batch form, both-present rejection, blank name, oversized batch,
`externalId` without `externalSource`, ISO deadline parsed to a `Date`.

**Integration — `src/lib/capture/mutations.integration.test.ts`:**

- Same `externalId` captured twice → one row, second returns `created: false`, same id
- Batch mixing a known id with a new one → exactly one new row
- Per-item deadline lands on the task detail row; per-item beats `defaults`
- **Cross-user:** user B captures the _same_ `externalId` and gets their own node (proves
  the index is user-scoped); B cannot read, update, or delete A's node

**Integration — `src/lib/agent/tools.integration.test.ts`:** batch through
`dispatchAgentTool` lands under the `is_inbox` project; validation errors surface as
`validation`; second user cannot see the first's captured nodes.

`npm run test:unit` passing does **not** mean the DB tests ran — they skip when Postgres is
down. Run `npm run db:up` first and check for the skip warning after.

## Task 6: Shortcut package + docs

**`tools/shortcuts/README.md`**, mirroring `tools/alfred/README.md`, documenting the
Shortcut:

1. **Find Reminders** — List = the default list, Is Completed = false. Store in a variable
   so step 4 can reuse it.
2. **Repeat with Each** → Name, Notes, Due Date, Creation Date → **Format Date** with a
   **fixed custom format** (`yyyy-MM-dd'T'HH:mm:ssZ`) → dictionary
   `{ name, note, deadline, externalId }` where `externalId` is
   `"<formatted creation date>|<name>"`. The fixed format matters: Shortcuts date output is
   locale- and timezone-sensitive, and a format that drifts silently changes every id.
3. **Get Contents of URL** — POST `{base}/api/agent/capture` with Bearer auth (plus
   `x-vercel-protection-bypass` if Deployment Protection is on), body
   `{ "externalSource": "apple_reminders", "items": [ … ] }`.
4. Only if `ok` is true: **Repeat with Each** over the reminders from step 1 → **Mark as
   Completed**. Never complete before the POST is confirmed.
5. **Show Notification** with created / skipped counts.

Secrets live in Shortcut text fields the user fills in, never committed.

Also ship **`tools/shortcuts/drain.sh`** — a curl equivalent posting a batch, so the
endpoint can be exercised from a terminal before fighting the Shortcuts editor.

**`docs/agent-api.md`** — update the `capture` row and section with the batch form,
`externalId` semantics, and a worked example; add a `tools/shortcuts/` pointer beside the
Alfred one.

**Known limitation** (record in README and spec): renaming a reminder between a landed POST
and a failed completion changes its `externalId` and would duplicate. The window is small
(completion follows a confirmed POST) and the fix is deleting one Inbox task.

## Task 7: Verify, freeze spec, update roadmap

```sh
npm run db:up
npm run db:generate && npm run db:migrate   # after reading the SQL
npm run test:unit
npm run test:integration                    # confirm it did not skip
npm run typecheck && npm run lint && npm run build
```

Then end-to-end against local dev (port 3047):

1. `tools/shortcuts/drain.sh` with two items → both appear under **Inbox**, one with a
   deadline.
2. Run it **again unchanged** → 0 created, 2 skipped, still two tasks. This is the whole
   point of the feature; do not skip it.
3. Post one new id alongside the two known ones → exactly one new task.

Then on-device: build the Shortcut per the README, add two reminders via Siri, run against
production, confirm both land in the Inbox and both reminders are marked complete. Re-run
with the list empty → clean no-op.

Finally: fill in **Changes from original plan**, stamp `plan.md` and `shape.md`
**Status: frozen / complete** (date), move leftovers to **Follow-ups (new work)**, and
update `agent-os/product/roadmap.md` — mark the "External intake remaining — Apple
Reminders drain" bullet `✅` with the spec path, and fix the dependency sketch that still
reads "external intake remaining: Reminders Shortcut (needs a dedupe column)".

### What actually ran (2026-07-30)

| Check                                                   | Result                                                                                                                                          |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run db:generate` → `drizzle/0013_noisy_zarek.sql`  | Read before applying: two nullable columns + the partial unique index, nothing else. `.sql`, snapshot and journal entry committed together      |
| `npm run db:migrate`                                    | Applied; `\d nodes` confirms both columns and `nodes_external_ref_uq ... WHERE external_id IS NOT NULL`                                         |
| `npm run test:unit`                                     | 505 passed (37 files), including 19 new `captureArgs` cases                                                                                     |
| `npm run test:integration`                              | 213 passed (9 files), **no skip warning** — capture 32, agent tools 15                                                                          |
| `npm run typecheck` / `lint` / `format:check` / `build` | All green                                                                                                                                       |
| `drain.sh` twice against local dev                      | `created 2, skipped 0` then `created 0, skipped 2`                                                                                              |
| Mixed batch: 2 known ids + 1 new                        | `created 1, skipped 2`; exactly one new row                                                                                                     |
| Single-`name` form over HTTP                            | Response still carries `node` + `createdIds` — Alfred unaffected                                                                                |
| Database inspection                                     | All four rows under the Inbox; deadline on the right one; `external_source` / `external_id` null on the typed row. Test rows deleted afterwards |

One unit test caught a real bug during the run: `optionalNullableString(...) ?? undefined`
collapsed an explicit `"deadline": null` into "absent", so a caller clearing a deadline was
silently ignored.

## Follow-ups (new work — not amendments to this spec)

| Follow-up                      | Note                                                                                                                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scheduled drain**            | A Personal Automation on a schedule, if manual running turns out to be the friction. iOS may demand confirmation for scheduled automations — verify on-device before promising it |
| **Native reminder identifier** | If a future iOS exposes a stable id through Shortcuts, swap it into the `ExternalId` action. Server-side change: none — ids are opaque                                            |
| **List → project mapping**     | Deliberately rejected here as filing at capture time. Revisit only if the Inbox triage step proves to be the bottleneck                                                           |
| **Provenance in the UI**       | Nothing surfaces `external_source` today. A small "from Reminders" marker in the outline might help triage; unproven                                                              |
| **Raycast**                    | Same HTTP surface, same provenance pair, no schema work needed                                                                                                                    |

---

**Standing rule while this spec is active:** on a material change to requirements, design,
or scope — including feedback on what was built — update the relevant sections of
`plan.md` / `shape.md` and append a row to **Changes from original plan**. Skip pure
implementation details. Freeze when the on-device run confirms it.
