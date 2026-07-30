# Alfred Inbox Capture — Shaping Notes

**Status: frozen / complete** (2026-07-30)

## Scope

macOS **Alfred** one-at-a-time task capture into the planner **Inbox**, via agent tool
`capture` that reuses `ensureInbox` / `captureItems`.

### Out of scope

- Apple Reminders Shortcut and any `external_id` / provenance / dedupe column
- Raycast extension
- Multi-line bulk paste, priority / effort / project fields in Alfred
- Changing the meaning of root-level `create_node` (unparented remains legal and non-inbox)
- MCP packaging of capture
- In-app UI changes
- Binary `.alfredworkflow` in git (sources + rebuild instructions only)

## Decisions

- **Why a new `capture` tool, not `create_node`:** Omitting `parentId` on `create_node`
  intentionally creates a top-level task. That is a legitimate resting state and must not
  mean "unprocessed." The inbox is a flagged project; only `ensureInbox` + create-under
  preserves that invariant.
- **Why Alfred before Reminders:** One task at a time, no re-import risk, no schema change.
  Reminders needs a provenance column for safe drain.
- **Why package in this repo:** Same place as the API it calls; `tools/alfred/` is
  discoverable next to the app. Secrets stay in Alfred workflow variables / local env.
- **Keyword `pin`:** Short, free of common app conflicts; changeable in Alfred after setup.

## Context

- **Visuals:** None
- **References:** See `references.md` — inbox capture lib, agent tools, two frozen specs
- **Product alignment:** Roadmap Phase 2 "External intake → Alfred"; mission GTD capture

## Standards Applied

- **api/response-format** — Alfred parses `{ ok, data }` / `{ ok, error }`
- **api/error-handling** — empty name → `validation`
- **api/agent-auth** — Bearer key maps to owner user
- **api/agent-tools** — one tool per POST; one write path through `src/lib/**`
- **development/testing** — integration + cross-user on the capture tool

## Verification

- `npm run test:unit` — pass
- `npm run test:integration` — pass (no skip warning); capture cases in
  `tools.integration.test.ts`
- `npm run typecheck && npm run lint && npm run build` — pass
