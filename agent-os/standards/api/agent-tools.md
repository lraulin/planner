# Agent tools

## Routing

- One tool per request: **`POST /api/agent/{tool}`** where `{tool}` is a stable snake_case
  name (`get_context`, `search_nodes`, …).
- Unknown tool → `not_found`.
- Body is the tool's argument object (JSON). No args → `{}`.
- **One write path** — tools call `src/lib/**` mutations/queries only. Do not reimplement
  SQL in the route handler.

## Canonical contract

Define every tool once in a registry containing its name, domain, intent description,
input/output schemas, effects, retry behavior, exposure, and handler. Generate HTTP
discovery, documentation, and future transports from that registry; prose catalogs are not
an independent source of truth.

## Design

1. **Prefer outcomes over endpoint primitives.** Batch repeated approved operations when a
   workflow would otherwise need three or more equivalent calls.
2. **Stable, action-oriented names.** Names are part of the agent contract; rename only
   with a deliberate version or dual-support window.
3. **Descriptions are selection instructions.** Say what the tool does, when to use it,
   when not to use it, its side effects and retry behavior, and what it returns.
4. **Focused exposure.** Keep the default active set small; expose domains on demand and
   identify legacy aliases rather than loading the whole catalog into context.
5. **Summary before detail.** Prefer `get_context`, filtered searches, and compact rows over
   full records. A strict general-purpose escape hatch is allowed when splitting creates
   overlaps or loses necessary full-form capability.
6. **Ids over paths.** Agents mutate UUIDs returned by search/read; human labels are for
   matching and display.
7. **Ask when ambiguous.** If a parent or target is unclear, ask rather than creating or
   changing the most plausible guess.

## Inputs

- The runtime validator and published JSON Schema come from the same strict schema.
- Reject unknown fields. Describe fields and declare required values, enums, defaults,
  nullability, and bounds.
- Prefer flat inputs with roughly eight top-level parameters. Nest only cohesive batches or
  justified full-form escape hatches.
- Validation errors name the field and a correction.

## Outputs

- Return IDs, human labels, and fields needed for the next decision.
- Lists use compact summaries and disclose returned count, total count, and whether more
  results exist. Full prose belongs in a targeted detail tool.
- Never silently truncate or place full prose blobs in summary results.
- Keep the stable HTTP envelope from `api/response-format.md`; tool output schemas describe
  the value under `data`.

## Safety and recovery

- Classify read/write behavior, destructive effects, confirmation needs, and idempotency.
- Enforce a retry guarantee with a natural key or transaction. Never claim retry safety
  across a non-atomic external side effect.
- Preserve user control before destructive or bulk work.
- Foreign rows are never exposed. Missing and foreign identifiers have the same `not_found`
  response shape.

## Testing

- Test registry/schema completeness, unknown-field rejection, HTTP envelopes, user
  isolation, truncation metadata, retry behavior, and documentation generation.
- Exercise representative tasks for selection accuracy, call count, response size, and
  error recovery. Prioritize plausible silent errors over exhaustive happy-path examples.
- Pure argument parsing/filtering → unit tests beside the module.
- Tool functions that touch the database → `*.integration.test.ts` with a second-user case.
- Route handlers remain thin wrappers (auth + dispatch); test both the registry boundary and
  representative HTTP envelopes.
