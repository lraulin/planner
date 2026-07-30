# Alfred Inbox Capture

**Status: frozen / complete** (2026-07-30)  
Spec folder: `agent-os/specs/2026-07-30-1323-alfred-inbox-capture/`

## Context

Phase 2 **external intake** after the frozen in-app inbox
(`specs/2026-07-30-1018-inbox-quick-capture`). Capture only works when the browser app is
open; the point of GTD capture is getting ideas out of your head wherever you are.

Roadmap stages external intake as:

1. Apple Reminders drain (Shortcut) — needs provenance/dedupe; later
2. **Alfred on macOS** — one task at a time, same agent HTTP surface — **this slice**

In-app capture writes via `ensureInbox` + `captureItems`. The agent tool `create_node`
without `parentId` creates a **root-level** task, which is _not_ the inbox (frozen
decision: unparented ≠ unprocessed). Alfred therefore needs a thin **`capture`** agent
tool that reuses the inbox path, plus a committed Alfred workflow under `tools/alfred/`.

Delta on frozen specs (do not edit them):

- `2026-07-30-1018-inbox-quick-capture` — deferred Alfred; owns Inbox + `ensureInbox`
- `2026-07-29-1500-ai-interoperability` — owns agent tool registry and Bearer auth

## Decisions

| Topic                        | Decision                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| Scope                        | **Alfred only** — not Reminders Shortcut, not Raycast, not provenance column                      |
| Landing place                | **Inbox project** via `ensureInbox`, same as in-app `c` capture                                   |
| API surface                  | New tool **`POST /api/agent/capture`** — `{ "name": "…" }` (+ optional `note`)                    |
| Implementation               | Call existing `captureItems` / `ensureInbox` from `src/lib/capture/mutations.ts` — one write path |
| Not `create_node` into inbox | Omitting parentId means root task; do not overload that semantics                                 |
| Alfred packaging             | In this repo: `tools/alfred/` (scripts + README; build the workflow from sources)                 |
| Auth                         | Existing `PLANNER_AGENT_API_KEY` Bearer → owner user                                              |
| Config                       | Workflow needs base URL + API key as Alfred variables; never commit secrets                       |
| UX                           | Keyword `pin`, type name, Enter → POST → notification success/fail                                |
| Out of scope                 | Multi-line bulk paste, priority/effort in Alfred, Reminders, `external_id` dedupe, MCP            |

## Acceptance criteria

- [x] `POST /api/agent/capture` with a name creates a task under the user's Inbox (creates/reopens Inbox as needed)
- [x] Empty or whitespace-only name → `validation` error
- [x] Tool appears on `health` tools list and in `docs/agent-api.md`
- [x] Integration test: capture lands under `is_inbox` project; second user cannot see first user's captured node
- [x] Alfred workflow sources + setup README under `tools/alfred/`
- [x] Tests + typecheck + lint + build green (integration suite includes capture cases)
- [x] Roadmap: Alfred external intake delivered; Reminders remains remaining work

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code
polish.

| #   | Change                                                     | Why                                                                                                            |
| --- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | No binary `.alfredworkflow` export — scripts + README only | Avoids committing opaque zip/binary; rebuild from documented steps is enough for a personal Powerpack workflow |
| 2   | Optional `note` + `##` split in shell scripts              | Cheap and matches Achieve-style one-liners without expanding the Alfred UI                                     |

## Follow-ups (new work — not amendments to this frozen spec)

| Follow-up                    | Note                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| **Apple Reminders drain**    | Shortcut POSTing to `capture` (or create_node under inbox); needs provenance/dedupe column |
| **Raycast extension**        | Same HTTP surface if useful later                                                          |
| **MCP packaging of capture** | Thin wrapper when remote MCP is built                                                      |

---

## Task 1: Save Spec Documentation

Done: this folder with `plan.md`, `shape.md`, `standards.md`, `references.md`.

## Task 2: Agent tool `capture`

Done: `src/lib/agent/tools.ts`, integration tests, `docs/agent-api.md`.

## Task 3: Alfred workflow package

Done: `tools/alfred/README.md`, `capture.sh`, `run-script.sh`.

## Task 4: Verify, freeze spec, update roadmap

Done: unit + integration + typecheck + lint + build; freeze; roadmap update.
