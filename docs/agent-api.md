# Agent API

HTTP tools so an external coding agent (Grok Build, Claude Code, etc.) can read and update
the planner. Spec: `agent-os/specs/2026-07-29-1500-ai-interoperability/`.

Standards: `agent-os/standards/api/`.

## Setup

1. Set a long random secret:

   ```sh
   openssl rand -hex 32
   ```

2. Put it in `.env.local` (local) and in Vercel env (production):

   ```env
   PLANNER_AGENT_API_KEY=…
   ```

3. Call tools against the running app (`npm run dev` → `http://localhost:3047`).

## Call shape

```http
POST /api/agent/{tool}
Authorization: Bearer <PLANNER_AGENT_API_KEY>
Content-Type: application/json

{ …args }
```

### Success

```json
{ "ok": true, "data": { … } }
```

### Failure

```json
{ "ok": false, "error": { "code": "validation", "message": "…" } }
```

Codes: `unauthorized` (401), `validation` (400), `not_found` (404), `conflict` (409),
`internal` (500).

## Tools

| Tool                                                                 | Purpose                                                                                                     |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `health`                                                             | Liveness + tool list                                                                                        |
| `get_context`                                                        | Focus, top open A/B work, this week’s plan glance                                                           |
| `search_nodes`                                                       | Filter outline (`type`, `state`, `focus`, `query`, `parentId`, …)                                           |
| `get_node`                                                           | One node by id                                                                                              |
| `create_node`                                                        | Create under `parentId`, or at the top level when it is omitted (`type`, `name`, optional priority/state/…) |
| `capture`                                                            | GTD capture into the **Inbox**: one task (`name`) or a batch (`items`). Not the same as root `create_node`  |
| `update_node`                                                        | Patch name/state/priority/deadline/focus/effort                                                             |
| `create_note` / `update_note` / `list_notes`                         | Capture markdown notes                                                                                      |
| `get_week`                                                           | Week schedule + plan summary                                                                                |
| `create_appointment` / `update_appointment` / `delete_appointment`   | Light calendar writes                                                                                       |
| `ensure_weekly_plan` / `update_weekly_plan` / `load_weekly_plan`     | Weekly plan read/write                                                                                      |
| `upsert_plan_entry` / `set_focus_area` / `set_weekly_plan_completed` | Wizard-equivalent steps                                                                                     |

### Example

```sh
curl -sS -X POST "http://localhost:3047/api/agent/get_context" \
  -H "Authorization: Bearer $PLANNER_AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Capture (Inbox)

Quick dump a single task under the Inbox project (creates/reopens the Inbox as needed).
Used by the Alfred workflow in `tools/alfred/` and by agents that should not invent a
parent id.

```sh
curl -sS -X POST "http://localhost:3047/api/agent/capture" \
  -H "Authorization: Bearer $PLANNER_AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Call the dentist"}'
```

Optional `note` string becomes the task’s notes field.

**Do not** use `create_node` without `parentId` for GTD capture — that creates a root-level
task, which is a deliberate “no home” resting state, not the unprocessed Inbox.

### Capture (batch, with dedupe)

Pass `items` instead of `name` to capture several at once. Used by the Apple Reminders
Shortcut in `tools/shortcuts/`.

```sh
curl -sS -X POST "http://localhost:3047/api/agent/capture" \
  -H "Authorization: Bearer $PLANNER_AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
        "externalSource": "apple_reminders",
        "items": [
          { "name": "Call the dentist", "externalId": "2026-07-30T09:14:22Z|Call the dentist" },
          { "name": "File taxes", "deadline": "2026-04-15T00:00:00Z",
            "externalId": "2026-07-30T09:15:02Z|File taxes" }
        ]
      }'
```

```json
{
  "ok": true,
  "data": {
    "parentId": "…",
    "created": 2,
    "skipped": 0,
    "results": [
      {
        "nodeId": "…",
        "created": true,
        "externalId": "2026-07-30T09:14:22Z|Call the dentist"
      },
      {
        "nodeId": "…",
        "created": true,
        "externalId": "2026-07-30T09:15:02Z|File taxes"
      }
    ]
  }
}
```

Per item: `name` (required), `note`, `deadline` (ISO-8601), `externalId`. Max 100 items.
Passing both `name` and `items` is a `validation` error — the two forms answer with
different shapes.

**`externalId` makes the call idempotent.** An item whose `(externalSource, externalId)`
pair is already on one of your nodes is skipped and reported with `created: false`,
returning the existing `nodeId`. The existing node is left completely alone — not renamed,
not re-dated — because by the time a retry arrives it may have been triaged and half-done.

This exists so an importer that POSTs and _then_ marks the source items handled can recover
from dying in between: it just sends the batch again. `externalId` requires
`externalSource` (per item, or once at the top level for the whole batch); an unqualified
id would write a row now and a duplicate row next run, so it is rejected.

Ids are opaque — never parsed, only compared. Two users may hold the same id independently.

## Agent instructions repo

Day-to-day chat should open the **separate** `planner-agent` repository (prompts + skills),
not this app’s source tree. That repo documents conversation flows and points at this API.

## Alfred (macOS)

See **`tools/alfred/README.md`** for installing a keyword workflow that POSTs to `capture`.

## Apple Reminders (iOS / macOS)

See **`tools/shortcuts/README.md`** for the Shortcut that drains the default Reminders list
into the Inbox and marks each reminder complete.
