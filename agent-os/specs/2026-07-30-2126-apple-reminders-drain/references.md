# References for Apple Reminders Drain

## Frozen specs (do not edit)

### Alfred inbox capture — `2026-07-30-1323-alfred-inbox-capture`

- **Relevance:** The direct predecessor. Owns the `capture` agent tool this extends, and
  listed "Apple Reminders drain — needs provenance/dedupe column" as its first follow-up.
- **Key patterns:** Package the client under `tools/<host>/` as scripts + README, never a
  binary export; secrets stay in host-side variables. Its "Production (real app) setup"
  section — Vercel env, Deployment Protection options A/B, the
  `x-vercel-protection-bypass` header — applies verbatim to the Shortcut and should be
  cross-referenced rather than re-derived.

### Inbox & quick capture — `2026-07-30-1018-inbox-quick-capture`

- **Relevance:** Owns Inbox (`is_inbox`), `ensureInbox`, `captureItems`, hierarchy
  relaxation. Its follow-up table is where the provenance column was first specified.
- **Key patterns:** Capture always goes through `captureItems`; an unparented task is _not_
  the inbox.

### AI interoperability — `2026-07-29-1500-ai-interoperability`

- **Relevance:** Agent HTTP surface, Bearer auth, tool registry, response envelope.
- **Key patterns:** Thin route → `dispatchAgentTool` → `src/lib/**` mutations.

## Similar implementations

### Alfred workflow package

- **Location:** `tools/alfred/README.md`, `capture.sh`, `run-script.sh`
- **Relevance:** The packaging model to mirror in `tools/shortcuts/` — prerequisites, a
  curl smoke test that works before the GUI is built, step-by-step host setup, a
  production section covering Deployment Protection, and a troubleshooting table.

### Capture mutations

- **Location:** `src/lib/capture/mutations.ts`, `src/lib/capture/parse.ts`
- **Relevance:** The sole write path. Dedupe belongs here, not in the tool or the route, so
  in-app capture and every future external source get it for free.
- **Key patterns:** `ensureInbox` creates/reopens; `captureItems` walks `parentAtDepth` to
  turn indentation into subtasks — a deduped item still has to hold its slot in that array.

### Node creation

- **Location:** `src/lib/tree/mutations.ts` (`createNode`)
- **Relevance:** Where the new `external_source` / `external_id` values reach the insert.
- **Key patterns:** Optional fields default in the destructure and flow into one
  `values(...)` call inside the transaction that also writes the per-type detail row.

### Schema flags and partial indexes

- **Location:** `src/db/schema.ts` — `isInbox` + `nodes_one_inbox_per_user_uq`
- **Relevance:** The existing precedent for a user-scoped partial unique index, and for
  documenting _why_ a column exists rather than what it holds.

### Agent tools

- **Location:** `src/lib/agent/tools.ts`, `src/lib/agent/parse.ts`
- **Relevance:** How to parse args, return node summaries, and raise `AgentError`.
- **Key patterns:** `requireString` / `optionalString` / `parseDate` helpers; `captureTool`
  is the function being extended.

### Tests

- **Location:** `src/lib/capture/mutations.integration.test.ts`,
  `src/lib/agent/tools.integration.test.ts`
- **Relevance:** Existing inbox invariants and the cross-user pattern every DB test here
  must follow.

### Agent API docs

- **Location:** `docs/agent-api.md`
- **Relevance:** The live contract consumers read; the `capture` section needs the batch
  form.
