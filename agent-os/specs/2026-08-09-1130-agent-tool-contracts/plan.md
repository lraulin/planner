# Agent tool contracts

**Status: frozen / complete** (2026-08-09)
Spec folder: `agent-os/specs/2026-08-09-1130-agent-tool-contracts/`

This is the authoritative as-built record. This delta-spec extends the frozen AI
interoperability MVP with an executable contract
designed for agent discovery, reliable retries, and bounded context use. Existing HTTP
routes, tool names, response envelopes, and authentication remain compatible.

## Context

Planner's agent API grew from 26 manually dispatched tools. Tool names, argument parsing,
documentation, and the consumer agent's catalog became separate sources of truth. As a
result, unknown top-level arguments can be ignored silently, the static catalog has drifted,
list responses can spend context on full records, and important workflows require several
independent calls without a transactional boundary.

## Decisions

- Define every tool once in a typed Zod 4 registry containing its name, domain, intent,
  strict input and output schemas, effects, retry contract, exposure, examples, and handler.
- Publish JSON Schema draft 2020-12 from the runtime schemas. Discovery and generated
  Planner documentation consume the registry; a remote MCP transport remains out of scope.
- Preserve existing routes, names, success fields, authentication, and response envelopes.
  Reject unknown input fields instead of silently ignoring them.
- Add focused discovery with `list_tools` and `describe_tool`. The default core surface is
  small; domain tools are discoverable on demand and legacy aliases are opt-in.
- Prefer `capture_inbox` over `capture`, `search_notes` plus `get_note` over `list_notes`,
  and `update_weekly_plan_entries` over repeated weekly-plan mutations. Legacy endpoints
  remain callable during the compatibility window.
- Add additive offset pagination metadata to node, note, and metric list/search responses,
  plus bounded top-open-work metadata in `get_context`.
- Support optional paired `externalSource` and `externalId` natural keys for node, note,
  metric, and metric-entry creation. Replays return the existing row unchanged with
  `created: false`; successful new writes return `created: true`.
- Do not claim retry safety for appointment writes: Google synchronization can cross a
  non-atomic external boundary.
- Apply weekly-plan entry batches in one database transaction and preserve input order.
- Keep `planner-agent/tools.md` as a discovery bootstrap rather than an exhaustive second
  catalog, and provide deterministic manual eval fixtures instead of paid-model CI.
- No database migration is required because all supported entities already have external
  reference columns and per-user uniqueness constraints.

## Acceptance criteria

- [x] Every callable tool is represented by the canonical registry and has strict input and
      output schemas, effect/retry metadata, and a handler.
- [x] Unknown fields fail with an actionable validation error naming the field.
- [x] `health` retains `status` and `tools` and adds contract version/discovery pointers.
- [x] Default `list_tools` returns the focused core set; domain and legacy discovery work;
      `describe_tool` returns JSON Schema and the complete natural-language contract.
- [x] Existing endpoints and success fields remain compatible; preferred aliases work.
- [x] Search/list responses are compact and explicitly disclose truncation/pagination.
- [x] Natural-key retries are race-safe, user-scoped, and return the original unchanged row.
- [x] Weekly-plan entry batches are atomic, ordered, and isolated between users.
- [x] Planner API documentation is generated from the registry and the consumer agent uses
      live discovery rather than maintaining a second exhaustive catalog.
- [x] Unit, real-Postgres integration, HTTP boundary, lint, typecheck, build, page smoke, and
      read-only agent smoke gates pass.

## Changes from original plan

No material requirement, design, or scope changes were needed during implementation.

## Code map (as built)

| Concern                                 | Location                                                      |
| --------------------------------------- | ------------------------------------------------------------- |
| Runtime and published schemas           | `src/lib/agent/contracts.ts`                                  |
| Canonical registry, discovery, dispatch | `src/lib/agent/tools.ts`                                      |
| Compact paging and read shaping         | `src/lib/agent/pagination.ts`, domain tool modules            |
| Natural-key writes                      | `src/lib/{tree,notes,metrics}/mutations.ts`                   |
| Atomic weekly batch                     | `src/lib/planning/mutations.ts`, `src/lib/agent/planTools.ts` |
| HTTP boundary and smoke                 | `src/app/api/agent/[tool]/`, `scripts/smoke-agent.mjs`        |
| Generated contract documentation        | `scripts/generate-agent-docs.ts`, `docs/agent-api.md`         |
| Consumer bootstrap and eval fixtures    | sibling `planner-agent` repository                            |

## Verification

- The full Vitest suite passed against running Postgres, including every existing database
  integration suite and the new registry, HTTP, retry, pagination, batch rollback, and
  cross-user cases; no database suite skipped.
- ESLint, TypeScript, Prettier, and generated-document drift checks passed.
- The production build completed successfully.
- A fresh development server passed all 23 page routes plus five read-only agent contract
  checks (health, focused discovery, schema publication, context, strict rejection).
- No schema migration was generated or required.

---

## Task 1: Save the delta-spec — done

Record the approved scope, decisions, acceptance criteria, references, and applicable
standards before implementation.

## Task 2: Canonical registry and discovery — done

- Introduce Zod 4 and define a strict registry contract for every tool.
- Validate inputs and outputs at dispatch; translate schema errors into actionable agent
  errors.
- Add focused `list_tools` and `describe_tool` discovery, compatibility aliases, and health
  contract metadata.

## Task 3: Decision-ready reads — done

- Add offset pagination metadata to outline search, notes, metrics, and metric entries.
- Add bounded top-open-work metadata to context.
- Introduce compact `search_notes` results and targeted full-body `get_note`.

## Task 4: Retry-safe writes and batching — done

- Add natural-key idempotency to node, note, metric, and metric-entry creation through
  domain mutations.
- Add the atomic `update_weekly_plan_entries` workflow tool.
- Prove user isolation, replay behavior, input ordering, and rollback.

## Task 5: Documentation, standards, and consumer — done

- Generate `docs/agent-api.md` from the registry.
- Expand `agent-os/standards/api/agent-tools.md` and rebuild the standards index.
- Replace the sibling consumer's static catalog with discovery guidance; update skills and
  add manual eval fixtures with expected call sequences and budgets.

## Task 6: Verification and freeze — done

- Run focused and full unit/integration tests against Postgres.
- Run lint, typecheck, format check, production build, page smoke, and agent smoke.
- Record the as-built code map, update roadmap wording, complete acceptance criteria, and
  freeze the spec.

## Follow-ups (new work — not amendments to this frozen spec)

- Package the registry as a remote MCP transport when public endpoint/auth work is ready.
- Retire legacy aliases only through a separately planned compatibility/version change.
- Automate model-based selection evals only if manual fixtures reveal enough recurring
  failures to justify provider cost and nondeterminism in CI.

## Out of scope

- Remote MCP transport or server packaging
- New authentication or authorization models
- In-app chatbot or model-provider integration
- Paid-model evaluation in CI
- Generic idempotency ledger or appointment batching/retry guarantees
