# References for Agent tool contracts

## Planner source

- `src/lib/agent/tools.ts` and adjacent domain tool modules — current name inventory,
  dispatch, manual parsing, and response shaping.
- `src/app/api/agent/[tool]/route.ts` — stable HTTP/auth/envelope boundary.
- `src/lib/tree/{queries,mutations}.ts`, `src/lib/notes/`, `src/lib/metrics/`, and
  `src/lib/planning/` — domain-owned query and mutation paths.
- `src/db/schema.ts` — existing external reference columns and per-user unique indexes.
- `docs/agent-api.md` — Planner-side contract documentation to generate from the registry.
- `scripts/smoke.mjs` — existing route smoke conventions.

## Prior specs

- `agent-os/specs/2026-07-29-1500-ai-interoperability/` — frozen HTTP agent API this
  delta extends.
- `agent-os/specs/2026-07-30-1018-inbox-quick-capture/` and
  `agent-os/specs/2026-07-30-1323-alfred-inbox-capture/` — inbox capture semantics and
  idempotent external references.
- `agent-os/specs/2026-07-28-2144-weekly-planning-wizard/` — weekly review and commitment
  workflow semantics.
- `agent-os/specs/2026-08-02-0912-metrics-tab/` — metric and entry model.

## Consumer

- `../planner-agent/AGENTS.md`, `tools.md`, and `skills/*/SKILL.md` — instructions that must
  bootstrap from live discovery rather than duplicate the server contract.
