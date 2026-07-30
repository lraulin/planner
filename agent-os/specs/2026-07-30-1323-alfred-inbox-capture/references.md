# References for Alfred Inbox Capture

## Frozen specs (do not edit)

### Inbox & quick capture — `2026-07-30-1018-inbox-quick-capture`

- **Relevance:** Owns Inbox (`is_inbox`), `ensureInbox`, `captureItems`, hierarchy
  relaxation. Explicitly deferred Alfred as follow-up.
- **Key patterns:** Capture always goes through `captureItems`; unparented task ≠ inbox.

### AI interoperability — `2026-07-29-1500-ai-interoperability`

- **Relevance:** Agent HTTP surface, Bearer auth, tool registry, response envelope.
- **Key patterns:** Thin route → `dispatchAgentTool` → `src/lib/**` mutations.

## Similar implementations

### Capture mutations

- **Location:** `src/lib/capture/mutations.ts`, `src/lib/capture/parse.ts`
- **Relevance:** Sole write path for inbox capture; Alfred must not invent a second path.
- **Key patterns:** `ensureInbox` creates/reopens; `captureItems` with omitted parentId.

### Agent tools

- **Location:** `src/lib/agent/tools.ts`, `tools.integration.test.ts`
- **Relevance:** How to register a tool, parse args, return node summaries, cross-user tests.
- **Key patterns:** `requireString` / `optionalString`; return `getNode`-style summaries.

### Agent API docs

- **Location:** `docs/agent-api.md`
- **Relevance:** Live contract consumers (including Alfred) read.

### Capture integration tests

- **Location:** `src/lib/capture/mutations.integration.test.ts`
- **Relevance:** Inbox lifecycle invariants already pinned; agent capture should not re-test
  every edge, only that the tool routes into that path and isolates users.
