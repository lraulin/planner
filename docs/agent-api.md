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

| Tool                                                                 | Purpose                                                             |
| -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `health`                                                             | Liveness + tool list                                                |
| `get_context`                                                        | Focus, top open A/B work, this week’s plan glance                   |
| `search_nodes`                                                       | Filter outline (`type`, `state`, `focus`, `query`, `parentId`, …)   |
| `get_node`                                                           | One node by id                                                      |
| `create_node`                                                        | Create under `parentId` (`type`, `name`, optional priority/state/…) |
| `update_node`                                                        | Patch name/state/priority/deadline/focus/effort                     |
| `create_note` / `update_note` / `list_notes`                         | Capture markdown notes                                              |
| `get_week`                                                           | Week schedule + plan summary                                        |
| `create_appointment` / `update_appointment` / `delete_appointment`   | Light calendar writes                                               |
| `ensure_weekly_plan` / `update_weekly_plan` / `load_weekly_plan`     | Weekly plan read/write                                              |
| `upsert_plan_entry` / `set_focus_area` / `set_weekly_plan_completed` | Wizard-equivalent steps                                             |

### Example

```sh
curl -sS -X POST "http://localhost:3047/api/agent/get_context" \
  -H "Authorization: Bearer $PLANNER_AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Agent instructions repo

Day-to-day chat should open the **separate** `planner-agent` repository (prompts + skills),
not this app’s source tree. That repo documents conversation flows and points at this API.
