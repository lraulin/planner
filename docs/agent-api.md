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

3. Say which account the key acts as:

   ```env
   PLANNER_AGENT_USER_EMAIL=you@example.com
   ```

   **Required in production** — an unset value makes agent requests fail rather than guess
   an account. Locally it falls back to the dev/test account (`AUTH_DEV_USER_EMAIL`,
   default `test@example.com`), so a local agent never writes to a real account by accident.

4. Call tools against the running app (`npm run dev` → `http://localhost:3047`).

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

| Tool                                                                 | Purpose                                                                                                    |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `health`                                                             | Liveness + tool list                                                                                       |
| `get_context`                                                        | Focus, top open A/B work, this week’s plan glance                                                          |
| `search_nodes`                                                       | Filter outline (`type`, `state`, `focus`, `query`, `parentId`, …)                                          |
| `get_node`                                                           | One node by id                                                                                             |
| `create_node`                                                        | Create under `parentId`, or at the top level when omitted. Full form fields optional (see below)           |
| `capture`                                                            | GTD capture into the **Inbox**: one task (`name`) or a batch (`items`). Not the same as root `create_node` |
| `update_node`                                                        | Patch any core or type-specific form field (same shape as create; partial writes)                          |
| `create_note` / `update_note` / `list_notes`                         | Capture markdown notes                                                                                     |
| `get_week`                                                           | Week schedule + plan summary                                                                               |
| `create_appointment` / `update_appointment` / `delete_appointment`   | Light calendar writes                                                                                      |
| `ensure_weekly_plan` / `update_weekly_plan` / `load_weekly_plan`     | Weekly plan read/write                                                                                     |
| `upsert_plan_entry` / `set_focus_area` / `set_weekly_plan_completed` | Wizard-equivalent steps                                                                                    |
| `list_metrics` / `get_metric`                                        | List metrics (filter by owner/query/active) or load one with recent entries                                |
| `create_metric` / `update_metric`                                    | Define or patch a metric (title, units, type, target, optional goal owner)                                 |
| `log_metric_entry` / `update_metric_entry`                           | Record or correct a tracking value (`entryDate` defaults to today as `YYYY-MM-DD`)                         |

### Example

```sh
curl -sS -X POST "http://localhost:3047/api/agent/get_context" \
  -H "Authorization: Bearer $PLANNER_AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### create_node / update_node (full forms)

Every field on the detail forms is writable. **Leaving fields out is normal** — only send
what you know. Prefer richer detail on **projects** (they persist as a record); keep
**tasks** lean unless something is actually useful.

Core (any type), top-level:

```json
{
  "type": "project",
  "parentId": "<uuid-or-null>",
  "name": "Kitchen remodel",
  "notes": "Main freeform notes for this item (markdown ok)",
  "state": "not_started",
  "priorityLetter": "B",
  "priorityRank": 1,
  "deadline": "2026-09-01",
  "targetStartDate": null,
  "targetEndDate": null,
  "deferredDate": null,
  "focus": false
}
```

Type-specific halves are nested objects. Unknown keys are rejected with `validation`.

| Type        | Nested key   | Useful fields (non-exhaustive)                                                                                                     |
| ----------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Project     | `project`    | `purpose`, `idealVision`, `sufficientVision`, `strategy`, `description`, `place`, `contexts`, `assignedTo`, costs, scheduling mins |
| Task        | `task`       | `description`, `effortMinutes`, `place`, `contexts`, `source`, recurrence fields, …                                                |
| Goal        | `goal`       | `purpose`, `definition`, `vision`, `strategy`, `values`, `range`, `isDream`, …                                                     |
| Result area | `resultArea` | `description`, `mission`, vision/SWOT prose, `category`, `importance`, …                                                           |

Example project create:

```json
{
  "type": "project",
  "parentId": "<result-area-uuid>",
  "name": "Kitchen remodel",
  "notes": "Contractor quotes in email",
  "project": {
    "purpose": "Make the kitchen usable again",
    "idealVision": "New counters and sink",
    "strategy": "One wall at a time",
    "contexts": ["@home"]
  }
}
```

`get_node` returns the full form (notes + side table + linked-note stubs). `search_nodes`
stays compact. Top-level `effortMinutes` still works as a shortcut into `task.effortMinutes`.

**Notes field vs linked notes:** `notes` is the item’s main freeform box (`nodes.notes`).
`create_note` with `nodeId` is optional supplementary material in the Notes tab — not a
substitute for the form fields above.

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

### Metrics

List and read first so you have a `metricId`. Log a reading with `log_metric_entry`
(`value` required; `entryDate` as `YYYY-MM-DD`, defaults to today). Create a definition
with `create_metric` when none exists.

```sh
curl -sS -X POST "http://localhost:3047/api/agent/create_metric" \
  -H "Authorization: Bearer $PLANNER_AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Body weight","units":"lb","metricType":"instance","objectiveTarget":175}'
```

```sh
curl -sS -X POST "http://localhost:3047/api/agent/log_metric_entry" \
  -H "Authorization: Bearer $PLANNER_AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"metricId":"…","value":182.5,"entryDate":"2026-08-02","target":175}'
```

`metricType` is `instance` | `cumulative` | `total` (default `total`). Optional
`ownerNodeId` must be a goal. Second-user isolation matches the rest of the agent API.

## Agent instructions repo

Day-to-day chat should open the **separate** `planner-agent` repository (prompts + skills),
not this app’s source tree. That repo documents conversation flows and points at this API.

## Alfred (macOS)

See **`tools/alfred/README.md`** for installing a keyword workflow that POSTs to `capture`.

## Apple Reminders (iOS / macOS)

See **`tools/shortcuts/README.md`** for the Shortcut that drains the default Reminders list
into the Inbox and marks each reminder complete.
