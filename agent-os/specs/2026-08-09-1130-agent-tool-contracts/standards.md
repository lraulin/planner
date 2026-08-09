# Standards for Agent tool contracts

**Status: frozen / complete** (2026-08-09)

The following standards govern this work. `api/agent-tools.md` is deliberately expanded as
part of the implementation; the canonical amended wording is recorded here before code.

## api/agent-tools

**Why it applies:** This change replaces a manual agent API surface with an executable,
discoverable contract while preserving the HTTP boundary.

### Routing

- One tool per request: `POST /api/agent/{tool}` using a stable snake_case name.
- Unknown tool returns `not_found`. No arguments means `{}`.
- One write path: tools call `src/lib/**` domain mutations/queries and never reimplement SQL
  in the route handler.

### Canonical contract

- Define every tool once in a registry: name, domain, intent description, input/output
  schemas, effects, retry behavior, exposure, and handler.
- Generate HTTP discovery, documentation, and future transports from that registry; prose
  catalogs are not an independent source of truth.

### Design

- Prefer complete outcomes over endpoint primitives. Batch repeated approved operations
  when a workflow would otherwise need three or more equivalent calls.
- Use stable snake_case action names.
- Descriptions say what the tool does, when to use it, when not to use it, its side effects
  and retry behavior, and what it returns.
- Keep the default active set focused; expose domains on demand and identify legacy aliases.
- A strict general-purpose escape hatch is allowed when splitting creates overlaps or loses
  necessary full-form capability.
- Prefer summary tools and targeted detail. Use UUIDs as stable keys and include human labels
  for matching. Ask rather than guess when a parent or target is ambiguous.

### Inputs

- The runtime validator and published JSON Schema come from the same strict schema.
- Reject unknown fields. Describe fields and declare required values, enums, defaults,
  nullability, and bounds.
- Prefer flat inputs with roughly eight top-level parameters. Nest only cohesive batches or
  justified full-form escape hatches.
- Validation errors name the field and a correction.

### Outputs

- Return IDs, human labels, and fields needed for the next decision.
- Lists use compact summaries and disclose returned count, total count, and whether more
  results exist. Full prose belongs in a targeted detail tool.
- Never silently truncate or place full prose blobs in summary results.

### Safety and recovery

- Classify read/write, destructive behavior, confirmation needs, and idempotency.
- Enforce a retry guarantee with a natural key or transaction; never claim it across a
  non-atomic external side effect.
- Preserve user control before destructive or bulk work. Foreign rows are never exposed;
  they look not found.

### Testing

- Test registry/schema completeness, unknown-field rejection, HTTP envelopes, user
  isolation, truncation metadata, retries, and documentation generation.
- Exercise representative tasks for selection, call count, response size, and error
  recovery. Prioritize plausible silent failures.
- Pure parsing/filtering tests live beside their modules; database behavior uses real
  Postgres integration tests with a second user.

## api/response-format

**Why it applies:** Existing clients depend on one stable envelope while tool payloads gain
new additive fields.

- Success is HTTP 200 with `{ "ok": true, "data": ... }`.
- Failure is `{ "ok": false, "error": { "code", "message" } }` with no internal details.
- Request and response bodies are JSON; dates are ISO-8601 strings.

## api/error-handling

**Why it applies:** Strict schema failures and ownership checks must be actionable without
leaking row existence or implementation details.

- Use `unauthorized` 401, `validation` 400, `not_found` 404, `conflict` 409, and `internal`
  500 consistently.
- Foreign identifiers return the same `not_found` result as missing identifiers.
- Validation errors name the bad field and expected correction when practical.

## development/testing

**Why it applies:** The contract adds pure schema/discovery logic and database-backed retry
and transaction invariants.

- Pure logic in `src/lib/**` has adjacent unit tests that fail on plausible mistakes.
- Database queries/mutations have real-Postgres `*.integration.test.ts` coverage and prove a
  second user cannot read, change, or delete another user's row.
- Do not mock Drizzle, write snapshots, or add React component tests.
- Run the full test suite and confirm database tests did not skip.
- After changing `src/app/**`, start the development server and run the route smoke suite.

## development/clean-code

**Why it applies:** The registry is a new shared boundary and must reduce, not redistribute,
contract duplication.

- Keep routes thin and real logic in `src/lib/**`; dependencies point toward domain code and
  the database.
- Every mutation takes `userId` first and scopes on it.
- Use one implementation for each business rule, explicit data flow, small named units, and
  boring consistency.
- New dependencies and abstractions require a reason in the spec; Zod is introduced because
  one executable schema must power validation and JSON Schema publication.
