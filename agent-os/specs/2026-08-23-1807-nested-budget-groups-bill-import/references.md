# References

## Governing specs

- `agent-os/specs/2026-08-22-1948-zero-based-budget/plan.md`
- `agent-os/specs/2026-08-22-2124-actual-schedules/plan.md`
- `agent-os/specs/2026-08-22-2242-budget-goal-templates/plan.md`
- `agent-os/specs/2026-08-23-1536-finance-rules/plan.md`
- `agent-os/specs/2026-08-21-1122-commitments-curation/plan.md`
- `agent-os/specs/2026-08-23-1041-payee-matcher-cutover/plan.md`
- `agent-os/specs/README.md`

## Product and reference implementations

- `agent-os/product/mission.md`
- `agent-os/product/roadmap.md`
- `docs/actual-budget/README.md`
- `../actual/packages/loot-core/src/server/sql/init.sql` — Actual's flat category-group schema.

## Existing implementation seams

- `src/db/schema.ts` — budget groups, envelopes, schedules, and transaction joins.
- `src/lib/finances/budget/` — envelope arithmetic, row shaping, templates, and mutations.
- `src/lib/finances/schedules/` — source-bill import, matching, and Post now.
- `src/lib/finances/classify/categories.ts` and `src/lib/finances/rules/` — fixed taxonomy
  and user-owned rule actions.
- `src/components/finances/budget/` — Budget grid and structure-management drawer.
