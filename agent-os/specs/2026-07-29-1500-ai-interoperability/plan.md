# AI Interoperability MVP

**Status: frozen / complete** (2026-07-29)  
Spec folder: `agent-os/specs/2026-07-29-1500-ai-interoperability/`

## Context

Phase 1 tabs and the weekly planning wizard were in place. Roadmap Phase 3 near-term called
for tooling so an agent can operate the planner without Bedrock. The app replaces markdown
memory from `personal-assistant-docs`; Grok Build / Claude Code are the chat surface for now.

## Decisions (as-built)

| Topic     | Decision                                                                            |
| --------- | ----------------------------------------------------------------------------------- |
| Delivery  | `POST /api/agent/{tool}` in planner + separate `planner-agent` repo                 |
| Auth      | Bearer `PLANNER_AGENT_API_KEY`; identity via `getCurrentUserId()`                   |
| Envelope  | `{ ok, data }` / `{ ok, error: { code, message } }`                                 |
| Domain    | `src/lib/agent/tools.ts` dispatches to existing `src/lib/**` only                   |
| Search    | In-memory filter on `loadOutline` (`filterOutline`) — personal scale                |
| Standards | `agent-os/standards/api/{response-format,error-handling,agent-auth,agent-tools}.md` |

### Out of scope (still)

In-app chatbot, Bedrock, Better Auth, Alfred, MCP-first packaging, content migration from
personal-assistant-docs.

## Acceptance criteria

- [x] Authenticated agent can read compact context (`get_context`)
- [x] Search/create/update outline; mark done works
- [x] Notes create/list with optional node link
- [x] Week schedule read + appointment create/update/delete
- [x] Weekly plan tools for interactive plan-week skill
- [x] Bearer key required; domain errors scoped by userId (integration tests)
- [x] `api/*` standards written and indexed
- [x] Separate `planner-agent` repo with prompts, skills, tools.md, call-tool.sh
- [x] Smoke: health, context, create task, complete, note, get_week, call-tool.sh

## Changes from original plan

| #   | Change                                                          | Why                                                         |
| --- | --------------------------------------------------------------- | ----------------------------------------------------------- |
| 1   | Single `tools.ts` module rather than many `tools/*.ts` files    | Small surface; one dispatch table is easier to scan for MVP |
| 2   | `dispatchAgentTool` normalizes domain errors via `toAgentError` | Integration tests and HTTP share the same error codes       |

## Follow-ups (new work — not amendments to this frozen spec)

- Map API key → real user after Better Auth
- MCP server wrapping the same tools
- In-app or Bedrock-hosted assistant
- Migrate personal-assistant-docs content
- Set `PLANNER_AGENT_API_KEY` in Vercel production env
- Alfred / quick capture hitting the same API

## Implementation map

| Area                     | Location                                          |
| ------------------------ | ------------------------------------------------- |
| Auth / envelope / search | `src/lib/agent/`                                  |
| Tool dispatch            | `src/lib/agent/tools.ts`                          |
| Route                    | `src/app/api/agent/[tool]/route.ts`               |
| Docs                     | `docs/agent-api.md`, `contracts.md` (this folder) |
| Agent package            | sibling repo `planner-agent`                      |
