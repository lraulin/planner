# Standards for AI Interoperability MVP

The following standards apply to this work.

---

## development/testing

See `agent-os/standards/development/testing.md` (full text).

Tripwire tests: pure logic in `src/lib/**`, database mutations/queries as integration tests with cross-user cases. No React component tests. Agent HTTP handlers stay thin — test auth/envelope/filter helpers and tool orchestration that touches the DB.

---

## api/response-format

See `agent-os/standards/api/response-format.md`.

Agent routes return a JSON envelope: `{ ok: true, data }` or `{ ok: false, error: { code, message } }`.

---

## api/error-handling

See `agent-os/standards/api/error-handling.md`.

Stable error codes: `unauthorized`, `validation`, `not_found`, `conflict`, `internal`.

---

## api/agent-auth

See `agent-os/standards/api/agent-auth.md`.

`Authorization: Bearer <PLANNER_AGENT_API_KEY>`. Fail closed if key unset. Wrong/missing → 401.

---

## api/agent-tools

See `agent-os/standards/api/agent-tools.md`.

Tool-oriented `POST /api/agent/{tool}`; prefer summary tools; no dual write path — call `src/lib/**` only.
